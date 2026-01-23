/* eslint-disable complexity, max-lines-per-function, no-unused-vars */
/**
 * ConversationEngine — Orchestrator for a single user turn.
 * Centralizes message assembly, correction enforcement, tool-loop invocation,
 * and retries, while preserving existing public behavior.
 */

import { SimulacrumCore } from './simulacrum-core.js';
import { processToolCallLoop } from './tool-loop-handler.js';
import { toolRegistry } from './tool-registry.js';
import { appendEmptyContentCorrection, appendToolFailureCorrection } from './correction.js';
import {
  isToolCallFailure,
  emitProcessStatus,
  buildRetryLabel,
  getRetryDelayMs,
  delayWithSignal,
  buildGenericFailureMessage,
} from '../utils/retry-helpers.js';

const MAX_PRE_TOOL_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 2000];
const RETRY_STATUS_CALL_PREFIX = 'tool-retry';

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
    let aiResponse = await SimulacrumCore.generateResponse(this.conversationManager.getMessages(), {
      signal,
      onAssistantMessage,
    });

    // Pre-tool correction loop (bounded) - handles parse errors and tool call failures
    let attempt = 1;
    while (
      aiResponse &&
      (aiResponse._parseError || isToolCallFailure(aiResponse)) &&
      attempt < MAX_PRE_TOOL_ATTEMPTS
    ) {
      if (aiResponse._parseError) {
        appendEmptyContentCorrection(this.conversationManager, aiResponse);
      } else {
        appendToolFailureCorrection(this.conversationManager, aiResponse);
      }

      const nextAttempt = attempt + 1;
      const delayMs = getRetryDelayMs(attempt - 1);
      const callId = `${RETRY_STATUS_CALL_PREFIX}-${Date.now()}-${nextAttempt}`;
      const label = buildRetryLabel(nextAttempt, MAX_PRE_TOOL_ATTEMPTS);

      emitProcessStatus('start', callId, label);
      try {
        if (delayMs) {
          await delayWithSignal(delayMs, signal);
        }
        aiResponse = await SimulacrumCore.generateResponse(this.conversationManager.getMessages(), {
          signal,
        });
      } finally {
        emitProcessStatus('end', callId);
      }

      attempt = nextAttempt;
    }

    // If parse error persists after retries, return failure message
    if (aiResponse && aiResponse._parseError) {
      const errorMessage = buildGenericFailureMessage();
      if (onAssistantMessage) onAssistantMessage(errorMessage);
      return errorMessage;
    }

    // If tool failure persists after retries, run tool-free fallback flow
    if (aiResponse && isToolCallFailure(aiResponse)) {
      aiResponse = await this._runToolFailureFallback(aiResponse, signal);
      if (aiResponse.role === 'assistant') {
        if (onAssistantMessage) onAssistantMessage(aiResponse);
        return aiResponse;
      }
    }

    // If no tools, emit assistant and finish
    if (!Array.isArray(aiResponse.toolCalls) || aiResponse.toolCalls.length === 0) {
      if (onAssistantMessage && aiResponse?.content) {
        onAssistantMessage({
          role: 'assistant',
          content: aiResponse.content,
          display: aiResponse.display || aiResponse.content,
        });
      }
      return aiResponse;
    }

    // With tools: delegate to tool loop (let the loop emit assistant/tool updates)
    // Note: tool-loop-handler now handles adding assistant messages with tool_calls
    const tools = toolRegistry.getToolSchemas();
    const legacyMode = game?.settings?.get('simulacrum', 'legacyMode') ?? false;
    const currentToolSupport = !legacyMode;

    const finalResponse = await processToolCallLoop({
      initialResponse: aiResponse,
      tools,
      conversationManager: this.conversationManager,
      aiClient: SimulacrumCore.aiClient,
      getSystemPrompt: SimulacrumCore.getSystemPrompt.bind(SimulacrumCore),
      currentToolSupport,
      signal,
      onToolResult: onToolResult || null,
    });

    // If loop produced a distinct final message and it wasn't already emitted by the loop handler, emit to UI
    if (finalResponse && finalResponse.content && onAssistantMessage && !finalResponse._emitted) {
      onAssistantMessage({
        role: 'assistant',
        content: finalResponse.content,
        display: finalResponse.display || finalResponse.content,
        _fromToolLoop: true, // Signal that this was already added to conversation by tool-loop-handler
      });
    }

    return finalResponse;
  }

  async _runToolFailureFallback(failedResponse, signal) {
    appendToolFailureCorrection(this.conversationManager, failedResponse);

    const fallbackInstruction =
      'Tool calls are temporarily disabled. Provide a plain language response without using any tools.';
    const messages = this.conversationManager.getMessages();
    const lastMessage = messages[messages.length - 1];
    if (
      !lastMessage ||
      lastMessage.role !== 'system' ||
      lastMessage.content !== fallbackInstruction
    ) {
      this.conversationManager.addMessage('system', fallbackInstruction);
    }

    let fallbackResponse;
    try {
      fallbackResponse = await SimulacrumCore.generateResponse(
        this.conversationManager.getMessages(),
        { signal, tools: null }
      );
    } catch (_error) {
      return buildGenericFailureMessage();
    }

    if (!fallbackResponse || fallbackResponse._parseError || isToolCallFailure(fallbackResponse)) {
      return buildGenericFailureMessage();
    }

    const notice = 'Note: Tool functionality was temporarily unavailable for this response.';
    const content = fallbackResponse.content ? `${fallbackResponse.content}\n\n${notice}` : notice;
    const display = fallbackResponse.display ? `${fallbackResponse.display}\n\n${notice}` : content;

    return {
      ...fallbackResponse,
      content,
      display,
      toolCalls: [],
    };
  }
}

export { ConversationEngine };
