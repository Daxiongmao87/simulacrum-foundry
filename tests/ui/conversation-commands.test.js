import { ConversationCommands } from '../../scripts/ui/conversation-commands.js';
import { ConversationManager } from '../../scripts/core/conversation.js';

// Mock ConversationManager
jest.mock('../../scripts/core/conversation.js');

// Mock FoundryVTT globals
global.game = {
  user: { id: 'test-user', name: 'Test User' },
  world: { id: 'test-world' }
};

global.ui = {
  simulacrum: {
    addMessage: jest.fn(),
    clearMessages: jest.fn()
  }
};

describe('ConversationCommands', () => {
  let mockConversationManager;

  beforeEach(() => {
    mockConversationManager = new ConversationManager('test-user', 'test-world');
    mockConversationManager.getSessionTokens = jest.fn().mockReturnValue(1500);
    mockConversationManager.maxTokens = 32000;
    mockConversationManager.messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' }
    ];
    mockConversationManager.clear = jest.fn();
    mockConversationManager.compressHistory = jest.fn();
    
    jest.clearAllMocks();
  });

  describe('parseCommand', () => {
    it('should parse /clear command', () => {
      const result = ConversationCommands.parseCommand('/clear');
      expect(result.command).toBe('clear');
      expect(result.args).toEqual([]);
    });

    it('should parse /compress command', () => {
      const result = ConversationCommands.parseCommand('/compress');
      expect(result.command).toBe('compress');
      expect(result.args).toEqual([]);
    });

    it('should parse /stats command', () => {
      const result = ConversationCommands.parseCommand('/stats');
      expect(result.command).toBe('stats');
      expect(result.args).toEqual([]);
    });

    it('should return null for non-commands', () => {
      const result = ConversationCommands.parseCommand('regular message');
      expect(result).toBeNull();
    });

    it('should return null for unknown commands', () => {
      const result = ConversationCommands.parseCommand('/unknown');
      expect(result).toBeNull();
    });
  });

  describe('executeCommand', () => {
    it('should execute clear command', async () => {
      const result = await ConversationCommands.executeCommand(
        'clear', 
        [], 
        mockConversationManager
      );

      expect(mockConversationManager.clear).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.message).toContain('cleared');
    });

    it('should execute compress command', async () => {
      const result = await ConversationCommands.executeCommand(
        'compress', 
        [], 
        mockConversationManager
      );

      expect(mockConversationManager.compressHistory).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.message).toContain('compressed');
    });

    it('should execute stats command', async () => {
      const result = await ConversationCommands.executeCommand(
        'stats', 
        [], 
        mockConversationManager
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('1500');
      expect(result.message).toContain('32000');
      expect(result.message).toContain('Messages**: 2');
    });

    it('should handle unknown commands', async () => {
      const result = await ConversationCommands.executeCommand(
        'unknown', 
        [], 
        mockConversationManager
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown command');
    });
  });

  describe('handleConversationCommand', () => {
    it('should process command and update UI', async () => {
      const result = await ConversationCommands.handleConversationCommand(
        '/clear',
        mockConversationManager
      );

      expect(result.success).toBe(true);
      expect(mockConversationManager.clear).toHaveBeenCalled();
    });

    it('should return false for non-commands', async () => {
      const result = await ConversationCommands.handleConversationCommand(
        'regular message',
        mockConversationManager
      );

      expect(result.success).toBe(false);
    });
  });
});