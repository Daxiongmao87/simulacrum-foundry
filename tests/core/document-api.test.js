// SPDX-License-Identifier: MIT
// Copyright © 2024-2025 Aaron Riechert

import { DocumentAPI } from '../../scripts/core/document-api.js';
import { 
  setupMockFoundryEnvironment, 
  cleanupMockEnvironment, 
  createParameterizedSystemTests,
  assertSystemAgnostic 
} from '../helpers/mock-setup.js';
import { ALL_GAME_SYSTEMS } from '../fixtures/game-systems.js';

// Parameterized tests across all game systems
describe.each(createParameterizedSystemTests())(
  'DocumentAPI with %s system',
  (systemName, systemConfig) => {
    beforeEach(() => {
      setupMockFoundryEnvironment(systemName);
    });

    afterEach(() => {
      cleanupMockEnvironment();
    });

    describe('Document Type Discovery', () => {
      test('should correctly identify valid document types', () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        // Test that all system document types are valid
        documentTypes.forEach(docType => {
          expect(DocumentAPI.isValidDocumentType(docType))
            .toBe(true);
        });

        // Test that invalid types return false
        expect(DocumentAPI.isValidDocumentType('InvalidType')).toBe(false);
        expect(DocumentAPI.isValidDocumentType('NonExistentType')).toBe(false);
      });

      test('should return all registered document types', () => {
        const types = DocumentAPI.getAllDocumentTypes();
        const expectedTypes = Object.keys(game.documentTypes || {});
        
        expect(types.sort()).toEqual(expectedTypes.sort());
      });

      test('should handle empty document type configuration', () => {
        if (Object.keys(game.documentTypes || {}).length === 0) {
          const types = DocumentAPI.getAllDocumentTypes();
          expect(types).toEqual([]);
        }
      });
    });

    describe('Schema Introspection', () => {
      test('should return schema for valid document types', () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        documentTypes.forEach(docType => {
          // Skip if no document class configured
          if (!CONFIG[docType]?.documentClass) return;
          
          const schema = DocumentAPI.getDocumentSchema(docType);
          expect(schema).toBeDefined();
          expect(schema.type).toBe(docType);
          expect(Array.isArray(schema.fields)).toBe(true);
          expect(Array.isArray(schema.embedded)).toBe(true);
          expect(typeof schema.relationships).toBe('object');
          expect(typeof schema.references).toBe('object');
        });
      });

      test('should return null for invalid document type schema', () => {
        const schema = DocumentAPI.getDocumentSchema('InvalidType');
        expect(schema).toBeNull();
      });

      test('should correctly identify embedded document relationships', () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        documentTypes.forEach(docType => {
          const documentClass = CONFIG[docType]?.documentClass;
          if (!documentClass) return;
          
          const schema = DocumentAPI.getDocumentSchema(docType);
          if (!schema) return;
          
          // Validate embedded relationships match hierarchy
          const hierarchy = documentClass.hierarchy || {};
          const embeddedKeys = Object.keys(hierarchy);
          
          expect(schema.embedded.sort()).toEqual(embeddedKeys.sort());
          
          // Validate relationship structure
          embeddedKeys.forEach(key => {
            const relationship = schema.relationships[key];
            expect(relationship).toBeDefined();
            expect(relationship.type).toBe('embedded');
            expect(relationship.collection).toBe(key);
          });
        });
      });

      test('should handle document types with no embedded documents', () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        documentTypes.forEach(docType => {
          const documentClass = CONFIG[docType]?.documentClass;
          if (!documentClass) return;
          
          const schema = DocumentAPI.getDocumentSchema(docType);
          if (!schema) return;
          
          const hierarchy = documentClass.hierarchy || {};
          const hasEmbedded = Object.keys(hierarchy).length > 0;
          
          if (!hasEmbedded) {
            expect(schema.embedded).toEqual([]);
          }
        });
      });
    });

    describe('System-Agnostic Behavior', () => {
      test('should work consistently across all systems', () => {
        // Test that core functionality works regardless of document types
        expect(typeof DocumentAPI.isValidDocumentType).toBe('function');
        expect(typeof DocumentAPI.getAllDocumentTypes).toBe('function');
        expect(typeof DocumentAPI.getDocumentSchema).toBe('function');
        
        const types = DocumentAPI.getAllDocumentTypes();
        expect(Array.isArray(types)).toBe(true);
      });
    });
  }
);

// System-agnostic tests that should work with any configuration
describe('DocumentAPI - System-Agnostic Tests', () => {
  test('should handle edge cases consistently across systems', () => {
    assertSystemAgnostic(
      () => {
        return {
          invalidTypeResult: DocumentAPI.isValidDocumentType('InvalidType'),
          getAllTypesIsArray: Array.isArray(DocumentAPI.getAllDocumentTypes()),
          invalidSchemaIsNull: DocumentAPI.getDocumentSchema('InvalidType') === null
        };
      },
      {
        invalidTypeResult: false,
        getAllTypesIsArray: true, 
        invalidSchemaIsNull: true
      }
    );
  });
});

// Embedded operations specific tests
describe('DocumentAPI embedded operations', () => {
  beforeEach(() => {
    setupMockFoundryEnvironment('D&D 5e');
  });

  afterEach(() => {
    cleanupMockEnvironment();
  });

  test('applyEmbeddedOperations delegates to Foundry embedded APIs', async () => {
    const doc = {
      id: 'journal-1',
      _id: 'journal-1',
      sheet: null,
      pages: {
        contents: [
          { id: 'page-1', sort: 0 },
          { id: 'page-2', sort: 1 }
        ],
        documentClass: { documentName: 'JournalEntryPage' }
      },
      testUserPermission: jest.fn().mockReturnValue(true),
      canUserModify: jest.fn().mockReturnValue(true),
      deleteEmbeddedDocuments: jest.fn().mockResolvedValue([]),
      createEmbeddedDocuments: jest.fn().mockResolvedValue([]),
      updateEmbeddedDocuments: jest.fn().mockResolvedValue([])
    };

    const collection = {
      get: jest.fn(() => doc),
      contents: [doc]
    };

    game.collections.get = jest.fn(() => collection);

    await DocumentAPI.applyEmbeddedOperations('JournalEntry', 'journal-1', [
      { action: 'delete', embeddedName: 'JournalEntryPage', targetId: 'page-2' },
      { action: 'insert', embeddedName: 'JournalEntryPage', data: { _id: 'page-3', name: 'New Page' } },
      { action: 'replace', embeddedName: 'JournalEntryPage', data: { _id: 'page-3', name: 'Updated Page' } }
    ]);

    expect(doc.deleteEmbeddedDocuments).toHaveBeenCalledWith('JournalEntryPage', ['page-2'], { render: false });
    expect(doc.createEmbeddedDocuments).toHaveBeenCalledWith('JournalEntryPage', [expect.objectContaining({ _id: 'page-3', name: 'New Page' })], { render: false });
    expect(doc.updateEmbeddedDocuments).toHaveBeenCalledWith('JournalEntryPage', [expect.objectContaining({ _id: 'page-3', name: 'Updated Page' })], { render: false });
  });
});
