/**
 * Tests for SimulacrumCore
 */

import { SimulacrumCore } from '../../scripts/core/simulacrum-core.js';
import { mapFallbackArguments, guessDocumentType } from '../../scripts/core/argument-mapper.js';

// Mock dependencies  
jest.mock('../../scripts/core/ai-client.js');
jest.mock('../../scripts/core/conversation.js');
jest.mock('../../scripts/core/tool-registry.js', () => ({
  toolRegistry: {
    getToolSchemas: jest.fn().mockReturnValue([])
  }
}));

function createMockGame() {
  return {
    settings: {
      get: jest.fn()
    },
    user: {
      id: 'test-user-123'
    },
    world: {
      id: 'test-world-456'
    }
  };
}

function createMockHooks() {
  return {
    once: jest.fn(),
    on: jest.fn()
  };
}

function setupDefaultSettings(mockGame) {
  mockGame.settings.get.mockImplementation((module, setting) => {
    const settings = {
      enabled: true,
      apiKey: 'sk-test123',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-3.5-turbo'
    };
    return settings[setting];
  });
}

describe('SimulacrumCore', () => {
  let mockGame;
  let mockHooks;

  beforeEach(() => {
    mockGame = createMockGame();
    mockHooks = createMockHooks();

    global.game = mockGame;
    global.Hooks = mockHooks;

    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with null AI client and conversation manager', () => {
      SimulacrumCore.init();

      expect(SimulacrumCore.aiClient).toBeNull();
      expect(SimulacrumCore.conversationManager).toBeNull();
    });

    it('should register FoundryVTT hooks on init', () => {
      SimulacrumCore.init();

      expect(mockHooks.once).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockHooks.on).toHaveBeenCalledWith('createDocument', expect.any(Function));
      expect(mockHooks.on).toHaveBeenCalledWith('updateDocument', expect.any(Function));
      expect(mockHooks.on).toHaveBeenCalledWith('deleteDocument', expect.any(Function));
    });
  });

  describe('onReady', () => {
    beforeEach(() => {
      setupDefaultSettings(mockGame);
    });

    // No module-level enabled gate; Manage Modules controls activation

    it('should initialize AI client and conversation manager when enabled', async () => {
      await SimulacrumCore.onReady();

      expect(SimulacrumCore.aiClient).toBeDefined();
      expect(SimulacrumCore.conversationManager).toBeDefined();
    });
  });

  describe('processMessage', () => {
    beforeEach(async () => {
      setupDefaultSettings(mockGame);
      await SimulacrumCore.onReady();
    });

    it('should initialize AI client if not already initialized', async () => {
      SimulacrumCore.aiClient = null;

      const response = await SimulacrumCore.processMessage('test message');

      expect(SimulacrumCore.aiClient).toBeDefined();
      expect(response).toBeDefined();
    });

    it('should return error response on processing failure', async () => {
      // Force an error by making aiClient null and failing initialization
      SimulacrumCore.aiClient = null;
      mockGame.settings.get.mockReturnValue(undefined); // Invalid settings

      const response = await SimulacrumCore.processMessage('test message');

      expect(response).toEqual({
        content: expect.stringContaining('Error:'),
        display: expect.stringContaining('❌')
      });
    });
  });

  describe('document change notifications', () => {
    it('should notify on document creation', () => {
      const mockDocument = {
        toJSON: jest.fn().mockReturnValue({ id: 'doc123', name: 'Test Doc' })
      };

      SimulacrumCore.notifyDocumentChange('create', mockDocument, 'user123');

      expect(mockDocument.toJSON).toHaveBeenCalled();
    });

    it('should notify on document update with changes', () => {
      const mockDocument = {
        toJSON: jest.fn().mockReturnValue({ id: 'doc123', name: 'Test Doc' })
      };
      const changes = { name: 'Updated Name' };

      SimulacrumCore.notifyDocumentChange('update', mockDocument, 'user123', changes);

      expect(mockDocument.toJSON).toHaveBeenCalled();
    });

    it('should notify on document deletion', () => {
      const mockDocument = {
        toJSON: jest.fn().mockReturnValue({ id: 'doc123', name: 'Test Doc' })
      };

      SimulacrumCore.notifyDocumentChange('delete', mockDocument, 'user123');

      expect(mockDocument.toJSON).toHaveBeenCalled();
    });
  });

  describe('argument compatibility mapper', () => {
    describe('_mapFallbackArguments', () => {
      it('should return original args for non-create_document tools', () => {
        const args = { someArg: 'value' };
        const result = mapFallbackArguments('read_document', args);
        
        expect(result).toBe(args);
      });

      it('should handle null/undefined arguments', () => {
        expect(mapFallbackArguments('create_document', null)).toBeNull();
        expect(mapFallbackArguments('create_document', undefined)).toBeUndefined();
      });

      it('should map {document_name, content} pattern to proper schema', () => {
        const args = {
          document_name: 'Test Dagger',
          content: '## Test Dagger\n\nA simple weapon with 1d4 damage.',
          process_label: 'Creating item...'
        };

        const result = mapFallbackArguments('create_document', args);

        expect(result).toEqual({
          documentType: 'Item', // Should detect weapon from content
          data: {
            name: 'Test Dagger',
            content: '## Test Dagger\n\nA simple weapon with 1d4 damage.'
          },
          process_label: 'Creating item...'
        });
      });

      it('should map {name, type, description} pattern to proper schema', () => {
        const args = {
          name: 'Fire Elemental',
          type: 'Actor',
          description: 'A hostile creature made of fire',
          img: 'tokens/fire-elemental.png',
          process_label: 'Creating NPC...'
        };

        const result = mapFallbackArguments('create_document', args);

        expect(result).toEqual({
          documentType: 'Actor',
          data: {
            name: 'Fire Elemental',
            description: 'A hostile creature made of fire',
            img: 'tokens/fire-elemental.png'
          },
          process_label: 'Creating NPC...'
        });
      });

      it('should preserve folder argument', () => {
        const args = {
          document_name: 'Test Item',
          content: 'Some content',
          folder: 'folder123'
        };

        const result = mapFallbackArguments('create_document', args);

        expect(result.data.folder).toBe('folder123');
      });
    });

    describe('_guessDocumentType', () => {
      beforeEach(() => {
        // Mock CONFIG for document type guessing
        global.CONFIG = {
          Document: {
            documentTypes: {
              'Item': {},
              'Actor': {},
              'Scene': {},
              'JournalEntry': {}
            }
          }
        };
      });

      afterEach(() => {
        delete global.CONFIG;
      });

      it('should detect weapon items from content', () => {
        const args = {
          document_name: 'Magic Sword',
          content: 'This weapon deals 1d8 damage and has special properties.'
        };

        const result = guessDocumentType(args);

        expect(result).toBe('Item');
      });

      it('should detect weapon items from name', () => {
        const args = {
          document_name: 'Shadowfang Dagger',
          content: 'A sleek black steel dagger.'
        };

        const result = guessDocumentType(args);

        expect(result).toBe('Item');
      });

      it('should detect actors from content', () => {
        const args = {
          document_name: 'Fire Elemental',
          content: 'This character is a hostile NPC with fire abilities.'
        };

        const result = guessDocumentType(args);

        expect(result).toBe('Actor');
      });

      it('should detect scenes from content', () => {
        const args = {
          document_name: 'Tavern',
          content: 'This scene represents the location where adventurers gather.'
        };

        const result = guessDocumentType(args);

        expect(result).toBe('Scene');
      });

      it('should detect journal entries from content', () => {
        const args = {
          document_name: 'Campaign Notes',
          content: 'These are important lore details about the world.'
        };

        const result = guessDocumentType(args);

        expect(result).toBe('JournalEntry');
      });

      it('should fallback to Item when no clear pattern matches', () => {
        const args = {
          document_name: 'Unknown Thing',
          content: 'Some mysterious content that does not match known patterns.'
        };

        const result = guessDocumentType(args);

        expect(result).toBe('Item');
      });

      it('should handle missing CONFIG gracefully', () => {
        delete global.CONFIG;

        const args = {
          document_name: 'Test',
          content: 'Test content'
        };

        const result = guessDocumentType(args);

        expect(result).toBe('Item'); // Ultimate fallback
      });

      it('should use first available document type when Item not available', () => {
        global.CONFIG = {
          Document: {
            documentTypes: {
              'CustomType': {},
              'AnotherType': {}
            }
          }
        };

        const args = {
          document_name: 'Test',
          content: 'Test content'
        };

        const result = guessDocumentType(args);

        expect(result).toBe('CustomType'); // First available type
      });
    });
  });
});
