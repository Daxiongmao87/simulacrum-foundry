/**
 * ConversationEngine — Orchestrator for a single user turn.
 * Centralizes message assembly, correction enforcement, tool-loop invocation,
 * and retries, while preserving existing public behavior.
 */

import { SimulacrumCore } from './simulacrum-core.js';
import { processToolCallLoop } from './tool-loop-handler.js';
import { toolRegistry } from './tool-registry.js';
import { appendEmptyContentCorrection } from './correction.js';

class ConversationEngine {
  constructor(conversationManager) {
    this.conversationManager = conversationManager;
  }

  /**
   * Process a user turn. Assumes the caller already added the user message
   * to the conversation.
   * @param {object} options
   * @param {AbortSignal} [options.signal]
   * @param {function} [options.onAssistantMessage]
   * @param {function} [options.onToolResult]
   * @returns {Promise<object>} final assistant response
   */
  async processTurn(options = {}) {
    const { signal, onAssistantMessage, onToolResult } = options;

    // Get initial assistant response
    let aiResponse = await SimulacrumCore.generateResponse(
      this.conversationManager.getMessages(),
      { signal }
    );

    // Pre-tool correction loop (bounded) - handles parse errors and malformed function calls
    let attempts = 0;
    const MAX = 3;
    while (aiResponse && (aiResponse._parseError || aiResponse._malformedFunctionCallError) && attempts < MAX) {
      attempts++;
      appendEmptyContentCorrection(this.conversationManager, aiResponse);
      aiResponse = await SimulacrumCore.generateResponse(
        this.conversationManager.getMessages(),
        { signal }
      );
    }

    // If still parse error or malformed function call error after retries, return failure message
    if (aiResponse && (aiResponse._parseError || aiResponse._malformedFunctionCallError)) {
      const errorMessage = {
        role: 'assistant',
        content: 'Unable to generate a proper response after multiple attempts. Please try rephrasing your request.',
        display: '❌ Unable to generate a proper response after multiple attempts.'
      };
      if (onAssistantMessage) onAssistantMessage(errorMessage);
      return errorMessage;
    }


    // If no tools, emit assistant and finish
    if (!Array.isArray(aiResponse.toolCalls) || aiResponse.toolCalls.length === 0) {
      if (onAssistantMessage && aiResponse?.content) {
        onAssistantMessage({ role: 'assistant', content: aiResponse.content, display: aiResponse.display || aiResponse.content });
      }
      return aiResponse;
    }

    // With tools: delegate to tool loop (let the loop emit assistant/tool updates)
    const tools = toolRegistry.getToolSchemas();
    const legacyMode = game?.settings?.get('simulacrum', 'legacyMode') ?? false;
    const currentToolSupport = !legacyMode;

    const finalResponse = await processToolCallLoop(
      aiResponse,
      tools,
      this.conversationManager,
      SimulacrumCore.aiClient,
      SimulacrumCore.getSystemPrompt.bind(SimulacrumCore),
      currentToolSupport,
      signal,
      onToolResult || null
    );

    // If loop produced a distinct final message, emit to UI
    if (finalResponse && finalResponse.content && onAssistantMessage) {
      onAssistantMessage({ role: 'assistant', content: finalResponse.content, display: finalResponse.display || finalResponse.content });
    }

    return finalResponse;
  }

}

export { ConversationEngine };

