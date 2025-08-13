/**
 * Model Detection System
 * Intelligently detects available models from different API types
 */

/**
 * ModelDetector - Detects available models from API endpoints
 */
export class ModelDetector {
  constructor() {
    this.cache = new Map(); // Cache detection results
  }

  /**
   * Detect available models from API endpoint
   * @param {string} apiEndpoint - The API endpoint URL
   * @param {string} apiKey - Optional API key for authentication
   * @returns {Promise<Object>} Detection result with models array
   */
  async detectModels(apiEndpoint, apiKey = null) {
    if (!apiEndpoint) {
      return { type: 'none', models: [], detectable: false };
    }

    // Check cache first
    const cacheKey = `${apiEndpoint}:${apiKey || 'nokey'}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      console.log(`🤖 Detecting models for endpoint: ${apiEndpoint}`);

      // Test different endpoint patterns
      const detectionResults = await Promise.allSettled([
        this.testOllamaModels(apiEndpoint),
        this.testOpenAIModels(apiEndpoint, apiKey),
      ]);

      // Return first successful result
      for (const result of detectionResults) {
        if (result.status === 'fulfilled' && result.value.models.length > 0) {
          console.log(
            `🎯 Found ${result.value.models.length} models via ${result.value.type}`
          );
          this.cache.set(cacheKey, result.value);
          return result.value;
        }
      }

      // No models found
      const fallbackResult = { type: 'unknown', models: [], detectable: false };
      this.cache.set(cacheKey, fallbackResult);
      return fallbackResult;
    } catch (error) {
      console.warn('🤖 Model detection failed:', error);
      const errorResult = {
        type: 'error',
        models: [],
        detectable: false,
        error: error.message,
      };
      this.cache.set(cacheKey, errorResult);
      return errorResult;
    }
  }

  /**
   * Test Ollama API for available models
   * @param {string} apiEndpoint - API endpoint URL
   * @returns {Promise<Object>} Detection result
   */
  async testOllamaModels(apiEndpoint) {
    // Convert v1 endpoint to base Ollama endpoint
    const ollamaEndpoint = apiEndpoint
      .replace('/v1/chat/completions', '')
      .replace('/v1', '');
    const tagsUrl = `${ollamaEndpoint}/api/tags`;

    console.log(`🦙 Testing Ollama models at: ${tagsUrl}`);

    const response = await fetch(tagsUrl, {
      method: 'GET',
      timeout: 5000,
    });

    if (response.ok) {
      const data = await response.json();

      if (data.models && Array.isArray(data.models)) {
        const models = data.models
          .map((model) => ({
            id: model.name,
            name: model.name,
            size: model.size,
            modified: model.modified_at,
            details: model.details || {},
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        return {
          type: 'ollama',
          models,
          detectable: true,
          endpoint: tagsUrl,
        };
      }
    }

    throw new Error(`Ollama API failed: HTTP ${response.status}`);
  }

  /**
   * Test OpenAI-style API for available models
   * @param {string} apiEndpoint - API endpoint URL
   * @param {string} apiKey - API key for authentication
   * @returns {Promise<Object>} Detection result
   */
  async testOpenAIModels(apiEndpoint, apiKey) {
    const modelsUrl = `${apiEndpoint}/models`;
    console.log(`🔍 Testing OpenAI models at: ${modelsUrl}`);

    const headers = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers,
      timeout: 5000,
    });

    if (response.ok) {
      const data = await response.json();

      if (data.data && Array.isArray(data.data)) {
        // Filter to common chat models
        const models = data.data
          .filter(
            (model) =>
              model.id.includes('gpt') ||
              model.id.includes('o1') ||
              model.id.includes('o3') ||
              model.id.includes('anthropic') ||
              model.id.includes('llama') ||
              model.id.includes('mistral')
          )
          .map((model) => ({
            id: model.id,
            name: model.id,
            created: model.created,
            owned_by: model.owned_by || 'unknown',
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        return {
          type: 'openai',
          models,
          detectable: true,
          endpoint: modelsUrl,
        };
      }
    }

    // Check for auth errors
    if (response.status === 401) {
      throw new Error('API key required for model detection');
    }

    throw new Error(`OpenAI API failed: HTTP ${response.status}`);
  }

  /**
   * Get models for a specific API type (for testing)
   * @param {string} apiEndpoint - API endpoint URL
   * @param {string} apiType - 'ollama' or 'openai'
   * @param {string} apiKey - Optional API key
   * @returns {Promise<Object>} Detection result
   */
  async getModelsForType(apiEndpoint, apiType, apiKey = null) {
    try {
      if (apiType === 'ollama') {
        return await this.testOllamaModels(apiEndpoint);
      } else if (apiType === 'openai') {
        return await this.testOpenAIModels(apiEndpoint, apiKey);
      } else {
        throw new Error(`Unknown API type: ${apiType}`);
      }
    } catch (error) {
      console.warn(`🤖 Failed to get models for ${apiType}:`, error);
      return {
        type: apiType,
        models: [],
        detectable: false,
        error: error.message,
      };
    }
  }

  /**
   * Clear the model detection cache
   */
  clearCache() {
    this.cache.clear();
    console.log('🧹 Model detection cache cleared');
  }

  /**
   * Get cached result without network call
   * @param {string} apiEndpoint - API endpoint URL
   * @param {string} apiKey - Optional API key
   * @returns {Object|null} Cached detection result or null
   */
  getCachedResult(apiEndpoint, apiKey = null) {
    if (!apiEndpoint) return null;
    const cacheKey = `${apiEndpoint}:${apiKey || 'nokey'}`;
    return this.cache.get(cacheKey) || null;
  }

  /**
   * Validate if a specific model exists in detected models
   * @param {string} modelName - Model name to validate
   * @param {Array} models - Array of detected models
   * @returns {boolean} True if model exists
   */
  isValidModel(modelName, models) {
    return models.some(
      (model) => model.id === modelName || model.name === modelName
    );
  }

  /**
   * Get model suggestions based on partial input
   * @param {string} partialName - Partial model name
   * @param {Array} models - Array of detected models
   * @returns {Array} Array of matching models
   */
  getModelSuggestions(partialName, models) {
    if (!partialName || !models) return [];

    const query = partialName.toLowerCase();
    return models.filter(
      (model) =>
        model.id.toLowerCase().includes(query) ||
        model.name.toLowerCase().includes(query)
    );
  }
}
