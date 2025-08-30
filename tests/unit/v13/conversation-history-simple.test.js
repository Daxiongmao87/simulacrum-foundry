import { jest } from '@jest/globals';
import { SimulacrumAIService } from '../../../scripts/chat/ai-service.js';

describe('Conversation History - Simple Tests', () => {
  let aiService;
  let mockSettings;
  let mockFetch;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock settings
    mockSettings = new Map();
    mockSettings.set('apiEndpoint', 'http://test.api/v1');
    mockSettings.set('modelName', 'test-model');
    mockSettings.set('systemPrompt', '');
    mockSettings.set('contextLength', 8192);
    mockSettings.set('apiKey', 'test-key');
    
    // Mock fetch globally
    mockFetch = jest.fn();
    global.fetch = mockFetch;
    
    // Mock game object
    global.game = {
      settings: {
        get: jest.fn((module, key) => mockSettings.get(key))
      },
      simulacrum: {
        logger: {
          debug: jest.fn(),
          warn: jest.fn(),
          error: jest.fn()
        },
        toolRegistry: {
          getAllTools: jest.fn(() => [])
        }
      },
      i18n: {
        localize: jest.fn((key) => {
          if (key === 'SIMULACRUM.SYSTEM_PROMPT_LINES.0') {
            return 'Test system prompt';
          }
          if (key.startsWith('SIMULACRUM.SYSTEM_PROMPT_LINES.')) {
            return key; // Return key to signal end of array
          }
          return key;
        })
      }
    };
    
    // Create AI service with mocked tool registry
    const mockToolRegistry = {
      getAllTools: jest.fn(() => []),
      tools: new Map() // Add empty tools Map
    };
    aiService = new SimulacrumAIService(mockToolRegistry);
    
    // Mock structured output detector
    aiService.structuredOutputDetector = {
      detectStructuredOutputSupport: jest.fn().mockResolvedValue({
        supportsStructuredOutput: false,
        provider: 'openai',
        formatConfig: null,
        fallbackInstructions: ''
      })
    };
  });

  test('should maintain conversation history correctly', async () => {
    // First message - mock response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: 'Hello! How can I help you today?'
          }
        }]
      })
    });

    await aiService.sendMessage('Hello', null, null, null, false);

    // Check history after first exchange
    let history = aiService.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({
      role: 'user',
      content: 'Hello'
    });
    expect(history[1]).toEqual({
      role: 'assistant',
      content: 'Hello! How can I help you today?'
    });

    // Second message - mock response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: 'I am Simulacrum, your AI assistant for FoundryVTT.'
          }
        }]
      })
    });

    await aiService.sendMessage('What are you?', null, null, null, false);

    // Check history after second exchange
    history = aiService.getHistory();
    expect(history).toHaveLength(4);
    
    // Verify complete conversation flow
    expect(history[0]).toEqual({ role: 'user', content: 'Hello' });
    expect(history[1]).toEqual({ role: 'assistant', content: 'Hello! How can I help you today?' });
    expect(history[2]).toEqual({ role: 'user', content: 'What are you?' });
    expect(history[3]).toEqual({ role: 'assistant', content: 'I am Simulacrum, your AI assistant for FoundryVTT.' });
  });

  test('should include conversation history in API requests', async () => {
    // Add some history first
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: { content: 'First response' }
        }]
      })
    });

    await aiService.sendMessage('First message', null, null, null, false);

    // Clear mock to check next call
    mockFetch.mockClear();

    // Second message
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: { content: 'Second response' }
        }]
      })
    });

    await aiService.sendMessage('Second message', null, null, null, false);

    // Check the API call included history
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    const requestBody = JSON.parse(options.body);
    
    // Should have: system message + 2 history messages + current message = 4 total
    expect(requestBody.messages).toHaveLength(4);
    expect(requestBody.messages[0].role).toBe('system');
    expect(requestBody.messages[1]).toEqual({ role: 'user', content: 'First message' });
    expect(requestBody.messages[2]).toEqual({ role: 'assistant', content: 'First response' });
    expect(requestBody.messages[3]).toEqual({ role: 'user', content: 'Second message' });
  });

  test('should handle JSON mode responses with conversation history', async () => {
    const jsonResponse = JSON.stringify({
      message: "I'll help you with that.",
      tool_calls: [],
      continuation: { in_progress: false, gerund: null }
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: { content: jsonResponse }
        }]
      })
    });

    await aiService.sendJsonMessage('Help me create an NPC', null);

    const history = aiService.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: 'user', content: 'Help me create an NPC' });
    expect(history[1]).toEqual({ role: 'assistant', content: jsonResponse });
  });

  test('should handle streaming responses for Ollama', async () => {
    // Change endpoint to trigger Ollama mode
    mockSettings.set('apiEndpoint', 'http://localhost:11434');
    
    const jsonResponse = JSON.stringify({
      message: "Streaming response",
      tool_calls: [],
      continuation: { in_progress: false, gerund: null }
    });

    // Mock streaming response that properly simulates sequential reads
    let readCallCount = 0;
    const mockReader = {
      read: jest.fn(() => {
        readCallCount++;
        if (readCallCount === 1) {
          return Promise.resolve({
            done: false,
            value: new TextEncoder().encode(`data: {"choices":[{"delta":{"content":${JSON.stringify(jsonResponse)}}}]}\n\n`)
          });
        } else if (readCallCount === 2) {
          return Promise.resolve({
            done: false,
            value: new TextEncoder().encode('data: [DONE]\n\n')
          });
        } else {
          return Promise.resolve({
            done: true
          });
        }
      }),
      releaseLock: jest.fn()
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => mockReader
      }
    });

    await aiService.sendJsonMessage('Test streaming', null);

    const history = aiService.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: 'user', content: 'Test streaming' });
    expect(history[1].role).toBe('assistant');
    expect(history[1].content).toBe(jsonResponse);
  });

  test('should not duplicate messages in conversation history', async () => {
    // First exchange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: { content: 'Response 1' }
        }]
      })
    });

    await aiService.sendMessage('Message 1', null, null, null, false);

    // Check no duplicates
    const history = aiService.getHistory();
    const userMessages = history.filter(m => m.role === 'user' && m.content === 'Message 1');
    expect(userMessages).toHaveLength(1);
    
    const assistantMessages = history.filter(m => m.role === 'assistant' && m.content === 'Response 1');
    expect(assistantMessages).toHaveLength(1);
  });

  test('clearHistory should reset conversation', () => {
    // Add some messages to history manually
    aiService.conversationHistory = [
      { role: 'user', content: 'Test' },
      { role: 'assistant', content: 'Response' }
    ];

    expect(aiService.getHistory()).toHaveLength(2);
    
    aiService.clearHistory();
    
    expect(aiService.getHistory()).toEqual([]);
  });
});