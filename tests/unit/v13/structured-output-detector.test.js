/**
 * @file tests/unit/v13/structured-output-detector.test.js
 * @description Unit tests for StructuredOutputDetector class (FoundryVTT v13)
 */

import { jest } from '@jest/globals';
import { StructuredOutputDetector } from '../../../scripts/core/structured-output-detector.js';

// Mock fetch globally
global.fetch = jest.fn();

describe('StructuredOutputDetector v13', () => {
  let detector;
  let mockGameSettings;

  beforeEach(() => {
    // Create detector instance
    detector = new StructuredOutputDetector();
    
    // Mock game.settings.get for API key
    mockGameSettings = {
      get: jest.fn().mockReturnValue('test-api-key')
    };
    
    global.game = {
      settings: mockGameSettings,
      simulacrum: {
        logger: {
          debug: jest.fn(),
          warn: jest.fn()
        }
      }
    };

    // Clear fetch mock
    global.fetch.mockClear();
  });

  afterEach(() => {
    delete global.game;
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with empty cache', () => {
      expect(detector.cache).toBeInstanceOf(Map);
      expect(detector.cache.size).toBe(0);
    });
  });

  describe('isOllamaEndpoint', () => {
    test('should detect localhost as Ollama', () => {
      expect(detector.isOllamaEndpoint('http://localhost:11434')).toBe(true);
    });

    test('should detect 127.0.0.1 as Ollama', () => {
      expect(detector.isOllamaEndpoint('http://127.0.0.1:11434')).toBe(true);
    });

    test('should detect ollama in URL as Ollama', () => {
      expect(detector.isOllamaEndpoint('http://example.com/ollama')).toBe(true);
    });

    test('should not detect OpenAI endpoint as Ollama', () => {
      expect(detector.isOllamaEndpoint('https://api.openai.com/v1')).toBe(false);
    });
  });

  describe('testOpenAIStructuredOutput', () => {
    test('should return true for successful OpenAI structured output test', async () => {
      // Mock successful OpenAI response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '{"test": "success"}' } }]
        })
      });

      const result = await detector.testOpenAIStructuredOutput('https://api.openai.com/v1', 'gpt-4');
      
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key'
          }),
          body: expect.stringContaining('"response_format"')
        })
      );
    });

    test('should return false for failed OpenAI request', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400
      });

      const result = await detector.testOpenAIStructuredOutput('https://api.openai.com/v1', 'gpt-4');
      
      expect(result).toBe(false);
    });

    test('should return false when fetch throws error', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await detector.testOpenAIStructuredOutput('https://api.openai.com/v1', 'gpt-4');
      
      expect(result).toBe(false);
      expect(global.game.simulacrum.logger.debug).toHaveBeenCalledWith(
        'OpenAI structured output test failed:',
        'Network error'
      );
    });
  });

  describe('testOllamaStructuredOutput', () => {
    test('should return true for successful Ollama structured output test', async () => {
      // Mock successful Ollama response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          message: { content: '{"test": "success"}' }
        })
      });

      const result = await detector.testOllamaStructuredOutput('http://localhost:11434', 'llama2');
      
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('format')
        })
      );
    });

    test('should return false for failed Ollama request', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      const result = await detector.testOllamaStructuredOutput('http://localhost:11434', 'llama2');
      
      expect(result).toBe(false);
    });

    test('should return false when fetch throws error', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await detector.testOllamaStructuredOutput('http://localhost:11434', 'llama2');
      
      expect(result).toBe(false);
      expect(global.game.simulacrum.logger.debug).toHaveBeenCalledWith(
        'Ollama structured output test failed:',
        'Connection refused'
      );
    });
  });

  describe('detectStructuredOutputSupport', () => {
    test('should detect and cache OpenAI structured output support', async () => {
      // Mock successful responses for both tool calling test and structured output test
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            choices: [{ message: { content: 'Hello' } }]
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            choices: [{ message: { content: '{"test": "success"}' } }]
          })
        });

      const result = await detector.detectStructuredOutputSupport('https://api.openai.com/v1', 'gpt-4');
      
      expect(result).toEqual({
        supportsStructuredOutput: true,
        supportsNativeToolCalling: expect.any(Boolean), // New field added in refactor
        provider: 'openai',
        formatConfig: expect.objectContaining({
          type: 'json_schema',
          json_schema: expect.objectContaining({
            name: 'simulacrum_response',
            strict: true
          })
        }),
        fallbackInstructions: expect.any(String) // Updated fallback instructions
      });

      // Verify caching
      expect(detector.cache.size).toBe(1);
      expect(detector.cache.has('https://api.openai.com/v1|gpt-4')).toBe(true);
    });

    test('should detect and cache Ollama structured output support', async () => {
      // Mock successful responses for both tool calling test and structured output test
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            choices: [{ message: { content: 'Hello' } }]
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            message: { content: '{"test": "success"}' }
          })
        });

      const result = await detector.detectStructuredOutputSupport('http://localhost:11434', 'llama2');
      
      expect(result).toEqual({
        supportsStructuredOutput: true,
        supportsNativeToolCalling: expect.any(Boolean), // New field added in refactor
        provider: 'ollama',
        formatConfig: expect.objectContaining({
          format: 'json',
          schema: expect.objectContaining({
            type: 'object',
            properties: expect.objectContaining({
              message: expect.any(Object),
              continuation: expect.any(Object)
            })
          })
        }),
        fallbackInstructions: expect.any(String) // Updated fallback instructions
      });

      expect(detector.cache.size).toBe(1);
    });

    test('should return cached result on second call', async () => {
      // First call - mock successful responses for both tool calling and structured output tests
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            choices: [{ message: { content: 'Hello' } }]
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            choices: [{ message: { content: '{"test": "success"}' } }]
          })
        });

      const firstResult = await detector.detectStructuredOutputSupport('https://api.openai.com/v1', 'gpt-4');
      
      // Second call - should use cache, no additional fetch calls
      const secondResult = await detector.detectStructuredOutputSupport('https://api.openai.com/v1', 'gpt-4');
      
      expect(global.fetch).toHaveBeenCalledTimes(2); // First call makes 2 requests, second call uses cache
      expect(firstResult).toEqual(secondResult);
    });

    test('should handle detection errors gracefully', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network failure'));

      const result = await detector.detectStructuredOutputSupport('https://api.openai.com/v1', 'gpt-4');
      
      expect(result).toEqual({
        supportsStructuredOutput: false,
        supportsNativeToolCalling: false, // New field added in refactor
        provider: 'openai',
        formatConfig: null,
        fallbackInstructions: expect.any(String) // Updated fallback instructions
      });

      // Verify the result shows proper fallback behavior
      expect(result.supportsStructuredOutput).toBe(false);
      expect(result.formatConfig).toBeNull();
    });

    test('should return fallback for unsupported API', async () => {
      // Mock API that doesn't support structured output
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400
      });

      const result = await detector.detectStructuredOutputSupport('https://api.openai.com/v1', 'gpt-3.5-turbo');
      
      expect(result.supportsStructuredOutput).toBe(false);
      expect(result.formatConfig).toBeNull();
      expect(result.fallbackInstructions).toContain('RESPONSE FORMAT');
    });
  });

  describe('clearCache', () => {
    test('should clear the cache', async () => {
      // Add something to cache first
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '{"test": "success"}' } }]
        })
      });

      await detector.detectStructuredOutputSupport('https://api.openai.com/v1', 'gpt-4');
      expect(detector.cache.size).toBe(1);

      detector.clearCache();
      expect(detector.cache.size).toBe(0);
    });
  });
});