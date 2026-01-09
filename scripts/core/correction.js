/**
 * Shared correction helpers for empty-content assistant responses.
 * Ensures the conversation captures a failed assistant turn and a system
 * instruction before retrying, so the next AI call receives corrective context.
 */

/**
 * Append assistant+system correction messages for an empty-content response.
 * Mirrors the tool-loop correction behavior and is safe for both native and legacy modes.
 *
 * @param {object} conversationManager - Conversation manager instance
 * @param {object} errorResponse - Normalized AI response (may include toolCalls and raw)
 */
export function appendEmptyContentCorrection(conversationManager, errorResponse) {
  if (!conversationManager) return;

  // Reconstruct the assistant's failed message as a combined content turn.
  const faultyMessage = errorResponse?.raw?.choices?.[0]?.message || {
    role: 'assistant',
    content: null,
    tool_calls: errorResponse?.toolCalls,
  };

  const combinedContent = `(No valid response was generated. The following error occurred: ${String(errorResponse?.content || 'Empty response')})`;

  // Add the assistant failed turn (with tool_calls if present)
  conversationManager.addMessage(
    faultyMessage.role || 'assistant',
    combinedContent,
    faultyMessage.tool_calls
  );

  // Add a system instruction explicitly requiring natural language content
  const systemInstruction =
    'Your previous reply contained no natural-language content. Always include a clear explanation for the user alongside any tool calls. Provide a brief plan and explain your next action before calling tools.';
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

  conversationManager.addMessage('assistant', assistantSummary);

  const systemInstruction =
    'Your last reply attempted to call a tool with invalid or malformed arguments. Provide corrected arguments if a tool call is still required, or respond in plain language without using tools.';
  conversationManager.addMessage('system', systemInstruction);
}
