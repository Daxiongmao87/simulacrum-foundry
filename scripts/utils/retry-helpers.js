/**
 * Retry helper utilities shared between conversation-engine and tool-loop-handler.
 * Extracted to eliminate DRY violations.
 */

import { AI_ERROR_CODES } from '../core/ai-client.js';

/**
 * Check if a response indicates a tool call failure
 * @param {object} response - AI response to check
 * @returns {boolean}
 */
export function isToolCallFailure(response) {
  return response?.errorCode === AI_ERROR_CODES.TOOL_CALL_FAILURE;
}

// Re-export emitProcessStatus from hook-manager for backward compatibility
export { emitProcessStatus } from '../core/hook-manager.js';

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
