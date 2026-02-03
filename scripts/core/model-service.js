/**
 * Model Service - Fetches and caches available models from the /models endpoint
 * Handles both OpenAI standard format { data: [...] } and raw array format
 */

import { createLogger } from '../utils/logger.js';

const MODULE_ID = 'simulacrum';
const logger = createLogger('ModelService');

class ModelService {
  /** @type {string[]} Cached list of model IDs */
  #cachedModels = [];

  /** @type {string|null} Base URL when cache was last populated */
  #cachedBaseURL = null;

  /** @type {string|null} API key when cache was last populated */
  #cachedApiKey = null;

  /** @type {Promise|null} In-flight fetch promise to prevent duplicate requests */
  #fetchPromise = null;

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
   * Parse models response - handles both { data: [...] } and raw array formats
   * Filters to only include text models with tool use support when metadata is available
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
    // Handle raw array format (LLM7 and some providers)
    else if (Array.isArray(data)) {
      modelList = data;
    }
    // Unknown format
    else {
      logger.warn('Unexpected models response format:', typeof data);
      return [];
    }

    // Extract model IDs, filtering based on capabilities when available
    return modelList
      .filter(m => this._isTextModelWithToolUse(m))
      .map(m => {
        // Handle object format with id property
        if (m && typeof m === 'object' && m.id) {
          return m.id;
        }
        // Handle string format (direct model name)
        if (typeof m === 'string') {
          return m;
        }
        return null;
      })
      .filter(id => id !== null)
      .sort((a, b) => a.localeCompare(b));
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
   * Invalidate the cache (called when settings change)
   */
  invalidateCache() {
    this.#cachedModels = [];
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
