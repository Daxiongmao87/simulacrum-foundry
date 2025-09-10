/**
 * ChatHandler - Single source of truth for all chat conversation flow
 * Orchestrates between AI, tools, conversation state, and UI
 */

import { createLogger } from '../utils/logger.js';

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

      // Get AI response through SimulacrumCore
      const { SimulacrumCore } = await import('./simulacrum-core.js');
      const aiResponse = await SimulacrumCore.generateResponse(
        this.conversationManager.getMessages(),
        { signal: options.signal }
      );

      // Handle the AI response
      return await this.handleAIResponse(aiResponse, options);

    } catch (error) {
      this.logger.error('Error processing user message', error);
      
      // Handle cancellation specially
      if (error.name === 'AbortError' || error.message === 'Process was cancelled') {
        const cancelMessage = { role: 'assistant', content: 'Process cancelled by user', display: '🛑 Process cancelled' };
        this.addMessageToUI(cancelMessage, options);
        return cancelMessage;
      }

      const errorMessage = { role: 'assistant', content: `Error: ${error.message}`, display: `❌ ${error.message}` };
      this.addMessageToConversation('assistant', errorMessage.content);
      this.addMessageToUI(errorMessage, options);
      return errorMessage;
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

    // Execute tools if present
    if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
      return await this.handleToolExecution(aiResponse.toolCalls, options);
    }

    // No tools - check if we should continue autonomous loop
    return await this.handleAutonomousFlow(aiResponse, options);
  }

  /**
   * Handle parse errors by continuing AI flow for correction
   */
  async handleParseError(parseErrorResponse, options = {}) {
    // Update system message with error feedback for AI
    this.conversationManager.updateSystemMessage(parseErrorResponse.content);
    
    // Continue the autonomous flow to get corrected response
    return await this.handleAutonomousFlow(parseErrorResponse, options);
  }

  /**
   * Execute tools and continue conversation flow
   */
  async handleToolExecution(toolCalls, options = {}) {
    try {
      const { processToolCallLoop } = await import('./tool-loop-handler.js');
      const { SimulacrumCore } = await import('./simulacrum-core.js');
      
      // Get tools and determine tool support mode
      const { toolRegistry } = await import('./tool-registry.js');
      const tools = toolRegistry.getToolSchemas();
      
      // Check legacy mode setting to determine tool support
      const legacyMode = game?.settings?.get('simulacrum', 'legacyMode') ?? false;
      const currentToolSupport = !legacyMode;
      
      // Execute tools and get final response
      const finalResponse = await processToolCallLoop(
        { toolCalls, content: '' },
        tools,
        this.conversationManager,
        SimulacrumCore.aiClient,
        SimulacrumCore.getSystemPrompt.bind(SimulacrumCore),
        currentToolSupport,
        options.signal,
        (toolResult) => this.handleToolResult(toolResult, options)
      );

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
        const lastMessage = this.conversationManager.messages[this.conversationManager.messages.length - 1];
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

    } catch (error) {
      this.logger.error('Error executing tools', error);
      
      const errorMessage = { role: 'assistant', content: `Tool execution error: ${error.message}`, display: `❌ ${error.message}` };
      this.addMessageToConversation('assistant', errorMessage.content);
      this.addMessageToUI(errorMessage, options);
      return errorMessage;
    }
  }

  /**
   * Handle autonomous flow continuation (when no tools but should continue)
   */
  async handleAutonomousFlow(response, options = {}) {
    // For now, just return the response - autonomous flow logic can be added here
    // This is where we would check for end_task or continue the conversation
    return response;
  }

  /**
   * Handle individual tool results during execution
   */
  handleToolResult(toolResult, options = {}) {
    // Add tool result to conversation
    if (toolResult.role === 'tool') {
      this.addMessageToConversation('tool', toolResult.content, null, toolResult.toolCallId);
    } else if (toolResult.role === 'assistant') {
      this.addMessageToConversation('assistant', toolResult.content);
      this.addMessageToUI({
        role: 'assistant',
        content: toolResult.content,
        display: toolResult.display || toolResult.content
      }, options);
    }
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