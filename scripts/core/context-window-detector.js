/**
 * Context Window Detection System
 * Intelligently detects context window sizes from different API types
 */

/**
 * ContextWindowDetector - Detects API endpoint capabilities and context window sizes
 */
export class ContextWindowDetector {
  constructor() {
    this.cache = new Map(); // Cache detection results
  }

  /**
   * Detect endpoint type and capabilities
   * @param {string} apiEndpoint - The API endpoint URL
   * @returns {Promise<Object>} Detection result object
   */
  async detectEndpointType(apiEndpoint) {
    if (!apiEndpoint) {
      return { type: 'none', editable: false, visible: false };
    }

    // Check cache first
    const cacheKey = apiEndpoint.toLowerCase().trim();
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Only test endpoints ending in v1
    if (!apiEndpoint.endsWith('/v1')) {
      const result = {
        type: 'unknown',
        editable: true,
        visible: true,
        defaultValue: 8192,
        supportsDetection: false,
      };
      this.cache.set(cacheKey, result);
      return result;
    }

    try {
      console.log(`🔍 Testing API endpoint: ${apiEndpoint}`);

      // Test basic connectivity first
      const pingResponse = await fetch(`${apiEndpoint}/models`, {
        method: 'GET',
        timeout: 5000,
      });

      if (!pingResponse.ok && pingResponse.status !== 401) {
        // 401 is OK (just means auth required), but other errors mean unreachable
        const result = {
          type: 'unreachable',
          editable: true,
          visible: true,
          defaultValue: 8192,
          error: `HTTP ${pingResponse.status}`,
          supportsDetection: false,
        };
        this.cache.set(cacheKey, result);
        return result;
      }

      // Test api/show endpoint (Ollama-style)
      // First try to get current model name for testing
      let testModelName = 'test-model';
      try {
        const currentModel = game.settings.get('simulacrum', 'modelName');
        if (currentModel) {
          testModelName = currentModel;
        }
      } catch {
        // Use default test name if settings not available
      }

      const showEndpoint = apiEndpoint.replace('/v1', '/api/show');
      const showResponse = await fetch(showEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: testModelName }),
        timeout: 5000,
      });

      // For Ollama: 200 = success, 400/500 = model not found, 404 = endpoint not found
      // For OpenAI: 404/405 = endpoint doesn't exist
      if (
        showResponse.status === 200 ||
        (showResponse.status >= 400 &&
          showResponse.status < 500 &&
          showResponse.status !== 404 &&
          showResponse.status !== 405)
      ) {
        // Ollama-style API detected
        const result = {
          type: 'ollama',
          editable: false,
          visible: true,
          supportsDetection: true,
          showOverride: true,
          autoDetect: true,
        };
        console.log(`🎯 Detected Ollama API at ${apiEndpoint}`);
        this.cache.set(cacheKey, result);
        return result;
      } else {
        // OpenAI-style API detected (api/show returns 404)
        const result = {
          type: 'openai',
          editable: true,
          visible: true,
          defaultValue: 8192,
          supportsDetection: false,
          showOverride: false,
          autoDetect: false,
        };
        console.log(`🎯 Detected OpenAI-compatible API at ${apiEndpoint}`);
        this.cache.set(cacheKey, result);
        return result;
      }
    } catch (error) {
      console.warn(`🔍 API endpoint detection failed: ${error.message}`);
      const result = {
        type: 'error',
        editable: true,
        visible: true,
        defaultValue: 8192,
        error: error.message,
        supportsDetection: false,
      };
      this.cache.set(cacheKey, result);
      return result;
    }
  }

  /**
   * Get context window size for a specific model on Ollama
   * @param {string} apiEndpoint - API endpoint URL
   * @param {string} modelName - Model name to query
   * @returns {Promise<number>} Context window size in tokens
   */
  async getContextWindow(apiEndpoint, modelName) {
    if (!apiEndpoint || !modelName) {
      return 8192;
    }

    try {
      const showEndpoint = apiEndpoint.replace('/v1', '/api/show');
      console.log(
        `🔍 Getting context window for ${modelName} from ${showEndpoint}`
      );

      const response = await fetch(showEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
        timeout: 5000,
      });

      if (response.ok) {
        const data = await response.json();

        // Check parameters object first
        if (data.parameters?.num_ctx) {
          const contextWindow = parseInt(data.parameters.num_ctx);
          console.log(
            `🎯 Found context window in parameters: ${contextWindow}`
          );
          return contextWindow;
        }

        // Check modelfile for PARAMETER num_ctx
        if (data.modelfile) {
          const match = data.modelfile.match(/PARAMETER num_ctx (\d+)/);
          if (match) {
            const contextWindow = parseInt(match[1]);
            console.log(
              `🎯 Found context window in modelfile: ${contextWindow}`
            );
            return contextWindow;
          }
        }

        // Check other common locations
        if (data.model_info?.num_ctx) {
          const contextWindow = parseInt(data.model_info.num_ctx);
          console.log(
            `🎯 Found context window in model_info: ${contextWindow}`
          );
          return contextWindow;
        }

        console.log(
          `⚠️ No context window found for ${modelName}, using default 8192`
        );
        return 8192;
      }

      console.warn(
        `⚠️ Failed to get model info for ${modelName}: HTTP ${response.status}`
      );
      return 8192;
    } catch (error) {
      console.warn(
        `⚠️ Context window detection failed for ${modelName}: ${error.message}`
      );
      return 8192;
    }
  }

  /**
   * Clear the detection cache
   */
  clearCache() {
    this.cache.clear();
    console.log('🧹 Context window detection cache cleared');
  }

  /**
   * Get cached result without network call
   * @param {string} apiEndpoint - API endpoint URL
   * @returns {Object|null} Cached detection result or null
   */
  getCachedResult(apiEndpoint) {
    if (!apiEndpoint) {
      return null;
    }
    const cacheKey = apiEndpoint.toLowerCase().trim();
    return this.cache.get(cacheKey) || null;
  }
}
