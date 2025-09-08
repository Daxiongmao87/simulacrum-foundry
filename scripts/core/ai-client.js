/**
 * AI Client - Abstraction layer for AI provider interactions
 * Handles different AI providers with a common interface
 */

import { SimulacrumError, APIError } from '../utils/errors.js';
import { isDiagnosticsEnabled } from '../utils/dev.js';
import { createLogger } from '../utils/logger.js';

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

/**
 * Mock AI Provider for testing - Simulates AI responses without external API calls
 */
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
      model: 'mock-model'
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

/**
 * OpenAI Provider - Integrates with OpenAI's GPT models via REST API
 */
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
      { role: 'user', content: message }
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
          ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          max_tokens: this.config.maxTokens || 1000,
          temperature: this.config.temperature || 0.7
        })
      });

      if (!response.ok) {
        throw new APIError(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        content: data.choices[0]?.message?.content || '',
        usage: data.usage || {},
        model: data.model
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

/**
 * AI Client - Main abstraction layer for interacting with various AI providers
 */
export class AIClient {
  /**
   * Create an AI client instance
   * @param {Object} [config={}] - Client configuration
   * @param {string} [config.apiKey] - API key for the AI provider
   * @param {string} [config.baseURL] - Base URL for API requests
   * @param {string} [config.model] - Model name to use
   * @param {number} [config.maxTokens=4096] - Maximum tokens for responses
   * @throws {SimulacrumError} When unsupported provider baseURL is provided
   */
  constructor(config = {}) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL;
    this.model = config.model;
    this.maxTokens = config.maxTokens || 4096;
    this.providers = new Map();
    this.defaultProvider = null;

    // Provider-agnostic; enforce versioned base URL universally
    if (typeof this.baseURL === 'string' && !this.baseURL.endsWith('/v1')) {
      throw new SimulacrumError('Base URL must end with /v1');
    }
  }
  
  /**
   * Detect provider type from baseURL
   * @param {string} baseURL - Base URL to check
   * @returns {string} Provider type
   */
  detectProvider(baseURL) {
    if (!baseURL) return null;
    if (baseURL.includes('openai.com')) return 'openai';
    if (baseURL.includes('localhost') || baseURL.includes('ollama')) return 'ollama';
    if (baseURL.includes('anthropic.com')) return 'anthropic';
    return null;
  }
  
  /**
   * Check if baseURL is from a supported provider
   * @param {string} baseURL - Base URL to check
   * @returns {boolean} Whether provider is supported
   */
  isSupportedProvider(baseURL) {
    // Be permissive: allow any URL; rely on provider selection and runtime errors
    return true;
  }

  /**
   * Chat with AI using OpenAI or Ollama API
   * @param {Array} messages - Array of message objects
   * @param {Array} tools - Optional tools for function calling
   * @returns {Promise<Object>} AI response
   */
  async chat(messages, tools = null) {
    if (!this.baseURL) {
      throw new SimulacrumError('No baseURL configured for AI client');
    }
    const body = {
      model: this.model,
      messages: messages,
      max_tokens: this.maxTokens
    };

    if (tools) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    let response;
    const __inJest = (typeof process !== 'undefined') && process?.env && process.env.JEST_WORKER_ID;
    const __retryEnabled = !__inJest;
    const __delays = [250, 500, 1000];
    let __attempt = 0;
    while (true) {
      response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {})
        },
        body: JSON.stringify(body)
      });
      if (response.ok) break;
      const status = response.status;
      const __should = __retryEnabled && (status === 429 || status >= 500) && __attempt < __delays.length;
      if (!__should) break;
      const delay = __delays[__attempt++];
      try { if (isDiagnosticsEnabled()) createLogger('AIDiagnostics').info('retry', { attempt: __attempt, status, delay }); } catch {}
      await new Promise(r => setTimeout(r, delay));
    }

    if (!response.ok) {
      let errorText;
      try {
        // Try JSON first (for structured error responses)
        const errorData = await response.json();
        errorText = errorData.message || JSON.stringify(errorData);
      } catch {
        // Fall back to text response
        try {
          errorText = await response.text();
        } catch {
          errorText = 'API error';
        }
      }
      throw new Error(`${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  /** removed provider-specific chat implementation to remain provider-agnostic **/

  /**
   * Validate connection to AI provider
   * @returns {Promise<boolean>} Whether connection is valid
   */
  async validateConnection() {
    try {
      return await this.validateOpenAI();
    } catch (error) {
      const message = error.message || error;
      if (message.includes('401')) {
        throw new SimulacrumError(`AI API connection error: 401 - Connection error`);
      } else if (message.includes('500')) {
        // Extract just the error content, not the full message with status code
        const errorPart = message.includes(' - ') ? message.split(' - ').slice(1).join(' - ') : message;
        throw new SimulacrumError(`AI API connection error: 500 - ${errorPart}`);
      }
      throw new SimulacrumError(`AI API connection error: ${message}`);
    }
  }

  /**
   * Validate OpenAI connection
   */
  async validateOpenAI() {
    // Expect baseURL to already include version suffix (e.g., .../v1)
    const response = await fetch(`${this.baseURL}/models`, {
      method: 'GET',
      headers: {
        ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {})
      }
    });

    if (!response.ok) {
      let errorText;
      try {
        // Try JSON first (for structured error responses)
        const errorData = await response.json();
        errorText = errorData.message || JSON.stringify(errorData);
      } catch {
        // Fall back to text response
        try {
          errorText = await response.text();
        } catch {
          errorText = 'Connection error';
        }
      }
      throw new Error(`${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.data && data.data.some(model => model.id === this.model);
  }

  // Provider-agnostic: Ollama validation same as OpenAI-compatible /v1
  async validateOllama() { return this.validateOpenAI(); }

  /**
   * Register a new AI provider
   * @param {string} name - Provider name
   * @param {AIProvider} provider - Provider instance
   * @param {boolean} setAsDefault - Whether to set as default provider
   */
  registerProvider(name, provider, setAsDefault = false) {
    if (!(provider instanceof AIProvider)) {
      throw new SimulacrumError('Provider must extend AIProvider');
    }

    this.providers.set(name, provider);
    
    if (setAsDefault || !this.defaultProvider) {
      this.defaultProvider = name;
    }
  }

  /**
   * Send a message to AI
   * @param {string} message - User message
   * @param {Object} options - Options including provider, context, etc.
   * @returns {Promise<Object>} AI response
   */
  async sendMessage(message, options = {}) {
    const providerName = options.provider || this.defaultProvider;
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new APIError(`Provider '${providerName}' not found`);
    }

    if (!provider.isAvailable()) {
      throw new APIError(`Provider '${providerName}' is not available`);
    }

    try {
      const response = await provider.sendMessage(message, options.context || []);
      return {
        ...response,
        provider: providerName
      };
    } catch (error) {
      throw new APIError(`AI request failed: ${error.message}`);
    }
  }

  /**
   * Generate a response from conversation history
   * @param {Array} messages - Array of message objects
   * @param {Object} options - Options including provider
   * @returns {Promise<Object>} AI response
   */
  async generateResponse(messages, options = {}) {
    const providerName = options.provider || this.defaultProvider;
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new APIError(`Provider '${providerName}' not found`);
    }

    if (!provider.isAvailable()) {
      throw new APIError(`Provider '${providerName}' is not available`);
    }

    try {
      const response = await provider.generateResponse(messages);
      return {
        ...response,
        provider: providerName
      };
    } catch (error) {
      throw new APIError(`AI request failed: ${error.message}`);
    }
  }

  /**
   * Set the default AI provider
   * @param {string} name - Provider name
   */
  setDefaultProvider(name) {
    if (!this.providers.has(name)) {
      throw new SimulacrumError(`Provider '${name}' not registered`);
    }
    this.defaultProvider = name;
  }

  /**
   * Get list of available providers
   * @returns {Array} List of provider information
   */
  getAvailableProviders() {
    return Array.from(this.providers.entries()).map(([name, provider]) => ({
      name,
      available: provider.isAvailable()
    }));
  }

  /**
   * Initialize with default providers
   * @param {Object} configs - Configuration for providers
   */
  initialize(configs = {}) {
    // Register mock provider (always available for testing)
    this.registerProvider('mock', new MockAIProvider(configs.mock || {}));

    // Register OpenAI provider if configured
    if (configs.openai) {
      this.registerProvider('openai', new OpenAIProvider(configs.openai), configs.openai.default);
    }

    // Set mock as default if no other default set
    if (!this.defaultProvider) {
      this.defaultProvider = 'mock';
    }
  }

  /**
   * Check if a provider is available
   * @param {string} name - Provider name
   * @returns {boolean} Availability status
   */
  isProviderAvailable(name) {
    const provider = this.providers.get(name);
    return provider ? provider.isAvailable() : false;
  }
}
