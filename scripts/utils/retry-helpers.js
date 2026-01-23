/**
 * Retry helper utilities shared between conversation-engine, tool-loop-handler, and ai-client.
 * Extracted to eliminate DRY violations.
 */

import { AI_ERROR_CODES } from '../core/ai-client.js';
import { emitRetryStatus } from '../core/hook-manager.js';

// Re-export emitProcessStatus from hook-manager for backward compatibility
export { emitProcessStatus } from '../core/hook-manager.js';

// ============================================================================
// ABORT HANDLING UTILITIES
// ============================================================================

/**
 * Create a standardized AbortError
 * @returns {Error} An Error with name='AbortError' and message='Process was cancelled'
 */
export function createAbortError() {
  const error = new Error('Process was cancelled');
  error.name = 'AbortError';
  return error;
}

/**
 * Check if an error represents an abort/cancellation
 * @param {Error} error - The error to check
 * @param {AbortSignal|null} signal - Optional abort signal to also check
 * @returns {boolean}
 */
export function isAbortError(error, signal = null) {
  if (signal?.aborted) return true;
  if (error?.name === 'AbortError') return true;
  if (error?.message?.includes('aborted')) return true;
  return false;
}

/**
 * Throw an AbortError if the signal is aborted
 * @param {AbortSignal|null} signal - The abort signal to check
 * @throws {Error} AbortError if signal is aborted
 */
export function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

// ============================================================================
// RETRY LOGIC UTILITIES
// ============================================================================

/** Default retry configuration */
export const DEFAULT_RETRY_CONFIG = Object.freeze({
  maxRetries: 5,
  initialDelayMs: 250,
  jitter: true,
});

/**
 * Check if a response indicates a tool call failure
 * @param {object} response - AI response to check
 * @returns {boolean}
 */
export function isToolCallFailure(response) {
  return response?.errorCode === AI_ERROR_CODES.TOOL_CALL_FAILURE;
}

/**
 * Check if an error or HTTP status is retryable
 * @param {Error|null} error - The error to check (for message-based detection)
 * @param {number|null} status - HTTP status code (if available)
 * @returns {boolean}
 */
export function isRetryableError(error, status = null) {
  // HTTP status-based check
  if (status !== null) {
    if (status === 429 || status >= 500) return true;
  }
  // Error message-based check (for Gemini/fetch errors)
  if (error?.message) {
    const msg = error.message;
    if (msg.includes('429') || msg.includes('500') || msg.includes('503') || msg.includes('fetch failed')) {
      return true;
    }
  }
  return false;
}

/**
 * Calculate retry delay with exponential backoff and optional jitter
 * @param {number} attempt - Current attempt (0-indexed)
 * @param {number} initialDelayMs - Base delay in milliseconds
 * @param {boolean} jitter - Whether to add random jitter
 * @returns {number} Delay in milliseconds
 */
export function calculateRetryDelay(attempt, initialDelayMs = 250, jitter = true) {
  const baseDelay = initialDelayMs * Math.pow(2, attempt);
  return jitter ? baseDelay + Math.random() * 100 : baseDelay;
}

/**
 * Execute a delay with abort signal support and retry status emission
 * @param {number} delayMs - Delay in milliseconds
 * @param {AbortSignal|null} signal - Abort signal
 * @param {string|null} retryCallId - ID for retry status emission (null to skip emission)
 * @throws {Error} AbortError if cancelled during delay
 */
export async function executeRetryDelay(delayMs, signal, retryCallId = null) {
  try {
    await delayWithSignal(delayMs, signal);
  } catch (delayError) {
    // Delay was aborted - clean up and re-throw as abort
    if (retryCallId) {
      emitRetryStatus('end', retryCallId);
    }
    throw createAbortError();
  }
}

/**
 * Build a human-readable retry label
 * @param {number} attempt - Current attempt number
 * @param {number} maxAttempts - Maximum attempts allowed
 * @returns {string}
 */
export function buildRetryLabel(attempt, maxAttempts) {
  return `Retrying request (attempt ${attempt} of ${maxAttempts})...`;
}

/**
 * Build a connection error retry label
 * @param {number} nextAttempt - Next attempt number (1-indexed)
 * @param {number} maxAttempts - Maximum attempts allowed
 * @returns {string}
 */
export function buildConnectionRetryLabel(nextAttempt, maxAttempts) {
  return `Connection Error, Retrying (${nextAttempt}/${maxAttempts})...`;
}

/**
 * Get retry delay in milliseconds based on attempt index
 * @param {number} previousAttemptIndex - 0-indexed attempt number
 * @param {number[]} delaySchedule - Array of delay values in ms
 * @returns {number}
 */
export function getRetryDelayMs(previousAttemptIndex, delaySchedule = [1000, 2000]) {
  if (previousAttemptIndex < 0) return 0;
  return delaySchedule[Math.min(previousAttemptIndex, delaySchedule.length - 1)] || 0;
}

/**
 * Create a promise that resolves after a delay, with abort signal support
 * @param {number} ms - Delay in milliseconds
 * @param {AbortSignal|null} signal - Optional abort signal
 * @returns {Promise<void>}
 */
export function delayWithSignal(ms, signal) {
  if (!ms) {
    if (signal?.aborted) {
      throw new Error('Process was cancelled');
    }
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Process was cancelled'));
      return;
    }

    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new Error('Process was cancelled'));
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * Build a generic failure message for when all retry attempts are exhausted
 * @returns {object}
 */
export function buildGenericFailureMessage() {
  return {
    role: 'assistant',
    content:
      'Unable to generate a proper response after multiple attempts. Please try rephrasing your request.',
    display: '❌ Unable to generate a proper response after multiple attempts.',
  };
}
