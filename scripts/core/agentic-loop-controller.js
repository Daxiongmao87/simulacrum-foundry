// scripts/core/agentic-loop-controller.js

// import { SimulacrumAIService } from '../chat/ai-service.js'; // Available for future use
// import { SimulacrumToolScheduler } from './tool-scheduler.js'; // Available for future use
import { AgentResponseParser } from './json-response-parser.js';
import { AgenticContext } from './agentic-context.js';
import { TokenTracker, formatToolResultsForAI } from './token-tracker.js';
import { ContextCompaction } from './context-compaction.js';

/**
 * Manages the autonomous AI -> Tool -> AI cycle based on continuation state.
 * This controller orchestrates the entire agent workflow, from initial user request
 * through multi-step tool execution to final completion.
 */
export class AgenticLoopController {
  /**
   * @param {SimulacrumAIService} aiService - The AI service instance.
   * @param {SimulacrumToolScheduler} toolScheduler - The tool scheduler instance.
   */
  constructor(aiService, toolScheduler) {
    /**
     * @type {boolean}
     * @private
     */
    this.cancelled = false;

    /**
     * @type {Object|null}
     * @private
     */
    this.currentChatContext = null;

    /**
     * @type {SimulacrumAIService}
     * @private
     */
    this.aiService = aiService;

    /**
     * @type {SimulacrumToolScheduler}
     * @private
     */
    this.toolScheduler = toolScheduler;

    /**
     * @type {AgentResponseParser}
     * @private
     */
    this.responseParser = new AgentResponseParser(this.aiService);

    /**
     * @type {AgenticContext | null}
     * @private
     */
    this.currentContext = null;

    /**
     * @type {TokenTracker}
     * @private
     */
    this.tokenTracker = new TokenTracker();

    /**
     * @type {ContextCompaction}
     * @private
     */
    this.contextCompaction = new ContextCompaction(aiService);
  }

  /**
   * Sets the current chat context for UI operations
   * @param {Object} chatContext - The chat instance to use for UI operations
   */
  setChatContext(chatContext) {
    this.currentChatContext = chatContext;
  }

  /**
   * Clears the current chat context
   */
  clearChatContext() {
    this.currentChatContext = null;
  }

  /**
   * Initializes the context for a new user request.
   * @param {string} userMessage - The initial message from the user.
   * @returns {AgenticContext} The initialized context.
   * @private
   */
  initializeContext(userMessage) {
    const context = new AgenticContext();

    // Load existing conversation history from AIService
    const existingHistory = this.aiService.getHistory();

    // Convert existing history to AgenticContext format
    // Skip the last message if it matches our userMessage (to avoid duplication)
    for (let i = 0; i < existingHistory.length; i++) {
      const msg = existingHistory[i];

      // Skip the last message if it's the same as our current userMessage
      if (
        i === existingHistory.length - 1 &&
        msg.role === 'user' &&
        msg.content === userMessage
      ) {
        continue;
      }

      if (msg.role === 'user') {
        context.addUserMessage(msg.content);
      } else if (msg.role === 'assistant') {
        // Add AI response with minimal structure
        context.addAIResponse({
          message: msg.content,
          tool_calls: msg.tool_calls || [],
          continuation: { in_progress: false, gerund: null },
        });
      }
    }

    // Add the new user message only if it wasn't already in the history
    const lastHistoryMsg = existingHistory[existingHistory.length - 1];
    if (
      !lastHistoryMsg ||
      lastHistoryMsg.role !== 'user' ||
      lastHistoryMsg.content !== userMessage
    ) {
      context.addUserMessage(userMessage);
    }

    this.currentContext = context;
    return context;
  }

  /**
   * Displays a placeholder message in the UI.
   * @param {string} message - The message to display.
   * @private
   */
  showPlaceholder(message) {
    if (this.currentChatContext && this.currentChatContext.showPlaceholder) {
      this.currentChatContext.showPlaceholder(message);
    } else {
      // Fallback to notifications
      ui.notifications.info(`Simulacrum | ${message}...`);
    }
  }

  /**
   * Replaces the current placeholder with a final message.
   * @param {string} message - The final message to display.
   * @private
   */
  replacePlaceholderWithMessage(message) {
    if (
      this.currentChatContext &&
      this.currentChatContext.replacePlaceholderWithMessage
    ) {
      this.currentChatContext.replacePlaceholderWithMessage(message);
    } else {
      // Fallback to notifications
      ui.notifications.info(`Simulacrum | AI Response: ${message}`);
    }
  }

  /**
   * Displays a general message in the UI.
   * @param {string} message - The message to display.
   * @private
   */
  showMessage(message) {
    ui.notifications.info(`Simulacrum | ${message}`);
  }

  /**
   * Executes a list of tool calls.
   * @param {Array<Object>} toolCalls - An array of tool call objects.
   * @returns {Promise<Array<Object>>} A promise that resolves to an array of tool results.
   * @private
   */
  async executeTools(toolCalls, abortSignal) {
    const toolResults = [];

    if (abortSignal.aborted) {
      return [];
    }

    for (const toolCall of toolCalls) {
      if (abortSignal.aborted) {
        break;
      }
      try {
        const result = await this.toolScheduler.scheduleToolExecution(
          toolCall.tool_name,
          toolCall.parameters,
          game.user
        );
        toolResults.push({
          toolName: toolCall.tool_name,
          success: true,
          result: result,
        });
      } catch (error) {
        game.simulacrum?.logger?.error(
          `Tool execution failed for ${toolCall.tool_name}:`,
          error
        );
        ui.notifications.error(
          `Simulacrum | Tool execution failed for ${toolCall.tool_name}: ${error.message}`
        );
        toolResults.push({
          toolName: toolCall.tool_name,
          success: false,
          error: error.message,
        });
      }
    }

    return toolResults;
  }

  /**
   * Processes a user request through the agentic loop.
   * @param {string} userMessage - The initial message from the user.
   * @returns {Promise<void>}
   */
  async processUserRequest(userMessage) {
    this.cancelled = false;
    this.abortController = new AbortController();
    const context = this.initializeContext(userMessage);

    // Initialize token tracker and context compaction with context window from settings
    try {
      const contextWindow =
        game.settings.get('simulacrum', 'contextWindow') || 8192;
      this.tokenTracker.setMaxTokens(contextWindow);
      this.contextCompaction.setMaxTokens(contextWindow);
    } catch {
      this.tokenTracker.setMaxTokens(8192);
      this.contextCompaction.setMaxTokens(8192);
    }

    // Show initial thinking placeholder
    this.showPlaceholder('Thinking');

    const MAX_ITERATIONS = 10; // Safety limit to prevent infinite loops
    let iteration = 0;

    while (!this.abortController.signal.aborted && iteration < MAX_ITERATIONS) {
      if (this.abortController.signal.aborted) {
        this.showMessage('Operation cancelled by user.');
        return;
      }
      iteration++;
      try {
        // Check for context window compaction before sending to AI
        const chatHistory = context.getMessagesArray();
        const compactedHistory = await this.contextCompaction.checkAndCompact(
          chatHistory,
          this.tokenTracker
        );

        // Update context if compaction occurred
        if (compactedHistory !== chatHistory) {
          context.replaceMessagesArray(compactedHistory);
        }

        // Get AI response with properly formatted context
        const response = await this.aiService.sendWithContext(
          context,
          this.abortController.signal
        );

        // Update token tracking from API response
        this.tokenTracker.updateFromResponse(response);

        const parsed = await this.responseParser.parseAgentResponse(response);

        // Programmatic enforcement of in_progress logic:
        // If AI provides tool_calls, the loop must continue, regardless of AI's in_progress suggestion.
        if (parsed.tool_calls && parsed.tool_calls.length > 0) {
          parsed.continuation.in_progress = true;
        }

        // Replace placeholder with AI message
        this.replacePlaceholderWithMessage(parsed.message);
        context.addAIResponse(parsed); // Add parsed AI response to context

        // Check if we're done
        if (!parsed.continuation.in_progress) {
          this.showMessage('Workflow completed.');
          return; // Complete
        }

        // Check for cancellation (again, after AI response)
        // if (this.cancelled) {
        //   this.showMessage('Operation cancelled by user.');
        //   return;
        // }

        // Show progress placeholder with gerund
        this.showPlaceholder(parsed.continuation.gerund);

        // Execute tools if present
        if (parsed.tool_calls && parsed.tool_calls.length > 0) {
          const toolResults = await this.executeTools(
            parsed.tool_calls,
            this.abortController.signal
          );

          // Format tool results for AI context
          const formattedResults = formatToolResultsForAI(
            toolResults,
            this.tokenTracker
          );

          // Add tool results to context for AI (not visible to user)
          if (formattedResults) {
            context.addSystemMessage(
              `Tool execution results:\n${formattedResults}`
            );
          }

          // Add raw tool results to context for backward compatibility
          context.addToolResults(toolResults);
        } else {
          // If AI indicates continuation but provides no tools, it might be stuck or waiting for more info.
          // For now, we'll just continue, but this might need more sophisticated handling.
        }
      } catch (error) {
        game.simulacrum?.logger?.error('Agentic loop error:', error);
        ui.notifications.error(
          `Simulacrum | Agentic loop error: ${error.message}`
        );
        // Attempt to provide error context to AI for recovery, or terminate gracefully
        context.addError(error.message); // Assuming AgenticContext has an addError method
        this.showMessage(
          `Agentic loop encountered an error: ${error.message}. Attempting to recover...`
        );
        // For now, we'll break to prevent infinite error loops.
        break;
      }
    }

    if (iteration >= MAX_ITERATIONS) {
      this.showMessage(
        'Agentic loop terminated due to maximum iteration limit.'
      );
    } else if (this.abortController.signal.aborted) {
      this.showMessage('Operation cancelled by user.');
    }
  }

  /**
   * Cancels the ongoing agentic workflow.
   */
  cancel() {
    this.cancelled = true;
    this.abortController.abort();
    this.toolScheduler.abortAllTools(); // Assuming ToolScheduler has an abortAllTools method
    ui.notifications.warn(
      'Simulacrum | Agentic workflow cancellation requested.'
    );
  }
}
