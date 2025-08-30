/**
 * @file tests/unit/v13/ai-service-structured-output.test.js
 * @description Unit tests for AI service structured output integration (FoundryVTT v13)
 */

import { jest } from '@jest/globals';
import { SimulacrumAIService } from '../../../scripts/chat/ai-service.js';

// Mock the structured output detector module
const mockDetectStructuredOutputSupport = jest.fn();
const MockStructuredOutputDetector = jest.fn().mockImplementation(() => ({
  detectStructuredOutputSupport: mockDetectStructuredOutputSupport
}));

jest.unstable_mockModule('../../../scripts/core/structured-output-detector.js', () => ({
  StructuredOutputDetector: MockStructuredOutputDetector
}));

describe('AI Service Structured Output Integration v13', () => {
  let aiService;
  let mockToolRegistry;
  let mockStructuredDetector;

  beforeEach(() => {
    // Mock tool registry
    mockToolRegistry = {
      tools: new Map(),
      entries: function* () {
        yield* this.tools.entries();
      }
    };

    // Create AI service instance
    aiService = new SimulacrumAIService(mockToolRegistry);

    // Mock the structured output detector manually
    mockStructuredDetector = {
      detectStructuredOutputSupport: jest.fn()
    };
    aiService.structuredOutputDetector = mockStructuredDetector;

    // Mock game settings and other globals
    global.game = {
      settings: {
        get: jest.fn().mockImplementation((module, setting) => {
          const defaults = {
            'apiEndpoint': 'https://api.openai.com/v1',
            'modelName': 'gpt-4',
            'systemPrompt': '',
            'contextLength': 8192,
            'apiKey': 'test-api-key'
          };
          return defaults[setting] || '';
        })
      },
      world: { title: 'Test World' },
      system: { title: 'Test System', version: '1.0' },
      simulacrum: {
        logger: {
          debug: jest.fn(),
          warn: jest.fn(),
          error: jest.fn()
        }
      }
    };

    // Mock fetch
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.game;
    delete global.fetch;
    jest.clearAllMocks();
  });

  describe('getStructuredOutputConfig', () => {
    test('should return structured config when supported', async () => {
      const mockDetection = {
        supportsStructuredOutput: true,
        supportsNativeToolCalling: true, // New field added in refactor
        provider: 'openai',
        formatConfig: { type: 'json_schema', json_schema: { name: 'test' } },
        fallbackInstructions: 'fallback'
      };

      mockStructuredDetector.detectStructuredOutputSupport.mockResolvedValueOnce(mockDetection);

      const config = await aiService.getStructuredOutputConfig('https://api.openai.com/v1', 'gpt-4', false);
      
      expect(config).toEqual({
        useStructuredOutput: true,
        formatConfig: mockDetection.formatConfig,
        systemPromptAddition: 'fallback', // Now includes the fallback instructions
        supportsNativeToolCalling: true // New field added in refactor
      });

      expect(global.game.simulacrum.logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Capabilities detected') // New debug message format
      );
    });

    test('should return fallback config when not supported', async () => {
      const mockDetection = {
        supportsStructuredOutput: false,
        supportsNativeToolCalling: false, // New field added in refactor
        provider: 'openai',
        formatConfig: null,
        fallbackInstructions: '\n\n## FALLBACK JSON RULES\nUse proper JSON formatting...'
      };

      mockStructuredDetector.detectStructuredOutputSupport.mockResolvedValueOnce(mockDetection);

      const config = await aiService.getStructuredOutputConfig('https://api.openai.com/v1', 'old-model', false);
      
      expect(config).toEqual({
        useStructuredOutput: false,
        formatConfig: null,
        systemPromptAddition: mockDetection.fallbackInstructions,
        supportsNativeToolCalling: false // New field added in refactor
      });

      expect(global.game.simulacrum.logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Capabilities detected') // New debug message format
      );
    });

    test('should handle Ollama endpoints correctly', async () => {
      const mockDetection = {
        supportsStructuredOutput: true,
        provider: 'ollama',
        formatConfig: { format: 'json', schema: {} },
        fallbackInstructions: 'fallback'
      };

      mockStructuredDetector.detectStructuredOutputSupport.mockResolvedValueOnce(mockDetection);

      const config = await aiService.getStructuredOutputConfig('http://localhost:11434', 'llama2', true);
      
      expect(config.useStructuredOutput).toBe(true);
      expect(config.formatConfig).toEqual(mockDetection.formatConfig);
    });
  });

  describe('Integration with existing methods', () => {
    test('should call getStructuredOutputConfig in sendMessage workflow', async () => {
      // Mock the structured output detection
      const mockDetection = {
        supportsStructuredOutput: true,
        provider: 'openai',
        formatConfig: { type: 'json_schema' },
        fallbackInstructions: ''
      };

      mockStructuredDetector.detectStructuredOutputSupport.mockResolvedValueOnce(mockDetection);

      // Mock getDefaultSystemPrompt
      aiService.getDefaultSystemPrompt = jest.fn().mockResolvedValueOnce('System prompt');

      // Mock successful API response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ 
            message: { 
              content: JSON.stringify({
                message: "Test response",
                tool_calls: [],
                continuation: { in_progress: false, gerund: null }
              })
            }
          }]
        })
      });

      // Test that structured output config is called
      await aiService.sendMessage('Test message');
      
      expect(mockStructuredDetector.detectStructuredOutputSupport).toHaveBeenCalledWith(
        'https://api.openai.com/v1',
        'gpt-4'
      );
    });

    test('should include structured output config in request body', async () => {
      const mockDetection = {
        supportsStructuredOutput: true,
        provider: 'openai',
        formatConfig: { 
          type: 'json_schema',
          json_schema: { name: 'simulacrum_response', strict: true }
        },
        fallbackInstructions: ''
      };

      mockStructuredDetector.detectStructuredOutputSupport.mockResolvedValueOnce(mockDetection);
      aiService.getDefaultSystemPrompt = jest.fn().mockResolvedValueOnce('System prompt');

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '{"message":"test","continuation":{"in_progress":false,"gerund":null}}' } }]
        })
      });

      await aiService.sendMessage('Test message');
      
      const fetchCall = global.fetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      
      expect(requestBody.response_format).toEqual(mockDetection.formatConfig);
    });

    test('should add fallback instructions to system prompt when structured output not supported', async () => {
      const mockDetection = {
        supportsStructuredOutput: false,
        provider: 'openai',
        formatConfig: null,
        fallbackInstructions: '\n\n## FALLBACK JSON INSTRUCTIONS\nUse proper JSON...'
      };

      mockStructuredDetector.detectStructuredOutputSupport.mockResolvedValueOnce(mockDetection);
      aiService.getDefaultSystemPrompt = jest.fn().mockResolvedValueOnce('Base system prompt');

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '{"message":"test","continuation":{"in_progress":false,"gerund":null}}' } }]
        })
      });

      await aiService.sendMessage('Test message');
      
      const fetchCall = global.fetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const systemMessage = requestBody.messages.find(m => m.role === 'system');
      
      expect(systemMessage.content).toContain('Base system prompt');
      expect(systemMessage.content).toContain('FALLBACK JSON INSTRUCTIONS');
    });

    test('should handle Ollama structured output format', async () => {
      // Mock as Ollama endpoint
      global.game.settings.get.mockImplementation((module, setting) => {
        if (setting === 'apiEndpoint') return 'http://localhost:11434/v1';
        if (setting === 'modelName') return 'llama2';
        return '';
      });

      const mockDetection = {
        supportsStructuredOutput: true,
        provider: 'ollama',
        formatConfig: { format: 'json', schema: {} },
        fallbackInstructions: ''
      };

      mockStructuredDetector.detectStructuredOutputSupport.mockResolvedValueOnce(mockDetection);
      aiService.getDefaultSystemPrompt = jest.fn().mockResolvedValueOnce('System prompt');

      // Mock streaming response for Ollama
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({ 
            done: false, 
            value: new TextEncoder().encode('data: {"message": {"content": "{\\"message\\":\\"test\\",\\"continuation\\":{\\"in_progress\\":false,\\"gerund\\":null}}"}}\n\n')
          })
          .mockResolvedValueOnce({ done: true }),
        releaseLock: jest.fn()
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => mockReader
        }
      });

      await aiService.sendMessage('Test message');
      
      const fetchCall = global.fetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      
      // Should include structured output config for Ollama
      expect(requestBody.format).toBe('json');
      expect(requestBody.schema).toBeDefined();
    });
  });

  describe('Error handling', () => {
    test('should handle structured output detection failures gracefully', async () => {
      mockStructuredDetector.detectStructuredOutputSupport.mockResolvedValueOnce({
        supportsStructuredOutput: false,
        provider: 'openai',
        formatConfig: null,
        fallbackInstructions: '\n\nFallback instructions...'
      });

      aiService.getDefaultSystemPrompt = jest.fn().mockResolvedValueOnce('System prompt');
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '{"message":"test response","continuation":{"in_progress":false,"gerund":null}}' } }]
        })
      });

      const result = await aiService.sendMessage('Test message');
      
      // Should not throw and should complete successfully with fallback
      expect(result).toContain('test response');
      expect(mockStructuredDetector.detectStructuredOutputSupport).toHaveBeenCalled();
    });
  });
});