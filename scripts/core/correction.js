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
    tool_calls: errorResponse?.toolCalls
  };

  const combinedContent = `(No valid response was generated. The following error occurred: ${String(errorResponse?.content || 'Empty response')})`;

  // Add the assistant failed turn (with tool_calls if present)
  conversationManager.addMessage(faultyMessage.role || 'assistant', combinedContent, faultyMessage.tool_calls);

  // Add a system instruction explicitly requiring natural language content
  const systemInstruction = 'Your previous reply contained no natural-language content. Always include a clear explanation for the user alongside any tool calls. Provide a brief plan and explain your next action before calling tools.';
  conversationManager.addMessage('system', systemInstruction);
}

