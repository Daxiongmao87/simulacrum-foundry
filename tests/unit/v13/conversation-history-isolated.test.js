import { jest } from '@jest/globals';

describe('Conversation History - Isolated Unit Tests', () => {
  let aiService;
  let mockFetch;
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Create a minimal mock for fetch
    mockFetch = jest.fn();
    global.fetch = mockFetch;
    
    // Mock all global dependencies
    global.game = {
      settings: {
        get: jest.fn().mockImplementation((module, key) => {
          const settings = {
            'apiEndpoint': 'http://test.api/v1',
            'modelName': 'test-model',
            'systemPrompt': '',
            'contextLength': 8192,
            'apiKey': 'test-key'
          };
          return settings[key];
        })
      },
      simulacrum: {
        logger: {
          debug: jest.fn(),
          warn: jest.fn(),
          error: jest.fn()
        }
      },
      i18n: {
        localize: jest.fn((key) => {
          if (key === 'SIMULACRUM.SYSTEM_PROMPT_LINES.0') {
            return 'Test system prompt';
          }
          return key;
        })
      }
    };
    
    // Create a test class that simulates the conversation history behavior
    class TestAIService {
      constructor() {
        this.conversationHistory = [];
      }
      
      addUserMessage(content) {
        this.conversationHistory.push({
          role: 'user',
          content: content
        });
      }
      
      addAssistantMessage(content) {
        this.conversationHistory.push({
          role: 'assistant',
          content: content
        });
      }
      
      getHistory() {
        return [...this.conversationHistory];
      }
      
      clearHistory() {
        this.conversationHistory = [];
      }
      
      getContextualHistory(maxTokens) {
        // Simple implementation - just return last 10 messages
        return this.conversationHistory.slice(-10);
      }
    }
    
    aiService = new TestAIService();
  });

  describe('Basic conversation history operations', () => {
    test('should start with empty history', () => {
      expect(aiService.getHistory()).toEqual([]);
    });

    test('should add user messages to history', () => {
      aiService.addUserMessage('Hello');
      
      const history = aiService.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual({
        role: 'user',
        content: 'Hello'
      });
    });

    test('should add assistant messages to history', () => {
      aiService.addAssistantMessage('Hello! How can I help?');
      
      const history = aiService.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual({
        role: 'assistant',
        content: 'Hello! How can I help?'
      });
    });

    test('should maintain conversation order', () => {
      aiService.addUserMessage('Hello');
      aiService.addAssistantMessage('Hi there!');
      aiService.addUserMessage('How are you?');
      aiService.addAssistantMessage('I am doing well, thanks!');
      
      const history = aiService.getHistory();
      expect(history).toHaveLength(4);
      expect(history[0].role).toBe('user');
      expect(history[0].content).toBe('Hello');
      expect(history[1].role).toBe('assistant');
      expect(history[1].content).toBe('Hi there!');
      expect(history[2].role).toBe('user');
      expect(history[2].content).toBe('How are you?');
      expect(history[3].role).toBe('assistant');
      expect(history[3].content).toBe('I am doing well, thanks!');
    });

    test('should clear history when requested', () => {
      aiService.addUserMessage('Test');
      aiService.addAssistantMessage('Response');
      expect(aiService.getHistory()).toHaveLength(2);
      
      aiService.clearHistory();
      expect(aiService.getHistory()).toEqual([]);
    });

    test('should return a copy of history, not the original array', () => {
      aiService.addUserMessage('Test');
      
      const history1 = aiService.getHistory();
      const history2 = aiService.getHistory();
      
      expect(history1).not.toBe(history2);
      expect(history1).toEqual(history2);
    });

    test('should handle contextual history with token limits', () => {
      // Add 15 messages
      for (let i = 0; i < 15; i++) {
        aiService.addUserMessage(`Message ${i}`);
        aiService.addAssistantMessage(`Response ${i}`);
      }
      
      const contextualHistory = aiService.getContextualHistory(8192);
      // Should only return last 10 messages
      expect(contextualHistory.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Message deduplication logic', () => {
    test('should not add duplicate consecutive user messages', () => {
      // Simulate the logic that should prevent duplicates
      const addMessageIfNotDuplicate = (message) => {
        const history = aiService.getHistory();
        const lastMessage = history[history.length - 1];
        
        if (!lastMessage || 
            lastMessage.role !== message.role || 
            lastMessage.content !== message.content) {
          if (message.role === 'user') {
            aiService.addUserMessage(message.content);
          } else {
            aiService.addAssistantMessage(message.content);
          }
        }
      };
      
      addMessageIfNotDuplicate({ role: 'user', content: 'Hello' });
      addMessageIfNotDuplicate({ role: 'user', content: 'Hello' }); // Should not be added
      
      const history = aiService.getHistory();
      expect(history).toHaveLength(1);
      expect(history.filter(m => m.content === 'Hello')).toHaveLength(1);
    });
  });

  describe('Conversation flow integrity', () => {
    test('should maintain proper user-assistant alternation', () => {
      aiService.addUserMessage('Question 1');
      aiService.addAssistantMessage('Answer 1');
      aiService.addUserMessage('Question 2');
      aiService.addAssistantMessage('Answer 2');
      
      const history = aiService.getHistory();
      
      // Check alternation
      for (let i = 0; i < history.length; i++) {
        if (i % 2 === 0) {
          expect(history[i].role).toBe('user');
        } else {
          expect(history[i].role).toBe('assistant');
        }
      }
    });

    test('should preserve message content integrity', () => {
      const complexMessage = 'This is a complex message with {"json": true} and special chars: éñ';
      aiService.addUserMessage(complexMessage);
      
      const history = aiService.getHistory();
      expect(history[0].content).toBe(complexMessage);
    });
  });

  describe('AgenticContext integration simulation', () => {
    test('should convert history to proper format for context', () => {
      // Add some conversation history
      aiService.addUserMessage('Create an NPC');
      aiService.addAssistantMessage('I will create an NPC for you.');
      aiService.addUserMessage('Make it a wizard');
      
      // Simulate context conversion
      const convertToContextFormat = (history) => {
        return history.map(msg => ({
          role: msg.role,
          content: msg.content
        }));
      };
      
      const contextMessages = convertToContextFormat(aiService.getHistory());
      expect(contextMessages).toHaveLength(3);
      expect(contextMessages[0]).toEqual({ role: 'user', content: 'Create an NPC' });
      expect(contextMessages[1]).toEqual({ role: 'assistant', content: 'I will create an NPC for you.' });
      expect(contextMessages[2]).toEqual({ role: 'user', content: 'Make it a wizard' });
    });

    test('should handle empty tool_calls in responses', () => {
      const responseWithEmptyTools = {
        message: "I understand your request.",
        tool_calls: [],
        continuation: { in_progress: false, gerund: null }
      };
      
      // Add the response content to history
      aiService.addAssistantMessage(JSON.stringify(responseWithEmptyTools));
      
      const history = aiService.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].role).toBe('assistant');
      
      // Verify the response can be parsed back
      const parsed = JSON.parse(history[0].content);
      expect(parsed.tool_calls).toEqual([]);
    });
  });

  describe('Edge cases', () => {
    test('should handle empty messages', () => {
      aiService.addUserMessage('');
      aiService.addAssistantMessage('');
      
      const history = aiService.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].content).toBe('');
      expect(history[1].content).toBe('');
    });

    test('should handle very long messages', () => {
      const longMessage = 'A'.repeat(10000);
      aiService.addUserMessage(longMessage);
      
      const history = aiService.getHistory();
      expect(history[0].content).toBe(longMessage);
      expect(history[0].content.length).toBe(10000);
    });

    test('should handle special characters and unicode', () => {
      const specialMessage = '🎭 Special "quoted" text with \\backslashes\\ and 中文字符';
      aiService.addUserMessage(specialMessage);
      
      const history = aiService.getHistory();
      expect(history[0].content).toBe(specialMessage);
    });
  });
});