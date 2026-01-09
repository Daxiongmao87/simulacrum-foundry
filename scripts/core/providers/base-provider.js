/**
 * Base AI Provider class - Abstract interface for AI service providers
 */

import { SimulacrumError } from '../../utils/errors.js';

/**
 * AI Provider interface - Abstract base class for AI service providers
 */
export class AIProvider {
  /**
   * Create an AI provider instance
   * @param {Object} config - Provider configuration
   * @param {string} config.apiKey - API key for the provider
   * @param {string} [config.baseURL] - Base URL for API requests
   * @param {string} [config.model] - Model name to use
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * Send a message to the AI provider
   * @param {string} message - The message to send
   * @param {Array} _context - Conversation context (unused in base class)
   * @returns {Promise<Object>} AI response
   * @throws {SimulacrumError} Must be implemented by subclass
   */
  async sendMessage(message, _context = []) {
    throw new SimulacrumError('sendMessage must be implemented by subclass');
  }

  /**
   * Generate a response from the AI provider
   * @param {Array} _messages - Array of messages for conversation
   * @returns {Promise<Object>} Generated response
   * @throws {SimulacrumError} Must be implemented by subclass
   */
  async generateResponse(_messages) {
    throw new SimulacrumError('generateResponse must be implemented by subclass');
  }

  /**
   * Check if the provider is available and properly configured
   * @returns {boolean} True if provider is available
   */
  isAvailable() {
    return true;
  }
}
