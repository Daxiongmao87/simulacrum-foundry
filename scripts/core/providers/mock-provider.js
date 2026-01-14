/**
 * Mock AI Provider for testing - Simulates AI responses without external API calls
 */

import { AIProvider } from './base-provider.js';

export class MockAIProvider extends AIProvider {
  /**
   * Send a message and return a mock response
   * @param {string} message - The message to send
   * @param {Array} context - Conversation context
   * @returns {Promise<Object>} Mock AI response with content, usage, and model
   */
  async sendMessage(message, context = []) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      content: `Mock response to: ${message} (context: ${context.length} messages)`,
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      model: 'mock-model',
    };
  }

  /**
   * Generate a response from an array of messages
   * @param {Array} messages - Array of conversation messages
   * @returns {Promise<Object>} Mock AI response
   */
  async generateResponse(messages) {
    const lastMessage = messages[messages.length - 1];
    return this.sendMessage(lastMessage?.content || '', messages.slice(0, -1));
  }
}
