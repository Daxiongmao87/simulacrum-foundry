/**
 * Simulacrum Hook Manager - Centralized hook management
 * Provides constants and helpers for all Simulacrum hooks
 */

/**
 * Hook name constants
 * @readonly
 * @enum {string}
 */
export const SimulacrumHooks = Object.freeze({
  // Process lifecycle hooks
  PROCESS_STATUS: 'simulacrum:processStatus',
  PROCESS_CANCELLED: 'simulacrum:processCancelled',
  RETRY_STATUS: 'simulacrum:retryStatus',

  // Document operation hooks
  DOCUMENT_CHANGED: 'simulacrum:documentChanged',

  // Conversation hooks
  CONVERSATION_STARTED: 'simulacrum:conversationStarted',
  CONVERSATION_CLEARED: 'simulacrum:conversationCleared',

  // AI response hooks
  AI_RESPONSE_RECEIVED: 'simulacrum:aiResponseReceived',

  // Tool execution hooks
  TOOL_EXECUTED: 'simulacrum:toolExecuted',

  // Task tracker hooks
  TASK_STARTED: 'simulacrum:taskStarted',
  TASK_UPDATED: 'simulacrum:taskUpdated',
  TASK_FINISHED: 'simulacrum:taskFinished',

  // Error hooks
  ERROR_OCCURRED: 'simulacrum:errorOccurred',
});

/**
 * Emit a hook safely (handles missing Hooks global)
 * @param {string} hookName - Hook name to emit
 * @param {any} payload - Hook payload
 */
export function emitHook(hookName, payload) {
  try {
    if (typeof Hooks !== 'undefined' && typeof Hooks.call === 'function') {
      Hooks.call(hookName, payload);
    }
  } catch (_e) {
    // Silently ignore hook errors
  }
}

/**
 * Emit process status update
 * @param {string} state - 'start' or 'end'
 * @param {string} callId - Unique call identifier
 * @param {string|null} [label] - Optional label for start state
 * @param {string|null} [toolName] - Optional tool name
 */
export function emitProcessStatus(state, callId, label = null, toolName = null) {
  const payload =
    state === 'start'
      ? { state, callId, label, toolName: toolName || 'process' }
      : { state, callId };
  emitHook(SimulacrumHooks.PROCESS_STATUS, payload);
}

/**
 * Emit process cancelled event
 */
export function emitProcessCancelled() {
  emitHook(SimulacrumHooks.PROCESS_CANCELLED, {});
}

/**
 * Emit retry status update
 * @param {string} state - 'start' or 'end'
 * @param {string} callId - Unique retry call identifier
 * @param {string|null} [label] - Optional label for retry attempt
 */
export function emitRetryStatus(state, callId, label = null) {
  const payload = state === 'start' ? { state, callId, label } : { state, callId };
  emitHook(SimulacrumHooks.RETRY_STATUS, payload);
}

/**
 * Emit document changed event
 * @param {string} documentType - Document type
 * @param {string} action - Action performed (create, update, delete)
 * @param {Object} document - The document that changed
 */
export function emitDocumentChanged(documentType, action, document) {
  emitHook(SimulacrumHooks.DOCUMENT_CHANGED, { type: documentType, action, document });
}

/**
 * Emit tool executed event
 * @param {string} toolName - Tool name
 * @param {Object} params - Tool parameters
 * @param {Object} result - Tool result
 */
export function emitToolExecuted(toolName, params, result) {
  emitHook(SimulacrumHooks.TOOL_EXECUTED, { toolName, params, result });
}

/**
 * Emit error occurred event
 * @param {Error} error - The error that occurred
 * @param {string} context - Context where error occurred
 */
export function emitErrorOccurred(error, context) {
  emitHook(SimulacrumHooks.ERROR_OCCURRED, {
    message: error?.message || String(error),
    context,
    error,
  });
}
