import { ConversationManager } from '../../scripts/core/conversation.js';

describe('ConversationManager', () => {
  let conversationManager;

  beforeEach(() => {
    conversationManager = new ConversationManager('user1', 'world1', 1000);
  });

  describe('constructor', () => {
    it('should initialize with provided values', () => {
      expect(conversationManager.userId).toBe('user1');
      expect(conversationManager.worldId).toBe('world1');
      expect(conversationManager.maxTokens).toBe(1000);
      expect(conversationManager.messages).toEqual([]);
      expect(conversationManager.sessionTokens).toBe(0);
    });

    it('should use default maxTokens if not provided', () => {
      const manager = new ConversationManager('user1', 'world1');
      expect(manager.maxTokens).toBe(32000);
    });
  });
});

describe('ConversationManager addMessage', () => {
  let conversationManager;

  beforeEach(() => {
    conversationManager = new ConversationManager('user1', 'world1', 1000);
  });

  it('should add a simple message', () => {
    conversationManager.addMessage('user', 'Hello world');
    
    expect(conversationManager.messages).toHaveLength(1);
    expect(conversationManager.messages[0]).toEqual({
      role: 'user',
      content: 'Hello world'
    });
    expect(conversationManager.sessionTokens).toBeGreaterThan(0);
  });

  it('should add message with tool calls', () => {
    const toolCalls = [{ name: 'test_tool', arguments: '{}' }];
    conversationManager.addMessage('assistant', 'Using tool', toolCalls);
    
    expect(conversationManager.messages[0]).toEqual({
      role: 'assistant',
      content: 'Using tool',
      tool_calls: toolCalls
    });
  });

  it('should add message with tool call ID', () => {
    conversationManager.addMessage('tool', 'Tool response', null, 'call_123');
    
    expect(conversationManager.messages[0]).toEqual({
      role: 'tool',
      content: 'Tool response',
      tool_call_id: 'call_123'
    });
  });

  it('should update session token count', () => {
    const initialTokens = conversationManager.sessionTokens;
    conversationManager.addMessage('user', 'This is a test message');
    
    expect(conversationManager.sessionTokens).toBeGreaterThan(initialTokens);
  });
});

describe('ConversationManager compressHistory', () => {
  let conversationManager;

  beforeEach(() => {
    conversationManager = new ConversationManager('user1', 'world1', 1000);
  });

  it('should remove oldest messages when over token limit', () => {
    // Add messages that will exceed our test limit of 1000 tokens
    for (let i = 0; i < 200; i++) {
      conversationManager.addMessage('user', 'This is a long message that should use many tokens');
    }
    
    expect(conversationManager.sessionTokens).toBeGreaterThan(1000);
    const initialMessageCount = conversationManager.messages.length;
    
    conversationManager.compressHistory();
    
    expect(conversationManager.messages.length).toBeLessThan(initialMessageCount);
    expect(conversationManager.sessionTokens).toBeLessThanOrEqual(1000);
  });

  it('should preserve at least one message', () => {
    // Add one very long message
    const longMessage = 'word '.repeat(2000); // Should exceed token limit
    conversationManager.addMessage('user', longMessage);
    
    conversationManager.compressHistory();
    
    expect(conversationManager.messages.length).toBeGreaterThanOrEqual(1);
  });

  it('should not compress if under token limit', () => {
    conversationManager.addMessage('user', 'Short message');
    const initialMessages = conversationManager.messages.length;
    
    conversationManager.compressHistory();
    
    expect(conversationManager.messages.length).toBe(initialMessages);
  });
});

describe('ConversationManager utility methods', () => {
  let conversationManager;

  beforeEach(() => {
    conversationManager = new ConversationManager('user1', 'world1', 1000);
  });

  describe('clear', () => {
    it('should clear all messages and reset token count', () => {
      conversationManager.addMessage('user', 'Test message');
      conversationManager.addMessage('assistant', 'Response');
      
      expect(conversationManager.messages.length).toBeGreaterThan(0);
      expect(conversationManager.sessionTokens).toBeGreaterThan(0);
      
      conversationManager.clear();
      
      expect(conversationManager.messages).toEqual([]);
      expect(conversationManager.sessionTokens).toBe(0);
    });
  });

  describe('getMessages', () => {
    it('should return all messages', () => {
      conversationManager.addMessage('user', 'Message 1');
      conversationManager.addMessage('assistant', 'Message 2');
      
      const messages = conversationManager.getMessages();
      
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Message 1');
      expect(messages[1].content).toBe('Message 2');
    });

    it('should return empty array when no messages', () => {
      const messages = conversationManager.getMessages();
      expect(messages).toEqual([]);
    });
  });

  describe('getSessionTokens', () => {
    it('should return current token count', () => {
      expect(conversationManager.getSessionTokens()).toBe(0);
      
      conversationManager.addMessage('user', 'Test');
      
      expect(conversationManager.getSessionTokens()).toBeGreaterThan(0);
    });
  });
});

describe('ConversationManager private methods', () => {
  let conversationManager;

  beforeEach(() => {
    conversationManager = new ConversationManager('user1', 'world1', 1000);
  });

  describe('_estimateTokens', () => {
    it('should estimate tokens for message content', () => {
      const message = { content: 'hello world test' };
      const tokens = conversationManager._estimateTokens(message);
      
      expect(tokens).toBe(3); // Word count estimation
    });

    it('should estimate tokens for tool calls', () => {
      const message = {
        content: 'hello',
        tool_calls: [{ name: 'test', arguments: '{"param": "value"}' }]
      };
      const tokens = conversationManager._estimateTokens(message);
      
      expect(tokens).toBeGreaterThan(1);
    });

    it('should handle empty message', () => {
      const message = {};
      const tokens = conversationManager._estimateTokens(message);
      
      expect(tokens).toBe(0);
    });
  });

  describe('_getTokenEstimator', () => {
    it('should return token estimator with estimate function', () => {
      const estimator = conversationManager._getTokenEstimator();
      
      expect(estimator).toHaveProperty('estimate');
      expect(typeof estimator.estimate).toBe('function');
      
      const tokens = estimator.estimate('hello world');
      expect(tokens).toBe(2);
    });
  });
});