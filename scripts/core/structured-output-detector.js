/**
 * Structured Output Detector
 *
 * Detects whether an API endpoint supports structured output
 * and provides appropriate format configuration.
 */

import {
  getOpenAIStructuredFormat,
  getOllamaStructuredFormat,
  FALLBACK_JSON_INSTRUCTIONS,
} from './structured-output-schema.js';

export class StructuredOutputDetector {
  constructor() {
    this.cache = new Map(); // Cache detection results
  }

  /**
   * Detects structured output support for an API endpoint
   * @param {string} endpoint - API endpoint URL
   * @param {string} modelName - Model name to test
   * @returns {Promise<Object>} Detection result with support info
   */
  async detectStructuredOutputSupport(endpoint, modelName) {
    const cacheKey = `${endpoint}|${modelName}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const result = {
      supportsStructuredOutput: false,
      provider: 'unknown',
      formatConfig: null,
      fallbackInstructions: FALLBACK_JSON_INSTRUCTIONS,
    };

    try {
      // Detect provider type
      if (this.isOllamaEndpoint(endpoint)) {
        result.provider = 'ollama';
        result.supportsStructuredOutput = await this.testOllamaStructuredOutput(
          endpoint,
          modelName
        );
        if (result.supportsStructuredOutput) {
          result.formatConfig = getOllamaStructuredFormat();
        }
      } else {
        result.provider = 'openai';
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
        'Structured output detection failed:',
        error.message
      );
      result.supportsStructuredOutput = false;
    }

    this.cache.set(cacheKey, result);
    return result;
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
