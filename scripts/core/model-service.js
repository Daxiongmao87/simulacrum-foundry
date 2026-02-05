/**
 * Model Service - Fetches and caches available models from the /models endpoint
 * Handles both OpenAI standard format { data: [...] } and raw array format
 */

import { createLogger } from '../utils/logger.js';

const MODULE_ID = 'simulacrum';
const logger = createLogger('ModelService');

/**
 * OpenRouter models API endpoint (public, no API key required)
 */
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

/**
 * Keys to search for context limit in model metadata (in priority order)
 * Supports both flat and nested paths (dot notation)
 */
const CONTEXT_LIMIT_KEYS = [
  'context_length',              // OpenRouter
  'context_window',              // Some providers
  'inputTokenLimit',             // Gemini
  'max_context_length',          // Alternative naming
  'top_provider.context_length', // OpenRouter nested
  'max_model_len',               // vLLM style
];

class ModelService {
  /** @type {string[]} Cached list of model IDs */
  #cachedModels = [];

  /** @type {Map<string, object>} Cached full model metadata by ID */
  #cachedModelMetadata = new Map();

  /** @type {string|null} Base URL when cache was last populated */
  #cachedBaseURL = null;

  /** @type {string|null} API key when cache was last populated */
  #cachedApiKey = null;

  /** @type {Promise|null} In-flight fetch promise to prevent duplicate requests */
  #fetchPromise = null;

  /** @type {Map<string, object>} Cached OpenRouter model metadata for cross-reference */
  #openRouterCache = new Map();

  /** @type {Promise|null} In-flight OpenRouter fetch promise */
  #openRouterFetchPromise = null;

  /** @type {boolean} Whether OpenRouter fetch has been attempted */
  #openRouterFetched = false;

  /**
   * Fetch available models from the /models endpoint
   * @param {boolean} [forceRefresh=false] - Force refresh even if cached
   * @returns {Promise<string[]>} Array of model IDs
   */
  async fetchModels(forceRefresh = false) {
    const baseURL = game.settings.get(MODULE_ID, 'baseURL');
    const apiKey = game.settings.get(MODULE_ID, 'apiKey');

    // Check if cache is valid
    if (!forceRefresh && this.#cachedModels.length > 0 &&
      this.#cachedBaseURL === baseURL && this.#cachedApiKey === apiKey) {
      return this.#cachedModels;
    }

    // If there's already a fetch in progress, wait for it
    if (this.#fetchPromise) {
      return this.#fetchPromise;
    }

    // Start new fetch
    this.#fetchPromise = this._doFetch(baseURL, apiKey);

    try {
      const models = await this.#fetchPromise;
      return models;
    } finally {
      this.#fetchPromise = null;
    }
  }

  /**
   * Perform the actual fetch operation
   * @param {string} baseURL - API base URL
   * @param {string} apiKey - API key
   * @returns {Promise<string[]>} Array of model IDs
   * @private
   */
  async _doFetch(baseURL, apiKey) {
    if (!baseURL) {
      logger.debug('No baseURL configured, returning empty models list');
      return [];
    }

    try {
      const modelsURL = baseURL.replace(/\/+$/, '') + '/models';
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(modelsURL, { method: 'GET', headers });

      if (!response.ok) {
        logger.warn(`Models endpoint returned ${response.status}`);
        return [];
      }

      const data = await response.json();
      const models = this._parseModelsResponse(data);

      // Update cache
      this.#cachedModels = models;
      this.#cachedBaseURL = baseURL;
      this.#cachedApiKey = apiKey;

      logger.debug(`Fetched ${models.length} models from endpoint`);
      return models;

    } catch (e) {
      logger.warn('Failed to fetch models:', e.message);
      return [];
    }
  }

  /**
   * Parse models response - handles various API formats:
   * - OpenAI: { data: [...] }
   * - Gemini: { models: [...] }
   * - Raw array format
   * Filters to only include text models with tool use support when metadata is available
   * Caches full model metadata for context limit extraction
   * @param {Object|Array} data - Response data from /models endpoint
   * @returns {string[]} Array of model IDs
   * @private
   */
  _parseModelsResponse(data) {
    let modelList = [];

    // Handle OpenAI standard format: { data: [...] }
    if (data?.data && Array.isArray(data.data)) {
      modelList = data.data;
    }
    // Handle Gemini format: { models: [...] }
    else if (data?.models && Array.isArray(data.models)) {
      modelList = data.models;
    }
    // Handle raw array format (LLM7 and some providers)
    else if (Array.isArray(data)) {
      modelList = data;
    }
    // Unknown format
    else {
      logger.warn('Unexpected models response format:', typeof data);
      return [];
    }

    // Clear existing metadata cache
    this.#cachedModelMetadata.clear();

    // Extract model IDs, filtering based on capabilities when available
    const filteredModels = modelList.filter(m => this._isTextModelWithToolUse(m));

    // Cache full metadata for each model - store as array for flexible lookup
    this.#cachedModelMetadata.set('__models__', filteredModels);

    return filteredModels
      .map(m => this._extractModelId(m))
      .filter(id => id !== null)
      .sort((a, b) => a.localeCompare(b));
  }

  /**
   * Extract model identifier from a model object
   * Tries common identifier fields
   * @param {Object|string} model - Model object or string
   * @returns {string|null} Model ID or null
   * @private
   */
  _extractModelId(model) {
    if (typeof model === 'string') return model;
    if (!model || typeof model !== 'object') return null;

    // Try common identifier fields in priority order
    return model.id || model.name || model.model || null;
  }

  /**
   * Recursively check if an object contains a specific value
   * @param {*} obj - Object to search
   * @param {string} value - Value to find
   * @returns {boolean} Whether value was found
   * @private
   */
  _containsValue(obj, value) {
    if (obj === value) return true;
    if (obj === null || obj === undefined) return false;
    if (typeof obj === 'string') return obj === value;
    if (typeof obj !== 'object') return false;

    for (const key of Object.keys(obj)) {
      if (this._containsValue(obj[key], value)) return true;
    }
    return false;
  }

  /**
   * Find a model object by its identifier using recursive search
   * @param {string} modelId - Model ID to find
   * @returns {object|null} Model object or null
   * @private
   */
  _findModelById(modelId) {
    const models = this.#cachedModelMetadata.get('__models__');
    if (!Array.isArray(models)) return null;

    // First try fast path: direct field match
    for (const model of models) {
      const id = this._extractModelId(model);
      if (id === modelId) return model;
    }

    // Fallback: recursive search for the value anywhere in the object
    for (const model of models) {
      if (this._containsValue(model, modelId)) return model;
    }

    return null;
  }

  /**
   * Check if a model is a text model with tool use support
   * Uses metadata fields when available (e.g., OpenRouter format)
   * Falls back to including the model if no metadata is present
   * @param {Object|string} model - Model object or string
   * @returns {boolean} True if model should be included
   * @private
   */
  _isTextModelWithToolUse(model) {
    // String format - no metadata, include it
    if (typeof model === 'string') {
      return true;
    }

    // Not an object - skip
    if (!model || typeof model !== 'object') {
      return false;
    }

    // Check for OpenRouter-style architecture metadata
    const arch = model.architecture;
    if (arch) {
      // Must have text output
      const outputModalities = arch.output_modalities || [];
      if (!outputModalities.includes('text')) {
        return false;
      }
    }

    // Check for supported_parameters (OpenRouter style)
    const supportedParams = model.supported_parameters;
    if (Array.isArray(supportedParams)) {
      // Must support tools or tool_choice
      if (!supportedParams.includes('tools') && !supportedParams.includes('tool_choice')) {
        return false;
      }
    }

    // No filtering metadata available, or passed all checks - include it
    return true;
  }

  /**
   * Get a nested value from an object using dot notation
   * @param {object} obj - Object to search
   * @param {string} path - Dot-notation path (e.g., "top_provider.context_length")
   * @returns {*} Value at path or undefined
   * @private
   */
  _getNestedValue(obj, path) {
    if (!obj || typeof obj !== 'object') return undefined;

    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }

    return current;
  }

  /**
   * Get cached metadata for a specific model
   * @param {string} modelId - Model ID to look up
   * @returns {object|null} Full model metadata or null if not cached
   */
  getModelMetadata(modelId) {
    return this._findModelById(modelId);
  }

  /**
   * Get context limit for a model, deriving from metadata or using fallback
   * Priority: Primary provider metadata → OpenRouter cross-reference → User fallback
   * @param {string} modelId - Model ID to look up
   * @param {number} [fallback=32000] - Fallback value if not derivable
   * @returns {{ limit: number, source: 'derived' | 'openrouter' | 'fallback' }} Context limit and source
   */
  getContextLimit(modelId, fallback = 32000) {
    // First try primary provider metadata
    const metadata = this._findModelById(modelId);
    if (metadata && typeof metadata === 'object') {
      for (const key of CONTEXT_LIMIT_KEYS) {
        const value = this._getNestedValue(metadata, key);
        if (typeof value === 'number' && value > 0) {
          logger.debug(`Derived context limit for ${modelId}: ${value} (from ${key})`);
          return { limit: value, source: 'derived' };
        }
      }
    }

    // Try OpenRouter cross-reference (check cache only, async fetch happens elsewhere)
    const orModel = this._findInOpenRouter(modelId);
    if (orModel && orModel.context_length > 0) {
      logger.debug(`OpenRouter context limit for ${modelId}: ${orModel.context_length}`);
      return { limit: orModel.context_length, source: 'openrouter' };
    }

    logger.debug(`Using fallback context limit for ${modelId}: ${fallback}`);
    return { limit: fallback, source: 'fallback' };
  }

  /**
   * Fetch OpenRouter models for cross-reference (public API, no key needed)
   * Should be called early to populate cache for later sync lookups
   * @returns {Promise<void>}
   */
  async fetchOpenRouterModels() {
    if (this.#openRouterFetched) return;
    if (this.#openRouterFetchPromise) {
      await this.#openRouterFetchPromise;
      return;
    }

    this.#openRouterFetchPromise = (async () => {
      try {
        const response = await fetch(OPENROUTER_MODELS_URL, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
          logger.warn(`OpenRouter models endpoint returned ${response.status}`);
          return;
        }

        const data = await response.json();
        const models = data?.data || [];

        // Cache by ID for fast lookup
        this.#openRouterCache.clear();
        for (const model of models) {
          if (model?.id) {
            this.#openRouterCache.set(model.id, model);
          }
        }

        logger.debug(`Fetched ${this.#openRouterCache.size} models from OpenRouter`);
      } catch (e) {
        logger.warn('Failed to fetch OpenRouter models:', e.message);
      } finally {
        this.#openRouterFetched = true;
      }
    })();

    await this.#openRouterFetchPromise;
    this.#openRouterFetchPromise = null;
  }

  /**
   * Find a model in OpenRouter cache by ID or partial match
   * @param {string} modelId - Model ID to find
   * @returns {object|null} OpenRouter model object or null
   * @private
   */
  _findInOpenRouter(modelId) {
    if (this.#openRouterCache.size === 0) return null;

    // Direct match
    if (this.#openRouterCache.has(modelId)) {
      return this.#openRouterCache.get(modelId);
    }

    // Try matching without provider prefix (e.g., "gpt-4" matches "openai/gpt-4")
    const baseName = modelId.includes('/') ? modelId.split('/').pop() : modelId;

    for (const [id, model] of this.#openRouterCache) {
      // Check if OpenRouter ID ends with the base model name
      if (id.endsWith(`/${baseName}`) || id === baseName) {
        return model;
      }
      // Check if our modelId ends with the OpenRouter base name
      const orBaseName = id.includes('/') ? id.split('/').pop() : id;
      if (modelId.endsWith(`/${orBaseName}`) || modelId === orBaseName) {
        return model;
      }
    }

    return null;
  }

  /**
   * Invalidate the cache (called when settings change)
   */
  invalidateCache() {
    this.#cachedModels = [];
    this.#cachedModelMetadata.clear();
    this.#cachedBaseURL = null;
    this.#cachedApiKey = null;
    logger.debug('Model cache invalidated');
  }

  /**
   * Get cached models without fetching
   * @returns {string[]} Cached model IDs or empty array
   */
  getCachedModels() {
    return this.#cachedModels;
  }
}

// Export singleton instance
export const modelService = new ModelService();
