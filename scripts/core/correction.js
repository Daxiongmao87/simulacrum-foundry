/**
 * Shared correction helpers for empty-content assistant responses.
 * Ensures the conversation captures a failed assistant turn and a system
 * instruction before retrying, so the next AI call receives corrective context.
 */

/**
 * Append assistant+system correction messages for a text-only response (missing tool call).
 * In the autonomous tool loop, the AI MUST respond with a tool call - text-only responses
 * are rejected. To exit the loop, the AI must call `end_loop`.
 *
 * @param {object} conversationManager - Conversation manager instance
 * @param {object|string} errorResponse - Normalized AI response or correction message string
 */
export function appendEmptyContentCorrection(conversationManager, errorResponse) {
  if (!conversationManager) return;

  // Support both object and string inputs
  const content = typeof errorResponse === 'string'
    ? errorResponse
    : errorResponse?.content || 'No tool call detected';

  // Reconstruct the assistant's failed message as a combined content turn.
  // NOTE: We intentionally do NOT include tool_calls in the correction message.
  // If we added tool_calls here, we'd also need to add corresponding tool response
  // messages, otherwise Mistral (and other strict APIs) will fail with:
  // "Not the same number of function calls and responses"
  const combinedContent = `(Response rejected: ${content})`;

  // Add the assistant failed turn WITHOUT tool_calls to avoid message parity issues
  // Mark as _internal so it's not displayed to users on reload
  conversationManager.addMessage('assistant', combinedContent, null, null, { _internal: true });

  // Add a system instruction explicitly requiring tool call to exit
  const systemInstruction =
    'Your previous response was rejected because it contained no tool call. You are in an autonomous tool execution loop - text-only responses are NOT valid. To exit this loop, you MUST call the `end_loop` tool. Your text is already displayed to the user.';
  conversationManager.addMessage('system', systemInstruction);
}

/**
 * Append assistant/system correction messages for malformed tool call responses.
 * Ensures the next retry has natural-language context instead of repeating the
 * invalid tool invocation.
 *
 * @param {object} conversationManager - Conversation manager instance
 * @param {object} errorResponse - Normalized AI response with raw provider payload
 */
export function appendToolFailureCorrection(conversationManager, errorResponse) {
  if (!conversationManager) return;

  const functionName = (() => {
    try {
      const candidates = errorResponse?._originalResponse?.candidates || [];
      for (const candidate of candidates) {
        const parts = candidate?.content?.parts || [];
        for (const part of parts) {
          if (part?.functionCall?.name) {
            return part.functionCall.name;
          }
        }
      }
    } catch (_e) {
      /* ignore */
    }
    return null;
  })();

  const assistantSummary = functionName
    ? `Previous tool call "${functionName}" failed because the provider reported malformed arguments. The tool call has been removed.`
    : 'Previous tool call failed because the provider reported malformed arguments. The malformed tool call has been removed.';

  // Mark as _internal so it's not displayed to users on reload
  conversationManager.addMessage('assistant', assistantSummary, null, null, { _internal: true });

  const systemInstruction =
    'Your last reply attempted to call a tool with invalid or malformed arguments. Provide corrected arguments if a tool call is still required, or respond in plain language without using tools.';
  conversationManager.addMessage('system', systemInstruction);
}
