/**
 * Structured Output Detector
 *
 * Detects whether an API endpoint supports structured output
 * and provides appropriate format configuration.
 */

import {
  getOpenAIStructuredFormat,
  getOllamaStructuredFormat,
  FALLBACK_NATURAL_LANGUAGE_INSTRUCTIONS,
  FALLBACK_JSON_INSTRUCTIONS,
} from './structured-output-schema.js';

export class StructuredOutputDetector {
  constructor() {
    this.cache = new Map(); // Cache detection results
  }

  /**
   * Detects both tool calling and structured output support for an API endpoint
   * @param {string} endpoint - API endpoint URL
   * @param {string} modelName - Model name to test
   * @returns {Promise<Object>} Detection result with support info
   */
  async detectCapabilities(endpoint, modelName) {
    const cacheKey = `${endpoint}|${modelName}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const result = {
      supportsNativeToolCalling: false,
      supportsStructuredOutput: false,
      provider: 'unknown',
      formatConfig: null,
      fallbackInstructions: FALLBACK_NATURAL_LANGUAGE_INSTRUCTIONS,
    };

    try {
      // Detect provider type and capabilities
      if (this.isOllamaEndpoint(endpoint)) {
        result.provider = 'ollama';

        // Test tool calling support first (more important)
        result.supportsNativeToolCalling = await this.testToolCallingSupport(
          endpoint,
          modelName,
          'ollama'
        );

        // Test structured output support (optional enhancement)
        result.supportsStructuredOutput = await this.testOllamaStructuredOutput(
          endpoint,
          modelName
        );
        if (result.supportsStructuredOutput) {
          result.formatConfig = getOllamaStructuredFormat();
        }
      } else {
        result.provider = 'openai';

        // Test tool calling support first (more important)
        result.supportsNativeToolCalling = await this.testToolCallingSupport(
          endpoint,
          modelName,
          'openai'
        );

        // Test structured output support (optional enhancement)
        result.supportsStructuredOutput = await this.testOpenAIStructuredOutput(
          endpoint,
          modelName
        );
        if (result.supportsStructuredOutput) {
          result.formatConfig = getOpenAIStructuredFormat();
        }
      }
    } catch (error) {
      game.simulacrum?.logger?.warn(
        'Capability detection failed:',
        error.message
      );
      result.supportsNativeToolCalling = false;
      result.supportsStructuredOutput = false;
    }

    // Set appropriate fallback instructions based on capabilities
    if (result.supportsNativeToolCalling) {
      // Best case: Native tool calling with natural language
      result.fallbackInstructions = '';
    } else {
      // Fallback: JSON format for systems without native tool calling
      result.fallbackInstructions = FALLBACK_JSON_INSTRUCTIONS;
    }

    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Tests native tool calling support
   * @param {string} endpoint
   * @param {string} modelName
   * @param {string} provider
   * @returns {Promise<boolean>}
   */
  async testToolCallingSupport(endpoint, modelName, provider) {
    try {
      // Simple test tool schema
      const testTools = [
        {
          type: 'function',
          function: {
            name: 'test_tool',
            description: 'Test tool for capability detection',
            parameters: {
              type: 'object',
              properties: {
                test: { type: 'string', description: 'Test parameter' },
              },
              required: ['test'],
            },
          },
        },
      ];

      const requestBody = {
        model: modelName,
        messages: [
          { role: 'user', content: 'Say hello, but do not call any tools.' },
        ],
        tools: testTools,
        temperature: 0.1,
        max_tokens: 10,
      };

      const apiEndpoint = endpoint.endsWith('/chat/completions')
        ? endpoint
        : `${endpoint}/chat/completions`;

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(provider === 'openai'
            ? {
                Authorization: `Bearer ${game.settings.get('simulacrum', 'apiKey') || ''}`,
              }
            : {}),
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        // If the response has a choices array and doesn't error, tool calling is supported
        const supportsToolCalling = data.choices && data.choices.length > 0;

        game.simulacrum?.logger?.debug(
          `Tool calling test result for ${apiEndpoint}: ${supportsToolCalling ? 'SUPPORTED' : 'NOT SUPPORTED'}`
        );

        return supportsToolCalling;
      }

      game.simulacrum?.logger?.debug(
        `Tool calling test failed for ${apiEndpoint}: HTTP ${response.status} ${response.statusText}`
      );
      return false;
    } catch (error) {
      game.simulacrum?.logger?.debug(
        'Tool calling test failed:',
        error.message
      );
      return false;
    }
  }

  // Keep the old method for backward compatibility but now includes tool calling info
  async detectStructuredOutputSupport(endpoint, modelName) {
    const capabilities = await this.detectCapabilities(endpoint, modelName);
    return {
      supportsStructuredOutput: capabilities.supportsStructuredOutput,
      supportsNativeToolCalling: capabilities.supportsNativeToolCalling,
      provider: capabilities.provider,
      formatConfig: capabilities.formatConfig,
      fallbackInstructions: capabilities.fallbackInstructions,
    };
  }

  /**
   * Determines if endpoint is Ollama-based
   * @param {string} endpoint
   * @returns {boolean}
   */
  isOllamaEndpoint(endpoint) {
    return (
      endpoint.includes('localhost') ||
      endpoint.includes('127.0.0.1') ||
      endpoint.includes('ollama')
    );
  }

  /**
   * Tests OpenAI structured output support
   * @param {string} endpoint
   * @param {string} modelName
   * @returns {Promise<boolean>}
   */
  async testOpenAIStructuredOutput(endpoint, modelName) {
    try {
      // Test with a simple schema
      const testSchema = {
        type: 'json_schema',
        json_schema: {
          name: 'test_response',
          schema: {
            type: 'object',
            properties: {
              test: { type: 'string' },
            },
            required: ['test'],
            additionalProperties: false,
          },
          strict: true,
        },
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${game.settings.get('simulacrum', 'apiKey') || ''}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'user', content: 'Respond with {"test": "success"}' },
          ],
          response_format: testSchema,
          max_tokens: 50,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Check if response contains structured data
        return !!data.choices?.[0]?.message?.content;
      }
      return false;
    } catch (error) {
      game.simulacrum?.logger?.debug(
        'OpenAI structured output test failed:',
        error.message
      );
      return false;
    }
  }

  /**
   * Tests Ollama structured output support
   * @param {string} endpoint
   * @param {string} modelName
   * @returns {Promise<boolean>}
   */
  async testOllamaStructuredOutput(endpoint, modelName) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'user', content: 'Respond with {"test": "success"}' },
          ],
          format: 'json',
          stream: false,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return !!data.message?.content;
      }
      return false;
    } catch (error) {
      game.simulacrum?.logger?.debug(
        'Ollama structured output test failed:',
        error.message
      );
      return false;
    }
  }

  /**
   * Clears the detection cache
   */
  clearCache() {
    this.cache.clear();
  }
}
