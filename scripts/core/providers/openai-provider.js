/**
 * OpenAI Provider - Integrates with OpenAI's GPT models via REST API
 */

import { AIProvider } from './base-provider.js';
import { APIError } from '../../utils/errors.js';

export class OpenAIProvider extends AIProvider {
  /**
   * Create an OpenAI provider instance
   * @param {Object} config - OpenAI configuration
   * @param {string} config.apiKey - OpenAI API key
   * @param {string} [config.baseURL='https://api.openai.com/v1'] - OpenAI API base URL
   * @param {string} [config.model='gpt-3.5-turbo'] - OpenAI model to use
   */
  constructor(config) {
    super(config);
    // Expect caller to provide versioned baseURL; default to standard v1
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    this.model = config.model || 'gpt-3.5-turbo';
  }

  /**
   * Send a message to OpenAI with conversation context
   * @param {string} message - The message to send
   * @param {Array} context - Previous conversation messages
   * @returns {Promise<Object>} OpenAI API response
   */
  async sendMessage(message, context = []) {
    const messages = [
      ...context.map(msg => ({ role: msg.role || 'user', content: msg.content })),
      { role: 'user', content: message },
    ];

    return this.generateResponse(messages);
  }

  /**
   * Generate a response from OpenAI using the chat completions API
   * @param {Array} messages - Array of message objects with role and content
   * @returns {Promise<Object>} Response with content, usage stats, and model info
   * @throws {APIError} When API key is missing or API request fails
   */
  async generateResponse(messages) {
    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          max_tokens: this.config.maxTokens || 1000,
          temperature: this.config.temperature || 0.7,
        }),
      });

      if (!response.ok) {
        throw new APIError(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      return {
        content: data.choices[0]?.message?.content || '',
        usage: data.usage || {},
        model: data.model,
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(`Failed to communicate with OpenAI: ${error.message}`);
    }
  }

  /**
   * Check if OpenAI provider is available (has API key configured)
   * @returns {boolean} True if API key is configured
   */
  isAvailable() {
    // Do not preemptively block on missing API key; allow provider to respond.
    return true;
  }
}
