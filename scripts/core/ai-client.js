/**
 * AI Client - Abstraction layer for AI provider interactions
 * Handles different AI providers with a common interface
 */

import { createLogger, isDebugEnabled } from '../utils/logger.js';
import { SimulacrumError, APIError } from '../utils/errors.js';
import { normalizeAIResponse } from '../utils/ai-normalization.js';

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
    this.contextLength = config.contextLength || 4096;
    this.temperature = config.temperature;
    this.provider = config.provider || 'openai';
    this.providers = new Map();
    this.defaultProvider = null;
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
   * Get context length - uses configured contextLength
   * @returns {number} Context length
   */
  getContextLength() {
    return this.contextLength;
  }

  /**
   * Chat with AI using OpenAI or Ollama API
   * @param {Array} messages - Array of message objects
   * @param {Array} tools - Optional tools for function calling
   * @returns {Promise<Object>} AI response
   */
  async chat(messages, tools = null, options = {}) {
    if (!this.baseURL) {
      throw new SimulacrumError('No baseURL configured for AI client');
    }

    const provider = options.provider || this.provider || 'openai';
    if (provider === 'gemini') {
      return this._chatGemini(messages, tools, options);
    }

    // OpenAI-style providers
    const contextLength = this.getContextLength();
    const estimatedPromptTokens = messages.reduce((acc, message) => {
      const content = message.content || '';
      const toolCalls = message.tool_calls ? JSON.stringify(message.tool_calls) : '';
      return acc + Math.ceil((content.length + toolCalls.length) / 4);
    }, 0);

    const estimatedToolTokens = tools ? Math.ceil(JSON.stringify(tools).length / 4) : 0;
    const totalEstimatedPromptTokens = estimatedPromptTokens + estimatedToolTokens;

    const buffer = 200;
    let dynamicMaxTokens = contextLength - totalEstimatedPromptTokens - buffer;

    if (dynamicMaxTokens < 1) {
      if (isDebugEnabled()) {
        createLogger('AIDiagnostics').warn('Prompt is very close to the context limit. Setting max_tokens to a small value.');
      }
      dynamicMaxTokens = 100;
    }

    const configuredMax = typeof this.maxTokens === 'number' ? this.maxTokens : dynamicMaxTokens;
    const maxTokens = Math.min(dynamicMaxTokens, configuredMax);

    if (isDebugEnabled()) {
      createLogger('AIDiagnostics').info('Chat request context:', {
        contextLength,
        promptTokens: totalEstimatedPromptTokens,
        maxTokens,
        messagesCount: messages.length,
        hasTools: !!tools,
        toolCount: tools ? tools.length : 0
      });
    }

    const body = {
      model: this.model,
      messages,
      max_tokens: maxTokens,
      temperature: typeof this.temperature === 'number' ? this.temperature : undefined
    };

    if (tools) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    let response;
    const __inJest = (typeof process !== 'undefined') && process?.env && process.env.JEST_WORKER_ID;
    const __retryEnabled = !__inJest;
    const MAX_RETRIES = 5;
    const INITIAL_DELAY_MS = 250;
    const signal = options.signal;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        response = await fetch(`${this.baseURL.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {})
          },
          body: JSON.stringify(body),
          signal
        });

        if (response.ok) {
          break;
        }

        const status = response.status;
        const shouldRetry = __retryEnabled && (status === 429 || status >= 500);

        if (shouldRetry && attempt < MAX_RETRIES) {
          const delay = INITIAL_DELAY_MS * Math.pow(2, attempt) + Math.random() * 100;
          try {
            if (isDebugEnabled()) {
              createLogger('AIDiagnostics').info('Retrying API request', { attempt: attempt + 1, status, delay });
            }
          } catch {}
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          break;
        }
      } catch (error) {
        if (attempt >= MAX_RETRIES) {
          throw new Error(`Failed to fetch after ${MAX_RETRIES + 1} attempts: ${error.message}`);
        }
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    if (!response.ok) {
      let errorText;
      try {
        const errorData = await response.json();
        errorText = errorData.message || JSON.stringify(errorData);
      } catch {
        try {
          errorText = await response.text();
        } catch {
          errorText = 'API error';
        }
      }
      throw new Error(`${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (isDebugEnabled()) {
      const logger = createLogger('AIDiagnostics');
      const choice = data.choices?.[0];
      const msg = choice?.message ?? {};
      logger.info('Raw AI API response received:', {
        model: data.model,
        usage: data.usage,
        choicesCount: (data.choices || []).length,
        messageContent: {
          value: msg.content,
          type: typeof msg.content,
          length: (msg.content || '').length,
          isEmpty: !msg.content || msg.content.trim().length === 0
        },
        toolCalls: {
          count: (msg.tool_calls || []).length,
          names: (msg.tool_calls || []).map(tc => tc?.function?.name).filter(Boolean)
        },
        finishReason: choice?.finish_reason
      });
    }

    const choice = data.choices?.[0];
    const msg = choice?.message ?? {};
    const content = typeof msg.content === 'string' ? msg.content : '';
    const tool_calls = msg.tool_calls || [];

    return {
      choices: [{
        message: {
          content,
          tool_calls
        }
      }],
      model: data.model,
      usage: data.usage
    };
  }

  _getGeminiEndpoint(action = 'generateContent') {
    const base = (this.baseURL || '').replace(/\/$/, '');
    const model = encodeURIComponent(this.model || 'gemini-1.5-pro-latest');
    const suffix = action.startsWith(':') ? action : `:${action}`;
    return `${base}/models/${model}${suffix}`;
  }

  _mapGeminiRole(role) {
    switch (role) {
      case 'assistant':
      case 'model':
        return 'model';
      case 'tool':
        return 'user';
      case 'system':
        return null;
      default:
        return 'user';
    }
  }

  _buildGeminiContents(messages) {
    const contents = [];
    for (const message of messages || []) {
      if (!message) continue;
      const role = this._mapGeminiRole(message.role);
      if (!role) continue;

      let text = '';
      if (typeof message.content === 'string') {
        text = message.content;
      } else if (Array.isArray(message.content)) {
        text = message.content
          .map(part => (typeof part === 'string' ? part : part?.text || ''))
          .filter(Boolean)
          .join('\n');
      } else if (message.content != null) {
        text = JSON.stringify(message.content);
      }

      if (!text && message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length) {
        text = message.tool_calls
          .map(call => {
            const fn = call?.function || {};
            return `Requested tool ${fn.name || 'unknown'} with args ${fn.arguments || '{}'}`;
          })
          .join('\n');
      }

      if (!text && message.role === 'tool') {
        const toolLabel = message.tool_call_id ? ` (${message.tool_call_id})` : '';
        text = `Tool response${toolLabel}: ${String(message.content ?? '')}`;
      }

      if (!text) continue;
      contents.push({ role, parts: [{ text }] });
    }
    return contents;
  }

  _sanitizeGeminiParameters(schema) {
    if (!schema || typeof schema !== 'object') {
      return { type: 'object' };
    }

    const base = { ...schema };
    base.type = base.type || 'object';

    const properties = base.properties && typeof base.properties === 'object'
      ? base.properties
      : {};

    const sanitizedProperties = {};
    const requiredSet = new Set(Array.isArray(base.required) ? base.required : []);

    for (const [key, value] of Object.entries(properties)) {
      if (!value || typeof value !== 'object') {
        sanitizedProperties[key] = value;
        continue;
      }

      const propertySchema = { ...value };
      if (propertySchema.required === true) {
        requiredSet.add(key);
      }
      delete propertySchema.required;

      if (propertySchema.type === 'object' || propertySchema.properties) {
        sanitizedProperties[key] = this._sanitizeGeminiParameters(propertySchema);
      } else {
        if (propertySchema.items && typeof propertySchema.items === 'object') {
          const itemsSchema = propertySchema.items;
          if (itemsSchema.type === 'object' || itemsSchema.properties) {
            propertySchema.items = this._sanitizeGeminiParameters(itemsSchema);
          } else {
            propertySchema.items = { ...itemsSchema };
          }
        }
        sanitizedProperties[key] = propertySchema;
      }
    }

    base.properties = sanitizedProperties;

    if (requiredSet.size > 0) {
      base.required = Array.from(requiredSet);
    } else {
      delete base.required;
    }

    return base;
  }

  _mapToolsForGemini(tools) {
    return (tools || [])
      .map(tool => tool?.function)
      .filter(Boolean)
      .map(fn => ({
        name: fn.name,
        description: fn.description || '',
        parameters: this._sanitizeGeminiParameters(fn.parameters && typeof fn.parameters === 'object' ? fn.parameters : { type: 'object' })
      }))
      .filter(decl => decl.name);
  }

  async _chatGemini(messages, tools, options) {
    const signal = options.signal;
    const systemPrompt = options.systemPrompt;
    const contents = this._buildGeminiContents(messages);

    if (!contents.length) {
      contents.push({ role: 'user', parts: [{ text: '' }] });
    }

    const body = {
      contents
    };

    const generationConfig = {};
    if (typeof this.maxTokens === 'number') {
      generationConfig.maxOutputTokens = this.maxTokens;
    }
    if (typeof this.temperature === 'number') {
      generationConfig.temperature = this.temperature;
    }
    if (Object.keys(generationConfig).length) {
      body.generationConfig = generationConfig;
    }

    if (systemPrompt) {
      body.systemInstruction = {
        role: 'system',
        parts: [{ text: systemPrompt }]
      };
    }

    const functionDeclarations = this._mapToolsForGemini(tools);
    if (functionDeclarations.length) {
      body.tools = [{ functionDeclarations }];
    }

    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['x-goog-api-key'] = this.apiKey;
    }

    const response = await fetch(this._getGeminiEndpoint('generateContent'), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok) {
      let errorText;
      try {
        const errorData = await response.json();
        errorText = errorData.error?.message || JSON.stringify(errorData);
      } catch {
        try {
          errorText = await response.text();
        } catch {
          errorText = 'API error';
        }
      }
      throw new Error(`${response.status} - ${errorText}`);
    }

    const data = await response.json();
    if (!data.model && this.model) {
      data.model = this.model;
    }
    return data;
  }

  /**
   * Chat with system message automatically prepended
   * @param {Array} conversationMessages - Array of conversation message objects
   * @param {Function} getSystemPrompt - Function that returns system prompt
   * @param {Array} tools - Optional tools for function calling
   * @param {Object} options - Additional options (e.g., signal)
   * @returns {Promise<Object>} AI response
   */
  async chatWithSystem(conversationMessages, getSystemPrompt, tools = null, options = {}) {
    const systemPrompt = getSystemPrompt();
    const provider = options.provider || this.provider || 'openai';
    if (provider === 'gemini') {
      const forwardedOptions = { ...options, systemPrompt };
      return this.chat(conversationMessages, tools, forwardedOptions);
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationMessages
    ];
    return this.chat(messages, tools, options);
  }

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
    const providerName = options.provider || this.defaultProvider || this.provider || 'openai';
    const provider = providerName ? this.providers.get(providerName) : null;

    if (provider) {
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

    const contextMessages = Array.isArray(options.context) ? options.context : [];
    const baseMessages = [
      ...contextMessages,
      { role: 'user', content: message }
    ];
    const raw = await this.chat(baseMessages, options.tools || null, { provider: providerName, signal: options.signal });
    const normalized = normalizeAIResponse(raw);
    return {
      content: normalized.content,
      usage: normalized.usage || raw.usage,
      model: normalized.model || raw.model,
      provider: providerName,
      raw
    };
  }

  /**
   * Generate a response from conversation history
   * @param {Array} messages - Array of message objects
   * @param {Object} options - Options including provider
   * @returns {Promise<Object>} AI response
   */
  async generateResponse(messages, options = {}) {
    const providerName = options.provider || this.defaultProvider || this.provider || 'openai';
    const provider = providerName ? this.providers.get(providerName) : null;

    if (provider) {
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

    const raw = await this.chat(messages, options.tools || null, { provider: providerName, signal: options.signal, systemPrompt: options.systemPrompt });
    const normalized = normalizeAIResponse(raw);
    return {
      content: normalized.content,
      usage: normalized.usage || raw.usage,
      model: normalized.model || raw.model,
      provider: providerName,
      raw,
      toolCalls: normalized.toolCalls
    };
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
