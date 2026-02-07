/* eslint-disable complexity, max-lines-per-function, max-statements, max-depth, no-unused-vars, no-empty, camelcase, no-console, no-unreachable, max-params */
/**
 * AI Client - Abstraction layer for AI provider interactions
 * Handles different AI providers with a common interface
 */

import { createLogger, isDebugEnabled } from '../utils/logger.js';
import { SimulacrumError, APIError } from '../utils/errors.js';
import { normalizeAIResponse } from '../utils/ai-normalization.js';
import { emitRetryStatus } from './hook-manager.js';
import {
  createAbortError,
  isAbortError,
  throwIfAborted,
  isRetryableError,
  calculateRetryDelay,
  executeRetryDelay,
  buildConnectionRetryLabel,
  DEFAULT_RETRY_CONFIG,
} from '../utils/retry-helpers.js';
import { modelService } from './model-service.js';
// Import providers
import { AIProvider } from './providers/base-provider.js';
import { MockAIProvider } from './providers/mock-provider.js';
import { OpenAIProvider } from './providers/openai-provider.js';

// Re-export providers for backward compatibility
export { AIProvider, MockAIProvider, OpenAIProvider };

export const AI_ERROR_CODES = Object.freeze({
  TOOL_CALL_FAILURE: 'TOOL_CALL_FAILURE',
});

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
   * @throws {SimulacrumError} When unsupported provider baseURL is provided
   */
  constructor(config = {}) {
    this.apiKey = config.apiKey ? config.apiKey.trim() : config.apiKey;
    this.baseURL = config.baseURL;
    this.model = config.model;

    // Context length will be dynamically derived when needed
    this._fallbackContextLimit = 32000;
    try {
      if (typeof game !== 'undefined' && game?.settings?.get) {
        const configuredLimit = game.settings.get('simulacrum', 'fallbackContextLimit');
        if (configuredLimit && configuredLimit > 0) {
          this._fallbackContextLimit = configuredLimit;
        }
      }
    } catch {
      // Ignore settings access errors (e.g. during tests)
    }

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
   * Get context length - derives from model metadata or uses fallback
   * @returns {number} Context length
   */
  getContextLength() {
    if (this.model) {
      const { limit } = modelService.getContextLimit(this.model, this._fallbackContextLimit);
      return limit;
    }
    return this._fallbackContextLimit;
  }

  /**
   * Task-14: Apply configured API request delay to prevent rate limiting
   * @returns {Promise<void>}
   * @private
   */
  async _applyRequestDelay() {
    // Get delay from settings (in seconds), default to 0
    let delay = 0;
    try {
      if (typeof game !== 'undefined' && game?.settings?.get) {
        delay = game.settings.get('simulacrum', 'apiRequestDelay') || 0;
      }
    } catch {
      // Settings not available, use default
    }

    if (delay > 0) {
      // Delay is now in milliseconds directly
      const delayMs = delay;
      if (isDebugEnabled()) {
        createLogger('AIClient').debug(`Applying API request delay: ${delayMs}ms`);
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  /**
   * Validate message structure to prevent API errors
   * @param {Array} messages - Array of message objects
   * @returns {Array} Potentially repaired messages array
   * @private
   */
  _checkMessageStructure(messages) {
    if (!Array.isArray(messages)) {
      throw new Error('Messages must be an array');
    }

    messages.forEach((msg, index) => {
      if (!msg.role) {
        throw new Error(`Message at index ${index} missing 'role' property`);
      }
      // Content is optional for some roles in some APIs (e.g. assistant calls tool),
      // but generally we want to ensure it's at least present or handled.
      // For now, we'll just check it's not undefined if it's supposed to be there.
    });

    // Validate and repair tool call/response parity (critical for Mistral and other strict APIs)
    return this._validateToolCallParity(messages);
  }

  /**
   * Validate that every tool_call has a corresponding tool response
   * @param {Array} messages - Array of message objects
   * @private
   */
  _validateToolCallParity(messages) {
    const expectedToolResponses = new Set();
    const receivedToolResponses = new Set();

    // First pass: collect all expected tool call IDs and received tool responses
    for (const msg of messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          if (tc.id) {
            expectedToolResponses.add(tc.id);
          }
        }
      }
      if (msg.role === 'tool' && msg.tool_call_id) {
        receivedToolResponses.add(msg.tool_call_id);
      }
    }

    // Check for mismatches
    const missingResponses = [...expectedToolResponses].filter(id => !receivedToolResponses.has(id));
    const orphanResponses = [...receivedToolResponses].filter(id => !expectedToolResponses.has(id));

    if (missingResponses.length === 0 && orphanResponses.length === 0) {
      return messages; // No issues, return as-is
    }

    const logger = createLogger('AIClient');
    logger.warn('Tool call/response parity violation detected, auto-repairing:', {
      missingResponses: missingResponses.length,
      orphanResponses: orphanResponses.length,
    });

    // Log detailed message structure for debugging
    if (isDebugEnabled()) {
      logger.debug('Message structure before repair:', messages.map((m, i) => ({
        index: i,
        role: m.role,
        hasContent: !!m.content,
        toolCallIds: m.tool_calls?.map(tc => tc.id) || [],
        toolCallId: m.tool_call_id || null,
      })));
    }

    // Create a mutable copy
    let repairedMessages = [...messages];

    // Strategy 1: Add stub responses for missing tool responses
    if (missingResponses.length > 0) {
      const stubResponse = {
        error: 'Tool execution was interrupted or the conversation was restored from a previous session.',
        stale: true,
      };

      // Build a map of tool_call_id -> assistant message index
      const toolCallToAssistantIdx = new Map();
      for (let i = 0; i < repairedMessages.length; i++) {
        const msg = repairedMessages[i];
        if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
          for (const tc of msg.tool_calls) {
            if (tc.id && missingResponses.includes(tc.id)) {
              toolCallToAssistantIdx.set(tc.id, i);
            }
          }
        }
      }

      // Insert stub responses (in reverse order to avoid index shifting)
      const insertions = missingResponses.map(id => ({
        afterIndex: toolCallToAssistantIdx.get(id),
        message: {
          role: 'tool',
          content: JSON.stringify(stubResponse),
          tool_call_id: id,
        },
      })).sort((a, b) => b.afterIndex - a.afterIndex);

      for (const ins of insertions) {
        let insertPos = ins.afterIndex + 1;
        // Skip past any existing tool responses
        while (insertPos < repairedMessages.length && repairedMessages[insertPos].role === 'tool') {
          insertPos++;
        }
        repairedMessages.splice(insertPos, 0, ins.message);
      }
    }

    // Strategy 2: Remove orphan tool responses
    if (orphanResponses.length > 0) {
      repairedMessages = repairedMessages.filter(msg => {
        if (msg.role === 'tool' && msg.tool_call_id) {
          return !orphanResponses.includes(msg.tool_call_id);
        }
        return true;
      });
    }

    logger.info('Conversation auto-repaired successfully');
    return repairedMessages;
  }

  /**
   * Chat with AI using OpenAI-compatible API
   * @param {Array} messages - Array of message objects
   * @param {Array} tools - Optional tools for function calling
   * @returns {Promise<Object>} AI response
   */
  async chat(messages, tools = null, options = {}) {
    if (!this.baseURL) {
      throw new SimulacrumError('No baseURL configured for AI client');
    }

    // Task-14: Apply request delay to prevent rate limiting
    await this._applyRequestDelay();

    if (isDebugEnabled()) {
      createLogger('AIDiagnostics').info('Chat request context:', {
        messagesCount: messages.length,
        hasTools: !!tools,
        toolCount: tools ? tools.length : 0,
        isBackground: !!options.isBackground,
      });
    }

    const body = {
      model: this.model,
      // Sanitize messages to remove internal fields (like provider_metadata) that cause 400 errors
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {}),
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      })),
    };

    if (tools) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    let response;
    const __inJest = typeof process !== 'undefined' && process?.env && process.env.JEST_WORKER_ID;
    const __retryEnabled = !__inJest;
    const { maxRetries: MAX_RETRIES, initialDelayMs: INITIAL_DELAY_MS } = DEFAULT_RETRY_CONFIG;
    const signal = options.signal;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Check for cancellation at the start of each iteration
      throwIfAborted(signal);

      const headers = {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      };

      try {
        const url = new URL(`${this.baseURL.replace(/\/$/, '')}/chat/completions`);

        if (isDebugEnabled()) {
          const debugHeaders = { ...headers };
          if (debugHeaders.Authorization) {
            debugHeaders.Authorization =
              debugHeaders.Authorization.substring(0, 15) + '...[MASKED]';
          }
          createLogger('AIClient').info('Sending API Request:', {
            url: url.toString(),
            headers: debugHeaders,
            hasApiKey: !!this.apiKey,
            apiKeyLength: this.apiKey ? this.apiKey.length : 0,
          });
        }

        // Validate and auto-repair message structure (handles parity issues)
        body.messages = this._checkMessageStructure(body.messages);

        // Debug: Log message structure for tool_call_id issues
        if (isDebugEnabled()) {
          const msgSummary = body.messages.map(m => ({
            role: m.role,
            hasContent: !!m.content,
            hasToolCalls: !!(m.tool_calls && m.tool_calls.length),
            toolCallIds: (m.tool_calls || []).map(tc => tc.id),
            toolCallId: m.tool_call_id || null,
          }));
          createLogger('AIClient').info('Message structure before API call:', msgSummary);
        }

        const stringifiedBody = JSON.stringify(body);

        response = await fetch(url.toString(), {
          method: 'POST',
          headers,
          body: stringifiedBody,
          signal,
        });

        if (response.ok) {
          break;
        }

        const status = response.status;
        const shouldRetry = __retryEnabled && isRetryableError(null, status);

        if (shouldRetry && attempt < MAX_RETRIES) {
          const delay = calculateRetryDelay(attempt, INITIAL_DELAY_MS, true);
          const retryCallId = `api-retry-openai-${Date.now()}`;
          emitRetryStatus('start', retryCallId, buildConnectionRetryLabel(attempt + 2, MAX_RETRIES + 1));
          if (isDebugEnabled()) {
            createLogger('AIDiagnostics').info('Retrying API request', {
              attempt: attempt + 1,
              status,
              delay,
            });
          }
          await executeRetryDelay(delay, signal, retryCallId);
          emitRetryStatus('end', retryCallId);
        } else {
          break;
        }
      } catch (error) {
        // Check for abort error first - do NOT retry if user cancelled
        if (isAbortError(error, signal)) {
          throw createAbortError();
        }

        if (attempt >= MAX_RETRIES) {
          throw new Error(`Failed to fetch after ${MAX_RETRIES + 1} attempts: ${error.message}`);
        }
        const delay = calculateRetryDelay(attempt, INITIAL_DELAY_MS, true);
        const retryCallId = `api-retry-fetch-${Date.now()}`;
        emitRetryStatus('start', retryCallId, buildConnectionRetryLabel(attempt + 2, MAX_RETRIES + 1));
        await executeRetryDelay(delay, signal, retryCallId);
        emitRetryStatus('end', retryCallId);
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
      throw new APIError(`${response.status} - ${errorText}`);
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
          isEmpty: !msg.content || msg.content.trim().length === 0,
        },
        toolCalls: {
          count: (msg.tool_calls || []).length,
          names: (msg.tool_calls || []).map(tc => tc?.function?.name).filter(Boolean),
        },
        finishReason: choice?.finish_reason,
      });
    }

    const choice = data.choices?.[0];
    const msg = choice?.message ?? {};
    const content = typeof msg.content === 'string' ? msg.content : '';
    const tool_calls = msg.tool_calls || [];

    return {
      choices: [
        {
          message: {
            content,
            tool_calls,
          },
        },
      ],
      model: data.model,
      usage: data.usage,
    };
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
    const messages = [{ role: 'system', content: systemPrompt }, ...conversationMessages];
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
        const errorPart = message.includes(' - ')
          ? message.split(' - ').slice(1).join(' - ')
          : message;
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
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
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
  async validateOllama() {
    return this.validateOpenAI();
  }

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
    const providerName = options.provider || this.defaultProvider || 'openai';
    const provider = providerName ? this.providers.get(providerName) : null;

    if (provider) {
      if (!provider.isAvailable()) {
        throw new APIError(`Provider '${providerName}' is not available`);
      }
      try {
        const response = await provider.sendMessage(message, options.context || []);
        return {
          ...response,
          provider: providerName,
        };
      } catch (error) {
        throw new APIError(`AI request failed: ${error.message}`);
      }
    }

    const contextMessages = Array.isArray(options.context) ? options.context : [];
    const baseMessages = [...contextMessages, { role: 'user', content: message }];
    const raw = await this.chat(baseMessages, options.tools || null, {
      provider: providerName,
      signal: options.signal,
    });
    const normalized = normalizeAIResponse(raw);
    return {
      content: normalized.content,
      usage: normalized.usage || raw.usage,
      model: normalized.model || raw.model,
      provider: providerName,
      raw,
    };
  }

  /**
   * Generate a response from conversation history
   * @param {Array} messages - Array of message objects
   * @param {Object} options - Options including provider
   * @returns {Promise<Object>} AI response
   */
  async generateResponse(messages, options = {}) {
    const providerName = options.provider || this.defaultProvider || 'openai';
    const provider = providerName ? this.providers.get(providerName) : null;

    if (provider) {
      if (!provider.isAvailable()) {
        throw new APIError(`Provider '${providerName}' is not available`);
      }
      try {
        const response = await provider.generateResponse(messages);
        return {
          ...response,
          provider: providerName,
        };
      } catch (error) {
        throw new APIError(`AI request failed: ${error.message}`);
      }
    }

    const raw = await this.chat(messages, options.tools || null, {
      provider: providerName,
      signal: options.signal,
      systemPrompt: options.systemPrompt,
    });
    const normalized = normalizeAIResponse(raw);
    return {
      content: normalized.content,
      usage: normalized.usage || raw.usage,
      model: normalized.model || raw.model,
      provider: providerName,
      raw,
      toolCalls: normalized.toolCalls,
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
      available: provider.isAvailable(),
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
