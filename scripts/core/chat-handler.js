/* eslint-disable max-depth, no-unreachable */
import { createLogger, isDebugEnabled } from '../utils/logger.js';
import { formatToolCallDisplay, getToolDisplayContent, getToolContentSummary } from '../utils/message-utils.js';
import { MarkdownRenderer } from '../lib/markdown-renderer.js';
import { retrieveToolJustification } from './tool-loop-handler.js';
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
        onAssistantMessage: msg => {
          // Support ephemeral messages (display only) by checking for either content or display
          if (msg?.role === 'assistant' && (msg?.content || msg?.display)) {
            // Only add to conversation if this is NOT a tool-call response.
            // Messages with tool calls are already added by tool-loop-handler before execution.
            // Adding here would cause duplicate log entries.
            if (msg.content && !msg.toolCalls && !msg._fromToolLoop) {
              this.addMessageToConversation('assistant', msg.content);
            }
            this.addMessageToUI(
              { role: 'assistant', content: msg.content, display: msg.display || msg.content },
              options
            );
          }
        },
        onToolResult: toolResult => this.handleToolResult(toolResult, options),
      });

      return finalResponse;
    } catch (error) {
      this.logger.error('Error processing user message', error);

      // Handle cancellation specially - do NOT invoke onError for cancellation
      // because we don't want to rollback the user's message
      if (error.name === 'AbortError' || error.message === 'Process was cancelled') {
        const cancelMessage = {
          role: 'assistant',
          content: 'Process cancelled by user',
          display: '🛑 Process cancelled',
          noGroup: true, // Prevent grouping with previous assistant messages
        };
        this.addMessageToUI(cancelMessage, options);
        return cancelMessage;
      }

      // Invoke onError callback to restore user's message to input field
      // This is for ACTUAL errors (not cancellation) where we want to allow retry
      if (options.onError) {
        options.onError({ originalMessage: message, error });
      }

      // Check for 503 Service Unavailable or other API connection issues
      let friendlyMessage = `Error: ${error.message}`;
      let displayMessage = `${error.message}`;

      if (error.message.includes('503') || error.message.includes('Service Unavailable')) {
        friendlyMessage = 'The AI service is currently unavailable (503). This is typically a temporary issue with the AI provider. Please try again in a few moments.';
        displayMessage = `⚠️ **AI Service Unavailable**\n\nThe AI endpoint is experiencing issues (503). This is usually temporary.\n\n*Error details: ${error.message}*`;
      } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        friendlyMessage = 'Network connection failed. Please check your internet connection and API settings.';
        displayMessage = `**Network Error**\n\nFailed to connect to the AI service.\n\n*Error details: ${error.message}*`;
      }

      // API/Network errors: Show via FoundryVTT notification system
      if (globalThis.ui?.notifications?.error) {
        ui.notifications.error(`Simulacrum: ${error.message}`, { permanent: false });
      } else {
        this.logger.error(`Simulacrum Error: ${error.message}`);
      }

      // CRITICAL: fallback response for the chat UI
      const errorMessage = {
        role: 'assistant',
        content: friendlyMessage,
        display: displayMessage,
        error,
      };

      // Ensure the error is displayed in the chat interface
      this.addMessageToUI(errorMessage, options);

      return errorMessage;

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
    this.addMessageToConversation('assistant', aiResponse.content, aiResponse.toolCalls, null, aiResponse.provider_metadata);

    // Add to UI
    this.addMessageToUI(
      {
        role: 'assistant',
        content: aiResponse.content,
        display: aiResponse.display || aiResponse.content,
      },
      options
    );

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
        retryCount: options._retryCount || 0,
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

      const errorMessage = {
        role: 'assistant',
        content: `Tool execution error: ${error.message}`,
        display: `${error.message}`,
      };
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
      onToolResult: toolResult => this.handleToolResult(toolResult, options),
    });
  }

  async _processToolLoopOutcome(finalResponse, options) {
    // Handle tool limit reached error
    if (finalResponse._toolLimitReachedError) {
      this.conversationManager.updateSystemMessage(finalResponse.content);
      const aiSummaryResponse = await this.handleAutonomousFlow(finalResponse, options);
      // Add the AI's summary to conversation and UI
      this.addMessageToConversation('assistant', aiSummaryResponse.content);
      this.addMessageToUI(
        {
          role: 'assistant',
          content: aiSummaryResponse.content,
          display: aiSummaryResponse.display || aiSummaryResponse.content,
        },
        options
      );
      return aiSummaryResponse;
    }

    // Add final response if different from last message
    if (finalResponse && finalResponse.content) {
      const lastMessage =
        this.conversationManager.messages[this.conversationManager.messages.length - 1];
      if (lastMessage.role !== 'assistant' || lastMessage.content !== finalResponse.content) {
        this.addMessageToConversation('assistant', finalResponse.content, null, null, finalResponse.provider_metadata);
        this.addMessageToUI(
          {
            role: 'assistant',
            content: finalResponse.content,
            display: finalResponse.display || finalResponse.content,
          },
          options
        );
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
        content:
          'Unable to generate a proper response after multiple attempts. Please try rephrasing your request.',
        display: 'Unable to generate a proper response after multiple attempts.',
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
        _retryCount: currentRetries,
      });
    } catch (error) {
      this.logger.error('Error during AI response retry', error);

      const errorMessage = {
        role: 'assistant',
        content: `Retry failed: ${error.message}`,
        display: `Retry failed: ${error.message}`,
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
            hasToolCalls: !!(msg.tool_calls && msg.tool_calls.length > 0),
          })),
        });
      }
    } catch {
      /* intentionally empty */
    }
  }

  async _logRetryAttempt(currentRetries) {
    try {
      const { isDebugEnabled, createLogger } = await import('../utils/logger.js');
      if (isDebugEnabled()) {
        const last =
          this.conversationManager.messages[this.conversationManager.messages.length - 1];
        createLogger('AIDiagnostics').info('assistant.empty_response.retry', {
          attempt: currentRetries,
          lastRole: last?.role,
          hasToolCalls: Array.isArray(last?.tool_calls) && last.tool_calls.length > 0,
        });
      }
    } catch {
      /* intentionally empty */
    }
  }

  /**
   * Handle individual tool results during execution
   * Task-09: Enhanced to format tool results with status icons
   */
  async handleToolResult(toolResult, options = {}) {
    // Add tool result to conversation
    if (toolResult.role === 'tool') {
      // FIX: Do not add to conversation here, as tool-loop-handler already adds it internally.
      // this.addMessageToConversation('tool', toolResult.content, null, toolResult.toolCallId);

      // Check for silent/hidden tools - skip UI rendering
      const hiddenTools = ['end_loop'];
      // Tools that don't need justification displayed (self-explanatory from context)
      const noJustificationTools = ['read_tool_output'];
      // Tools that render their display directly without tool card wrapper
      const directDisplayTools = ['manage_task'];
      let isSilent = hiddenTools.includes(toolResult.toolName);
      if (!isSilent) {
        try {
          const parsed = typeof toolResult.content === 'string' ? JSON.parse(toolResult.content) : toolResult.content;
          isSilent = parsed?._silent === true;
        } catch (_e) { /* not JSON, not silent */ }
      }

      // Task-09: Format tool result with rich HTML display if it has a toolName (and is not silent)
      if (toolResult.toolName && options.onAssistantMessage && !isSilent) {
        // Direct display tools: render their display property directly without tool card wrapper
        if (directDisplayTools.includes(toolResult.toolName)) {
          // Emit hook to remove pending card for direct display tools
          Hooks.callAll('simulacrumToolResult', {
            toolCallId: toolResult.toolCallId,
            toolName: toolResult.toolName,
          });

          const rawDisplay = getToolDisplayContent(toolResult);
          // Only show if there's actual display content (skip empty displays like start_task)
          if (rawDisplay && rawDisplay.trim()) {
            // Check if display is already HTML (starts with <) or needs markdown rendering
            let formattedDisplay = rawDisplay;
            if (!rawDisplay.trim().startsWith('<')) {
              formattedDisplay = await MarkdownRenderer.render(rawDisplay, { force: true });
            }
            // Extract proper content summary (not raw JSON)
            const contentSummary = getToolContentSummary(toolResult) || '';
            this.addMessageToUI(
              {
                role: 'assistant',
                content: contentSummary,
                display: formattedDisplay,
                _fromToolLoop: true, // Prevent duplicate conversation entry
              },
              options
            );
          }
          return; // Skip standard tool card formatting
        }

        // Retrieve justification stored during pending phase (skip for self-explanatory tools)
        const justification = noJustificationTools.includes(toolResult.toolName)
          ? ''
          : retrieveToolJustification(toolResult.toolCallId);

        let preRendered = null;
        try {
          // Task-Fix: Unwrap content if it's JSON to prevent leaking raw JSON string.
          // Prioritize 'display' property using shared utility.
          // CRITICAL: Always render valid Markdown, even if 'display' property is used, as tools return Markdown.
          // Use force: true to ensure mixed HTML/Markdown (like @UUID which might look like tags?) is processed.
          const rawDisplay = getToolDisplayContent(toolResult);
          if (rawDisplay) {
            preRendered = await MarkdownRenderer.render(rawDisplay, { force: true });
          } else {
            // Fallback: Check if content is JSON. If so, SKIP rendering and let formatToolCallDisplay handle it
            // (it has smarter logic for extracting display/message/error from JSON).
            // If NOT JSON (e.g. legacy string output), render it as markdown.
            const content = toolResult.content;
            let isJson = false;
            if (typeof content === 'string' && content.trim().startsWith('{')) {
              try {
                JSON.parse(content);
                isJson = true;
              } catch (e) { }
            }

            if (!isJson) {
              preRendered = await MarkdownRenderer.render(content);
            }
          }
        } catch (e) {
          this.logger.warn('Failed to pre-render tool content', e);
        }

        const formattedDisplay = formatToolCallDisplay(toolResult, toolResult.toolName, preRendered, justification);

        // Emit hook with formatted HTML so UI can update pending card in place
        Hooks.callAll('simulacrumToolResult', {
          toolCallId: toolResult.toolCallId,
          toolName: toolResult.toolName,
          formattedDisplay,
          content: toolResult.content,
        });
      }
    } else if (toolResult.role === 'assistant' && toolResult.content) {
      // Only add assistant messages that have actual content and are NOT from internal tool loop (ephemeral)
      if (!toolResult._fromToolLoop) {
        this.addMessageToConversation('assistant', toolResult.content);
      }
      this.addMessageToUI(
        {
          role: 'assistant',
          content: toolResult.content,
          display: toolResult.display || toolResult.content,
        },
        options
      );
    }
  }

  /**
   * Add message to conversation state only
   */
  addMessageToConversation(role, content, toolCalls = null, toolCallId = null, metadata = null) {
    this.conversationManager.addMessage(role, content, toolCalls, toolCallId, metadata);
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
   * Clear conversation history and interaction log
   */
  async clearConversation() {
    this.conversationManager.clear();
    await this.conversationManager.save();
    // Clear the interaction log when conversation is cleared
    const { interactionLogger } = await import('./interaction-logger.js');
    await interactionLogger.clear();
  }
}

export { ChatHandler };
