/**
 * @file tests/unit/document-discovery-engine.test.js
 * @description Unit tests for DocumentDiscoveryEngine class - Issue #69
 */

import { DocumentDiscoveryEngine } from '../../../scripts/core/document-discovery-engine.js';

describe('DocumentDiscoveryEngine', () => {
  let discoveryEngine;

  beforeEach(() => {
    // Mock FoundryVTT globals for each test
    global.game = {
      collections: new Map([
        ['Actor', {}],
        ['Item', {}],
        ['Scene', {}],
        ['JournalEntry', {}],
        ['Macro', {}],
        ['RollTable', {}],
        ['Playlist', {}],
        ['Cards', {}],
        ['Folder', {}]
      ])
    };

    global.CONFIG = {
      Actor: {
        typeLabels: {
          'npc': 'NPC',
          'character': 'Character'
        }
      },
      Item: {
        typeLabels: {
          'weapon': 'Weapon',
          'armor': 'Armor'
        }
      }
    };

    // Mock window.CONFIG for the DocumentDiscoveryEngine
    global.window = {
      CONFIG: global.CONFIG
    };

    discoveryEngine = new DocumentDiscoveryEngine();
  });

  describe('getAvailableTypes', () => {
    it('should return all user-creatable document types', async () => {
      const types = await discoveryEngine.getAvailableTypes();
      
      expect(types).toHaveProperty('Actor');
      expect(types).toHaveProperty('Item');
      expect(types).toHaveProperty('Scene');
      expect(types).toHaveProperty('JournalEntry');
      expect(types).toHaveProperty('Macro');
      expect(types).toHaveProperty('RollTable');
      expect(types).toHaveProperty('Playlist');
      expect(types).toHaveProperty('Cards');
      expect(types).toHaveProperty('Folder');
    });

    it('should include subtypes from CONFIG', async () => {
      const types = await discoveryEngine.getAvailableTypes();
      
      expect(types).toHaveProperty('npc');
      expect(types.npc).toEqual({
        collection: 'Actor',
        subtype: 'npc',
        label: 'NPC'
      });
      
      expect(types).toHaveProperty('weapon');
      expect(types.weapon).toEqual({
        collection: 'Item',
        subtype: 'weapon',
        label: 'Weapon'
      });
    });

    it('should mark collection types correctly', async () => {
      const types = await discoveryEngine.getAvailableTypes();
      
      expect(types.Actor).toEqual({
        collection: 'Actor',
        isCollection: true
      });
      
      expect(types.Item).toEqual({
        collection: 'Item',
        isCollection: true
      });
    });
  });

  describe('normalizeDocumentType', () => {
    it('should normalize collection types', async () => {
      const normalized = await discoveryEngine.normalizeDocumentType('Actor');
      
      expect(normalized).toEqual({
        collection: 'Actor',
        isCollection: true
      });
    });

    it('should normalize subtype types', async () => {
      const normalized = await discoveryEngine.normalizeDocumentType('npc');
      
      expect(normalized).toEqual({
        collection: 'Actor',
        subtype: 'npc',
        label: 'NPC'
      });
    });

    it('should throw error for unknown document type', async () => {
      await expect(
        discoveryEngine.normalizeDocumentType('UnknownType')
      ).rejects.toThrow('Document type "UnknownType" not found or is not creatable.');
    });
  });

  describe('discoverDocumentTypes', () => {
    it('should be an alias for getAvailableTypes', async () => {
      const types1 = await discoveryEngine.getAvailableTypes();
      const types2 = await discoveryEngine.discoverDocumentTypes();
      
      expect(types2).toEqual(types1);
    });
  });

  describe('getCreatableDocumentTypes', () => {
    it('should return all available types', async () => {
      const creatableTypes = await discoveryEngine.getCreatableDocumentTypes();
      const availableTypes = await discoveryEngine.getAvailableTypes();
      
      expect(creatableTypes).toEqual(availableTypes);
    });
  });
});
