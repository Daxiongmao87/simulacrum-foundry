/**
 * @file tests/unit/v12/context-manager.test.js
 * @description Unit tests for ContextManager class - Issue #71
 */

import { jest } from '@jest/globals';
import { ContextManager } from '../../../scripts/context-manager.js';

describe('ContextManager', () => {
  let contextManager;
  let mockSettings;
  let mockCollections;

  beforeEach(() => {
    // Mock settings storage
    mockSettings = {
      contextItems: []
    };

    // Mock document collections
    mockCollections = new Map([
      ['Actor', {
        get: jest.fn((id) => {
          if (id === 'actor1') return { name: 'Test Actor 1' };
          if (id === 'actor2') return { name: 'Test Actor 2' };
          if (id === 'deleted') return null;
          return null;
        })
      }],
      ['Item', {
        get: jest.fn((id) => {
          if (id === 'item1') return { name: 'Test Item 1' };
          if (id === 'item2') return { name: 'Test Item 2' };
          return null;
        })
      }],
      ['JournalEntry', {
        get: jest.fn((id) => {
          if (id === 'journal1') return { name: 'Test Journal' };
          return null;
        })
      }]
    ]);

    // Mock FoundryVTT globals
    global.game = {
      collections: mockCollections,
      settings: {
        get: jest.fn((scope, key) => {
          if (scope === 'simulacrum' && key === 'contextItems') {
            return mockSettings.contextItems;
          }
          return undefined;
        }),
        set: jest.fn((scope, key, value) => {
          if (scope === 'simulacrum' && key === 'contextItems') {
            mockSettings.contextItems = value;
            return Promise.resolve();
          }
          return Promise.reject(new Error('Unknown setting'));
        })
      }
    };

    global.foundry = {
      utils: {
        randomID: jest.fn(() => 'mock-id-' + Math.random().toString(36).substr(2, 9))
      }
    };

    global.console = {
      warn: jest.fn(),
      error: jest.fn()
    };

    contextManager = new ContextManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(contextManager.contextItems).toEqual([]);
      expect(contextManager.maxContextSize).toBe(50);
    });

    it('should load from settings on initialization', () => {
      expect(global.game.settings.get).toHaveBeenCalledWith('simulacrum', 'contextItems');
    });

    it('should handle settings load failure gracefully', () => {
      global.game.settings.get = jest.fn(() => {
        throw new Error('Settings error');
      });
      
      const manager = new ContextManager();
      
      expect(manager.contextItems).toEqual([]);
      expect(global.console.warn).toHaveBeenCalledWith(
        'Simulacrum | Failed to load context from settings:',
        expect.any(Error)
      );
    });
  });

  describe('addDocument', () => {
    it('should add a new document to context', () => {
      const result = contextManager.addDocument('Actor', 'actor1');
      
      expect(result).toBe(true);
      expect(contextManager.contextItems).toHaveLength(1);
      expect(contextManager.contextItems[0]).toMatchObject({
        documentType: 'Actor',
        documentId: 'actor1',
        documentName: 'Test Actor 1'
      });
    });

    it('should prevent duplicate documents', () => {
      contextManager.addDocument('Actor', 'actor1');
      const result = contextManager.addDocument('Actor', 'actor1');
      
      expect(result).toBe(false);
      expect(contextManager.contextItems).toHaveLength(1);
    });

    it('should enforce maximum context size', () => {
      // Set smaller max size for testing
      contextManager.maxContextSize = 3;
      
      contextManager.addDocument('Actor', 'actor1');
      contextManager.addDocument('Item', 'item1');
      contextManager.addDocument('JournalEntry', 'journal1');
      
      // Should remove oldest when adding fourth
      contextManager.addDocument('Actor', 'actor2');
      
      expect(contextManager.contextItems).toHaveLength(3);
      expect(contextManager.contextItems[0].documentId).toBe('item1'); // actor1 was removed
      expect(contextManager.contextItems[2].documentId).toBe('actor2');
    });

    it('should save to settings after adding', () => {
      contextManager.addDocument('Actor', 'actor1');
      
      expect(global.game.settings.set).toHaveBeenCalledWith(
        'simulacrum',
        'contextItems',
        expect.arrayContaining([
          expect.objectContaining({
            documentType: 'Actor',
            documentId: 'actor1'
          })
        ])
      );
    });

    it('should handle document name lookup failure', () => {
      const result = contextManager.addDocument('UnknownType', 'unknown1');
      
      expect(result).toBe(true);
      expect(contextManager.contextItems[0].documentName).toBe('UnknownType unknown1');
    });

    it('should add timestamp to context items', () => {
      const beforeTime = new Date().toISOString();
      contextManager.addDocument('Actor', 'actor1');
      const afterTime = new Date().toISOString();
      
      const item = contextManager.contextItems[0];
      expect(new Date(item.addedAt).getTime()).toBeGreaterThanOrEqual(new Date(beforeTime).getTime());
      expect(new Date(item.addedAt).getTime()).toBeLessThanOrEqual(new Date(afterTime).getTime());
    });

    it('should generate unique IDs for each context item', () => {
      contextManager.addDocument('Actor', 'actor1');
      contextManager.addDocument('Item', 'item1');
      
      const ids = contextManager.contextItems.map(item => item.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('getContextItems', () => {
    beforeEach(() => {
      // Pre-populate with test data
      contextManager.contextItems = [
        { id: 'id1', documentType: 'Actor', documentId: 'actor1', documentName: 'Test Actor 1' },
        { id: 'id2', documentType: 'Actor', documentId: 'deleted', documentName: 'Deleted Actor' },
        { id: 'id3', documentType: 'Item', documentId: 'item1', documentName: 'Test Item 1' }
      ];
    });

    it('should return all valid context items', () => {
      const items = contextManager.getContextItems();
      
      expect(items).toHaveLength(2);
      expect(items[0].documentId).toBe('actor1');
      expect(items[1].documentId).toBe('item1');
    });

    it('should filter out non-existent documents', () => {
      const items = contextManager.getContextItems();
      
      expect(items).toHaveLength(2);
      expect(items.find(i => i.documentId === 'deleted')).toBeUndefined();
    });

    it('should return a copy of the array', () => {
      const items = contextManager.getContextItems();
      items.push({ id: 'test', documentType: 'Test', documentId: 'test1' });
      
      expect(contextManager.contextItems).toHaveLength(2); // Internal array unchanged
    });

    it('should handle collection access errors gracefully', () => {
      mockCollections.get('Actor').get = jest.fn(() => {
        throw new Error('Collection error');
      });
      
      const items = contextManager.getContextItems();
      
      expect(items).toHaveLength(1); // Only Item remains
      expect(items[0].documentType).toBe('Item');
    });

    it('should update internal state after filtering', () => {
      contextManager.getContextItems();
      
      expect(contextManager.contextItems).toHaveLength(2);
      expect(contextManager.contextItems.find(i => i.documentId === 'deleted')).toBeUndefined();
    });
  });

  describe('clearContext', () => {
    it('should remove all context items', () => {
      contextManager.addDocument('Actor', 'actor1');
      contextManager.addDocument('Item', 'item1');
      
      contextManager.clearContext();
      
      expect(contextManager.contextItems).toHaveLength(0);
    });

    it('should save empty array to settings', () => {
      contextManager.addDocument('Actor', 'actor1');
      jest.clearAllMocks();
      
      contextManager.clearContext();
      
      expect(global.game.settings.set).toHaveBeenCalledWith(
        'simulacrum',
        'contextItems',
        []
      );
    });
  });

  describe('removeContextItem', () => {
    beforeEach(() => {
      contextManager.contextItems = [
        { id: 'id1', documentType: 'Actor', documentId: 'actor1' },
        { id: 'id2', documentType: 'Item', documentId: 'item1' },
        { id: 'id3', documentType: 'JournalEntry', documentId: 'journal1' }
      ];
    });

    it('should remove specific context item by ID', () => {
      contextManager.removeContextItem('id2');
      
      expect(contextManager.contextItems).toHaveLength(2);
      expect(contextManager.contextItems.find(i => i.id === 'id2')).toBeUndefined();
    });

    it('should save to settings after removal', () => {
      contextManager.removeContextItem('id1');
      
      expect(global.game.settings.set).toHaveBeenCalledWith(
        'simulacrum',
        'contextItems',
        expect.arrayContaining([
          expect.objectContaining({ id: 'id2' }),
          expect.objectContaining({ id: 'id3' })
        ])
      );
    });

    it('should handle non-existent item ID gracefully', () => {
      contextManager.removeContextItem('non-existent');
      
      expect(contextManager.contextItems).toHaveLength(3);
    });
  });

  describe('getContextSummary', () => {
    it('should return empty message when no context', () => {
      const summary = contextManager.getContextSummary();
      
      expect(summary).toBe('No documents in context.');
    });

    it('should return formatted summary with context items', () => {
      contextManager.addDocument('Actor', 'actor1');
      contextManager.addDocument('Item', 'item1');
      
      const summary = contextManager.getContextSummary();
      
      expect(summary).toContain('Current context (2 items):');
      expect(summary).toContain('- Test Actor 1 (Actor)');
      expect(summary).toContain('- Test Item 1 (Item)');
    });

    it('should handle items with fallback names', () => {
      contextManager.contextItems = [
        { documentType: 'UnknownType', documentId: 'unknown1', documentName: 'UnknownType unknown1' }
      ];
      
      const summary = contextManager.getContextSummary();
      
      expect(summary).toContain('- UnknownType unknown1 (UnknownType)');
    });
  });

  describe('getDocumentName (private)', () => {
    it('should return document name when found', () => {
      const name = contextManager.getDocumentName('Actor', 'actor1');
      
      expect(name).toBe('Test Actor 1');
    });

    it('should return fallback when document not found', () => {
      const name = contextManager.getDocumentName('Actor', 'non-existent');
      
      expect(name).toBe('Actor non-existent');
    });

    it('should handle collection not found', () => {
      const name = contextManager.getDocumentName('UnknownType', 'id1');
      
      expect(name).toBe('UnknownType id1');
    });

    it('should handle collection access errors', () => {
      mockCollections.get('Actor').get = jest.fn(() => {
        throw new Error('Access error');
      });
      
      const name = contextManager.getDocumentName('Actor', 'actor1');
      
      expect(name).toBe('Actor actor1');
    });
  });

  describe('documentExists (private)', () => {
    it('should return true for existing document', () => {
      const exists = contextManager.documentExists('Actor', 'actor1');
      
      expect(exists).toBe(true);
    });

    it('should return false for non-existent document', () => {
      const exists = contextManager.documentExists('Actor', 'non-existent');
      
      expect(exists).toBe(false);
    });

    it('should return false for non-existent collection', () => {
      const exists = contextManager.documentExists('UnknownType', 'id1');
      
      expect(exists).toBe(false);
    });

    it('should handle collection access errors', () => {
      mockCollections.get('Actor').get = jest.fn(() => {
        throw new Error('Access error');
      });
      
      const exists = contextManager.documentExists('Actor', 'actor1');
      
      expect(exists).toBe(false);
    });
  });

  describe('saveToSettings (private)', () => {
    it('should save context items to settings', () => {
      contextManager.contextItems = [
        { id: 'id1', documentType: 'Actor', documentId: 'actor1' }
      ];
      
      contextManager.saveToSettings();
      
      expect(global.game.settings.set).toHaveBeenCalledWith(
        'simulacrum',
        'contextItems',
        contextManager.contextItems
      );
    });

    it('should handle settings save failure', () => {
      global.game.settings.set = jest.fn(() => {
        throw new Error('Save failed');
      });
      
      contextManager.saveToSettings();
      
      expect(global.console.error).toHaveBeenCalledWith(
        'Simulacrum | Failed to save context to settings:',
        expect.any(Error)
      );
    });
  });

  describe('loadFromSettings (private)', () => {
    it('should load context items from settings', () => {
      const savedItems = [
        { id: 'saved1', documentType: 'Actor', documentId: 'actor1' }
      ];
      mockSettings.contextItems = savedItems;
      
      contextManager.loadFromSettings();
      
      expect(contextManager.contextItems).toEqual(savedItems);
    });

    it('should handle empty settings', () => {
      mockSettings.contextItems = null;
      
      contextManager.loadFromSettings();
      
      expect(contextManager.contextItems).toEqual([]);
    });

    it('should handle settings load failure', () => {
      global.game.settings.get = jest.fn(() => {
        throw new Error('Load failed');
      });
      
      contextManager.loadFromSettings();
      
      expect(contextManager.contextItems).toEqual([]);
      expect(global.console.warn).toHaveBeenCalledWith(
        'Simulacrum | Failed to load context from settings:',
        expect.any(Error)
      );
    });
  });

  describe('integration scenarios', () => {
    it('should handle full context lifecycle', () => {
      // Add multiple documents
      contextManager.addDocument('Actor', 'actor1');
      contextManager.addDocument('Item', 'item1');
      contextManager.addDocument('JournalEntry', 'journal1');
      
      // Verify summary
      let summary = contextManager.getContextSummary();
      expect(summary).toContain('Current context (3 items):');
      
      // Remove one item
      const itemToRemove = contextManager.contextItems.find(i => i.documentType === 'Item');
      contextManager.removeContextItem(itemToRemove.id);
      
      // Verify removal
      expect(contextManager.contextItems).toHaveLength(2);
      summary = contextManager.getContextSummary();
      expect(summary).toContain('Current context (2 items):');
      expect(summary).not.toContain('Test Item 1');
      
      // Clear all
      contextManager.clearContext();
      summary = contextManager.getContextSummary();
      expect(summary).toBe('No documents in context.');
    });

    it('should persist context across instances', () => {
      // First instance adds items
      contextManager.addDocument('Actor', 'actor1');
      contextManager.addDocument('Item', 'item1');
      
      // Create new instance (simulates reload)
      const newManager = new ContextManager();
      
      // Should load saved items
      expect(newManager.contextItems).toHaveLength(2);
      expect(newManager.contextItems[0].documentId).toBe('actor1');
      expect(newManager.contextItems[1].documentId).toBe('item1');
    });

    it('should handle rapid additions at max capacity', () => {
      contextManager.maxContextSize = 3;
      
      // Rapidly add beyond capacity
      for (let i = 1; i <= 10; i++) {
        contextManager.addDocument('Actor', `actor${i}`);
      }
      
      // Should only keep last 3
      expect(contextManager.contextItems).toHaveLength(3);
      expect(contextManager.contextItems[0].documentId).toBe('actor8');
      expect(contextManager.contextItems[1].documentId).toBe('actor9');
      expect(contextManager.contextItems[2].documentId).toBe('actor10');
    });
  });
});