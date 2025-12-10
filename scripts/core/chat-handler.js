import { createLogger, isDebugEnabled } from '../utils/logger.js';
/**
 * ChatHandler - Single source of truth for all chat conversation flow
 * Orchestrates between AI, tools, conversation state, and UI
 */


class ChatHandler {
  constructor(conversationManager) {
    this.conversationManager = conversationManager;
    this.logger = createLogger('ChatHandler');
  }

  /**
   * Main entry point for processing user messages
   * Handles the complete flow: user input -> AI -> tools -> UI
   */
  async processUserMessage(message, user, options = {}) {
    try {
      // Add user message to conversation state
      this.addMessageToConversation('user', message);

      // Notify UI if callback provided
      if (options.onUserMessage) {
        options.onUserMessage({ role: 'user', content: message, user });
      }

      // Delegate orchestration to ConversationEngine
      const { ConversationEngine } = await import('./conversation-engine.js');
      const engine = new ConversationEngine(this.conversationManager);

      const finalResponse = await engine.processTurn({
        signal: options.signal,
        onAssistantMessage: (msg) => {
          // Mirror previous behavior: add to conversation and UI when appropriate
          if (msg?.role === 'assistant' && msg?.content) {
            this.addMessageToConversation('assistant', msg.content);
            this.addMessageToUI({ role: 'assistant', content: msg.content, display: msg.display || msg.content }, options);
          }
        },
        onToolResult: (toolResult) => this.handleToolResult(toolResult, options)
      });

      return finalResponse;

    } catch (error) {
      this.logger.error('Error processing user message', error);

      // Handle cancellation specially
      if (error.name === 'AbortError' || error.message === 'Process was cancelled') {
        const cancelMessage = { role: 'assistant', content: 'Process cancelled by user', display: '🛑 Process cancelled' };
        this.addMessageToUI(cancelMessage, options);
        return cancelMessage;
      }

      // API/Network errors: Show via FoundryVTT notification system, NOT in chat
      if (global.ui?.notifications?.error) {
        ui.notifications.error(`Simulacrum: ${error.message}`, { permanent: false });
      } else {
        this.logger.error(`Simulacrum Error: ${error.message}`);
      }
      return {
        content: `Error: ${error.message}`,
        display: `❌ ${error.message}`,
        error
      };

      return null;
    }
  }

  /**
   * Handle AI response - add to conversation and execute tools if needed
   */
  async handleAIResponse(aiResponse, options = {}) {
    // Skip adding parse errors to conversation/UI (they're for AI correction only)
    if (aiResponse._parseError) {
      return await this.handleParseError(aiResponse, options);
    }

    // Add assistant response to conversation
    this.addMessageToConversation('assistant', aiResponse.content, aiResponse.toolCalls);

    // Add to UI
    this.addMessageToUI({
      role: 'assistant',
      content: aiResponse.content,
      display: aiResponse.display || aiResponse.content
    }, options);

    // Execute tools if present; pass full response so parseError is preserved
    if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
      return await this.handleToolExecution(aiResponse, options);
    }

    // No tools - check if we should continue autonomous loop
    return await this.handleAutonomousFlow(aiResponse, options);
  }

  /**
   * Handle parse errors by continuing AI flow for correction
   */
  async handleParseError(parseErrorResponse, options = {}) {
    if (isDebugEnabled()) {
      const { createLogger } = await import('../utils/logger.js');
      const logger = createLogger('ChatHandler');
      logger.warn('ChatHandler handling parse error:', {
        parseErrorType: parseErrorResponse._parseError,
        content: parseErrorResponse.content || '(empty)',
        hasToolCalls: !!(parseErrorResponse.toolCalls && parseErrorResponse.toolCalls.length > 0),
        retryCount: options._retryCount || 0
      });
    }
    // Append assistant failed turn + system correction to conversation
    const { appendEmptyContentCorrection } = await import('./correction.js');
    appendEmptyContentCorrection(this.conversationManager, parseErrorResponse);

    // Continue the autonomous flow to get corrected response
    return await this.handleAutonomousFlow(parseErrorResponse, options);
  }

  /**
   * Execute tools and continue conversation flow
   * Decomposed to reduce complexity
   */
  async handleToolExecution(aiResponse, options = {}) {
    try {
      const finalResponse = await this._executeToolLoop(aiResponse, options);
      return await this._processToolLoopOutcome(finalResponse, options);
    } catch (error) {
      this.logger.error('Error executing tools', error);

      const errorMessage = { role: 'assistant', content: `Tool execution error: ${error.message}`, display: `❌ ${error.message}` };
      this.addMessageToConversation('assistant', errorMessage.content);
      this.addMessageToUI(errorMessage, options);
      return errorMessage;
    }
  }

  async _executeToolLoop(aiResponse, options) {
    const { processToolCallLoop } = await import('./tool-loop-handler.js');
    const { SimulacrumCore } = await import('./simulacrum-core.js');
    const { toolRegistry } = await import('./tool-registry.js');

    const tools = toolRegistry.getToolSchemas();
    const legacyMode = game?.settings?.get('simulacrum', 'legacyMode') ?? false;
    const currentToolSupport = !legacyMode;

    // Execute tools and get final response
    return await processToolCallLoop({
      initialResponse: aiResponse,
      tools,
      conversationManager: this.conversationManager,
      aiClient: SimulacrumCore.aiClient,
      getSystemPrompt: SimulacrumCore.getSystemPrompt.bind(SimulacrumCore),
      currentToolSupport,
      signal: options.signal,
      onToolResult: (toolResult) => this.handleToolResult(toolResult, options)
    });
  }

  async _processToolLoopOutcome(finalResponse, options) {
    // Handle tool limit reached error
    if (finalResponse._toolLimitReachedError) {
      this.conversationManager.updateSystemMessage(finalResponse.content);
      const aiSummaryResponse = await this.handleAutonomousFlow(finalResponse, options);
      // Add the AI's summary to conversation and UI
      this.addMessageToConversation('assistant', aiSummaryResponse.content);
      this.addMessageToUI({
        role: 'assistant',
        content: aiSummaryResponse.content,
        display: aiSummaryResponse.display || aiSummaryResponse.content
      }, options);
      return aiSummaryResponse;
    }

    // Add final response if different from last message
    if (finalResponse && finalResponse.content) {
      const lastMessage = this.conversationManager.messages[
        this.conversationManager.messages.length - 1
      ];
      if (lastMessage.role !== 'assistant' || lastMessage.content !== finalResponse.content) {
        this.addMessageToConversation('assistant', finalResponse.content);
        this.addMessageToUI({
          role: 'assistant',
          content: finalResponse.content,
          display: finalResponse.display || finalResponse.content
        }, options);
      }
    }
    return finalResponse;
  }

  /**
   * Handle autonomous flow continuation (when no tools but should continue)
   */
  async handleAutonomousFlow(response, options = {}) {
    // Check for parse errors that need retry
    if (response._parseError) {
      return await this.retryAIResponse(options);
    }

    // For other autonomous cases, just return the response
    // This is where we would check for end_task or continue the conversation
    return response;
  }

  /**
   * Retry AI response generation for parse errors
   */
  async retryAIResponse(options = {}) {
    const maxRetries = 3;
    const currentRetries = (options._retryCount || 0) + 1;

    if (currentRetries > maxRetries) {
      await this._logRetryExhausted(currentRetries, maxRetries);
      const errorMessage = {
        role: 'assistant',
        content: 'Unable to generate a proper response after multiple attempts. Please try rephrasing your request.',
        display: '❌ Unable to generate a proper response after multiple attempts.'
      };
      this.addMessageToUI(errorMessage, options);
      return errorMessage;
    }

    try {
      const { SimulacrumCore } = await import('./simulacrum-core.js');
      await this._logRetryAttempt(currentRetries);

      // Get corrected AI response
      const aiResponse = await SimulacrumCore.generateResponse(
        this.conversationManager.getMessages(),
        { signal: options.signal }
      );

      // Recursively handle the new response with retry tracking
      return await this.handleAIResponse(aiResponse, {
        ...options,
        _retryCount: currentRetries
      });

    } catch (error) {
      this.logger.error('Error during AI response retry', error);

      const errorMessage = {
        role: 'assistant',
        content: `Retry failed: ${error.message}`,
        display: `❌ Retry failed: ${error.message}`
      };
      this.addMessageToConversation('assistant', errorMessage.content);
      this.addMessageToUI(errorMessage, options);
      return errorMessage;
    }
  }

  async _logRetryExhausted(currentRetries, maxRetries) {
    try {
      const { isDebugEnabled, createLogger } = await import('../utils/logger.js');
      if (isDebugEnabled()) {
        const conversationMessages = this.conversationManager.getMessages();
        createLogger('AIDiagnostics').error('assistant.empty_response.exhausted', {
          maxRetries,
          retryCount: currentRetries,
          conversationLength: conversationMessages.length,
          recentMessages: conversationMessages.slice(-5).map(msg => ({
            role: msg.role,
            hasToolCalls: !!(msg.tool_calls && msg.tool_calls.length > 0)
          }))
        });
      }
    } catch { /* intentionally empty */ }
  }

  async _logRetryAttempt(currentRetries) {
    try {
      const { isDebugEnabled, createLogger } = await import('../utils/logger.js');
      if (isDebugEnabled()) {
        const last = this.conversationManager.messages[
          this.conversationManager.messages.length - 1
        ];
        createLogger('AIDiagnostics').info('assistant.empty_response.retry', {
          attempt: currentRetries,
          lastRole: last?.role,
          hasToolCalls: Array.isArray(last?.tool_calls) && last.tool_calls.length > 0
        });
      }
    } catch { /* intentionally empty */ }
  }

  /**
   * Handle individual tool results during execution
   * Task-09: Enhanced to format tool results with status icons
   */
  handleToolResult(toolResult, options = {}) {
    // Add tool result to conversation
    if (toolResult.role === 'tool') {
      this.addMessageToConversation('tool', toolResult.content, null, toolResult.toolCallId);

      // Task-09: Format tool result with rich HTML display if it has a toolName
      if (toolResult.toolName && options.onAssistantMessage) {
        const formattedDisplay = this._formatToolCallDisplay(toolResult);
        // Display as assistant message with tool indicator
        this.addMessageToUI({
          role: 'assistant',
          content: toolResult.content,
          display: formattedDisplay
        }, options);
      }
    } else if (toolResult.role === 'assistant' && toolResult.content) {
      // Only add assistant messages that have actual content
      this.addMessageToConversation('assistant', toolResult.content);
      this.addMessageToUI({
        role: 'assistant',
        content: toolResult.content,
        display: toolResult.display || toolResult.content
      }, options);
    }
  }

  /**
   * Format a tool call result as rich HTML with status icons
   * Task-09: Generates styled display for tool operations
   * @param {Object} toolResult - The tool result object
   * @returns {string} HTML string for display
   * @private
   */
  _formatToolCallDisplay(toolResult) {
    const isSuccess = !toolResult.isError && !toolResult.error;
    const statusClass = isSuccess ? 'tool-success' : 'tool-failure';
    const iconClass = isSuccess ? 'fa-solid fa-circle-check' : 'fa-solid fa-triangle-exclamation';

    // Build action text from tool name
    const toolName = toolResult.toolName || 'unknown';
    const actionText = this._getToolActionText(toolName, toolResult);

    // Extract document name if present in the result
    const documentInfo = this._extractDocumentInfo(toolResult);
    const documentHtml = documentInfo ? `<span class="tool-document">${documentInfo}</span>` : '';

    // Specialized Macro Result Display
    let resultHtml = '';
    if (toolName === 'execute_macro' && isSuccess) {
      resultHtml = this._formatMacroResult(toolResult);
    }

    return `<div class="simulacrum-tool-call ${statusClass}">
      <i class="${iconClass} tool-icon"></i>
      <span class="tool-action">${actionText}</span>
      ${documentHtml}
      ${resultHtml}
    </div>`;
  }

  /**
   * Format macro execution result
   * @private
   */
  // eslint-disable-next-line complexity
  _formatMacroResult(toolResult) {
    try {
      // Content is JSON stringified result from tool
      const contentObj = JSON.parse(toolResult.content);
      let macroResult = contentObj;

      // Loop to unwrap nested JSON strings (max 3 levels to avoid infinite loops)
      for (let i = 0; i < 3; i++) {
        if (typeof macroResult === 'string') {
          try {
            const parsed = JSON.parse(macroResult);
            if (parsed && typeof parsed === 'object') {
              macroResult = parsed;
            } else {
              break;
            }
          } catch {
            break;
          }
          // eslint-disable-next-line max-depth
        } else {
          break;
        }
      }

      if (macroResult && macroResult.result && macroResult.result.total !== undefined) {
        let html = `<div class="tool-result"><strong>Roll Result:</strong> ${macroResult.result.total}</div>`;
        if (macroResult.result.formula) {
          html += `<div class="tool-result-detail"><small>Formula: ${macroResult.result.formula}</small></div>`;
        }
        return html;
      } else if (macroResult && macroResult.result !== undefined) {
        const resultStr = typeof macroResult.result === 'object'
          ? JSON.stringify(macroResult.result, null, 2)
          : String(macroResult.result);
        return `<div class="tool-result"><strong>Result:</strong> ${resultStr}</div>`;
      }
    } catch (e) { /* ignore parse errors */ }
    return '';
  }

  /**
   * Get human-readable action text for a tool
   * @param {string} toolName - The tool name
   * @param {Object} toolResult - The tool result for context
   * @returns {string} Human-readable action text
   * @private
   */
  _getToolActionText(toolName, toolResult) {
    const toolActions = {
      'document-create': 'Created',
      'document-read': 'Read',
      'document-update': 'Updated',
      'document-delete': 'Deleted',
      'document-list': 'Listed',
      'document-search': 'Searched',
      'document-schema': 'Retrieved schema for',
      'execute_macro': 'Executed Macro'
    };

    const action = toolActions[toolName] || toolName.replace(/-/g, ' ');
    const docType = toolResult.documentType || '';

    return docType ? `${action} ${docType}` : action;
  }

  /**
   * Extract document name/info from tool result for display
   * @param {Object} toolResult - The tool result
   * @returns {string|null} Document info or null
   * @private
   */
  _extractDocumentInfo(toolResult) {
    // Try to extract document name from the result content
    const content = String(toolResult.content || '');

    // Look for document name patterns
    const nameMatch = content.match(/"name":\s*"([^"]+)"/);
    if (nameMatch) {
      return nameMatch[1];
    }

    // Look for "Created X" or similar success messages
    const createdMatch = content.match(
      /(?:Created|Updated|Deleted|Read)\s+(\w+)\s+(?:document\s+)?['"]([^'"]+)['"]/i
    );
    if (createdMatch) {
      return createdMatch[2];
    }

    // Look for Macro execution message
    const macroMatch = content.match(/executed macro:\s*([^"'}]+)/i);
    if (macroMatch) {
      return macroMatch[1].trim();
    }

    return null;
  }

  /**
   * Add message to conversation state only
   */
  addMessageToConversation(role, content, toolCalls = null, toolCallId = null) {
    this.conversationManager.addMessage(role, content, toolCalls, toolCallId);
  }

  /**
   * Add message to UI only (through callback)
   */
  addMessageToUI(message, options = {}) {
    if (options.onAssistantMessage && message.role === 'assistant') {
      try {
        options.onAssistantMessage(message);
      } catch (error) {
        this.logger.error('Error in UI callback', error);
      }
    }
  }

  /**
   * Clear conversation history
   */
  async clearConversation() {
    this.conversationManager.clear();
  }
}

export { ChatHandler };