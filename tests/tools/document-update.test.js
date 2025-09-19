/**
 * Tests for DocumentUpdateTool
 * Enhanced with error scenario coverage, performance testing, and multi-system validation
 */

import { DocumentUpdateTool } from '../../scripts/tools/document-update.js';
import { DocumentAPI } from '../../scripts/core/document-api.js';
import {
  setupMockFoundryEnvironment,
  cleanupMockEnvironment,
  createParameterizedSystemTests,
  PerformanceHelpers
} from '../helpers/mock-setup.js';

// Mock DocumentAPI
jest.mock('../../scripts/core/document-api.js');

// System-independent constructor tests
describe('DocumentUpdateTool - constructor', () => {
  let tool;
  const mockDocument = {
    id: 'test-id-123',
    name: 'Test Document'
  };

  beforeEach(() => {
    setupMockFoundryEnvironment('D&D 5e');
    tool = new DocumentUpdateTool();
    jest.clearAllMocks();
    DocumentAPI.getDocument = jest.fn();
    DocumentAPI.getDocumentInstance = jest.fn();
    DocumentAPI.applyEmbeddedOperations = jest.fn();
    DocumentAPI.updateDocument = jest.fn();
  });

  afterEach(() => {
    cleanupMockEnvironment();
  });

  it('should initialize with correct properties', () => {
      expect(tool.name).toBe('update_document');
      expect(tool.description).toBe('Update documents of any type supported by current system.');
      expect(tool.requiresConfirmation).toBe(true);
  });

  it('should have correct schema structure', () => {
      expect(tool.schema.type).toBe('object');
      expect(tool.schema.properties).toHaveProperty('documentType');
      expect(tool.schema.properties).toHaveProperty('documentId');
      expect(tool.schema.properties).toHaveProperty('updates');
      expect(tool.schema.properties).toHaveProperty('operations');
      expect(tool.schema.required).toEqual(['documentType', 'documentId']);
  });

  it('should define required parameters correctly', () => {
      const { documentType, documentId, updates, operations } = tool.schema.properties;
      
      expect(documentType.type).toBe('string');
      expect(documentType.required).toBe(true);
      expect(documentType.description).toContain('Type of document to update');
      
      expect(documentId.type).toBe('string');
      expect(documentId.required).toBe(true);
      expect(documentId.description).toContain('ID of document to update');
      
      expect(updates.type).toBe('object');
      expect(updates.required).toBe(false);
      expect(updates.description).toContain('Document updates');
      
      expect(operations.type).toBe('array');
      expect(operations.required).toBe(false);
      expect(operations.description).toContain('Structured array mutations');
  });
});

describe('DocumentUpdateTool - Utility Methods', () => {
  let tool;

  beforeEach(() => {
    setupMockFoundryEnvironment('D&D 5e');
    tool = new DocumentUpdateTool();
  });

  afterEach(() => {
    cleanupMockEnvironment();
  });

  describe('getConfirmationDetails', () => {
    it('should return correct confirmation details', async () => {
        const params = {
          documentType: 'Actor',
          documentId: 'actor-123',
          updates: { name: 'New Name', 'system.health': 100 }
        };

        const details = await tool.getConfirmationDetails(params);
        const expectedPayload = { updates: params.updates, operations: [] };

        expect(details).toEqual({
          type: 'update',
          title: 'Update Actor Document',
          details: `Updating Actor:actor-123 with payload: ${JSON.stringify(expectedPayload, null, 2)}`
      });
    });

    it('should handle complex update objects', async () => {
        const params = {
          documentType: 'Item',
          documentId: 'item-456',
          updates: {
            name: 'Magic Sword',
            'system.damage': '1d8+3',
            'system.properties': ['magical', 'versatile']
          }
        };

        const details = await tool.getConfirmationDetails(params);

        expect(details.type).toBe('update');
        expect(details.title).toBe('Update Item Document');
        expect(details.details).toContain('payload');
        expect(details.details).toContain('Magic Sword');
        expect(details.details).toContain('operations');
    });
  });
});

// Enhanced error scenario and performance testing
describe.each(createParameterizedSystemTests())(
  'DocumentUpdateTool - Enhanced Testing with %s system',
  (systemName, systemConfig) => {
    let tool;
    const mockDocument = {
      id: 'test-id-123',
      name: 'Test Document'
    };

    beforeEach(() => {
      setupMockFoundryEnvironment(systemName);
      tool = new DocumentUpdateTool();
      jest.clearAllMocks();
      DocumentAPI.getDocument = jest.fn();
      DocumentAPI.getDocumentInstance = jest.fn();
      DocumentAPI.applyEmbeddedOperations = jest.fn();
      DocumentAPI.updateDocument = jest.fn();
    });

    afterEach(() => {
      cleanupMockEnvironment();
    });

    describe('execute', () => {
      it('should successfully update documents for valid types', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        if (documentTypes.length === 0) return;
        
        const testDocType = documentTypes[0];
        const params = {
          documentType: testDocType,
          documentId: 'test-123',
          updates: { name: 'Updated Name' }
        };

        const latestDoc = { _id: 'test-123', name: 'Updated Name' };
        DocumentAPI.getDocument.mockResolvedValueOnce(latestDoc).mockResolvedValueOnce(latestDoc);

        const result = await tool.execute(params);

        expect(DocumentAPI.updateDocument).toHaveBeenCalledWith(testDocType, 'test-123', { name: 'Updated Name' });
        expect(DocumentAPI.applyEmbeddedOperations).not.toHaveBeenCalled();
        const payload = JSON.parse(result.content);
        expect(payload.message).toBe(`Updated ${testDocType}:test-123`);
        expect(payload.document).toEqual(latestDoc);
        expect(result.document).toEqual(latestDoc);
        expect(result.display).toBe(`✅ Updated **Updated Name** (${testDocType})`);
        expect(result.error).toBeUndefined();
      });

      it('should handle document without name', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        if (documentTypes.length === 0) return;
        
        const testDocType = documentTypes[0];
        const params = {
          documentType: testDocType,
          documentId: 'test-456',
          updates: { width: 4000, height: 3000 }
        };

        const finalDoc = { _id: 'test-456', width: 4000, height: 3000 };
        DocumentAPI.getDocument.mockResolvedValueOnce(finalDoc).mockResolvedValueOnce(finalDoc);

        const result = await tool.execute(params);

        expect(DocumentAPI.updateDocument).toHaveBeenCalledWith(testDocType, 'test-456', { width: 4000, height: 3000 });
        const payload = JSON.parse(result.content);
        expect(payload.message).toBe(`Updated ${testDocType}:test-456`);
        expect(payload.document).toEqual(finalDoc);
        expect(result.document).toEqual(finalDoc);
        expect(result.display).toBe(`✅ Updated **test-456** (${testDocType})`);
      });

      it('should reject delete operations missing index', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});

        if (documentTypes.length === 0) return;

        const validType = documentTypes[0];
        const result = await tool.execute({
          documentType: validType,
          documentId: 'op-missing-index',
          updates: {},
          operations: [
            { action: 'delete', path: 'system.bonds' }
          ]
        });

        expect(DocumentAPI.updateDocument).not.toHaveBeenCalled();
        expect(result.error).toBeDefined();
        expect(result.error.message).toContain('index');
      });

      it('should compute array payload for delete operations', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});

        if (documentTypes.length === 0) return;

        const validType = documentTypes[0];
        const startingDoc = {
          _id: 'op-delete',
          system: {
            bonds: ['Bond A', 'Bond B', 'Bond C'],
            description: 'Old description'
          }
        };
        const finalDoc = {
          _id: 'op-delete',
          system: {
            bonds: ['Bond A', 'Bond C'],
            description: 'Updated'
          },
          name: 'Updated Doc'
        };

        DocumentAPI.getDocument.mockResolvedValueOnce(startingDoc).mockResolvedValueOnce(finalDoc);
        DocumentAPI.getDocumentInstance.mockResolvedValueOnce({});

        const result = await tool.execute({
          documentType: validType,
          documentId: 'op-delete',
          updates: { 'system.description': 'Updated' },
          operations: [
            { action: 'delete', path: 'system.bonds', index: 1 }
          ]
        });

        expect(DocumentAPI.getDocument).toHaveBeenNthCalledWith(1, validType, 'op-delete', { includeEmbedded: true });
        expect(DocumentAPI.getDocument).toHaveBeenNthCalledWith(2, validType, 'op-delete', { includeEmbedded: true });
        expect(DocumentAPI.applyEmbeddedOperations).not.toHaveBeenCalled();
        expect(DocumentAPI.updateDocument).toHaveBeenCalledWith(validType, 'op-delete', {
          'system.bonds': ['Bond A', 'Bond C'],
          'system.description': 'Updated'
        });
        const payload = JSON.parse(result.content);
        expect(payload.message).toBe(`Updated ${validType}:op-delete`);
        expect(payload.document).toEqual(finalDoc);
        expect(result.document).toEqual(finalDoc);
        expect(result.error).toBeUndefined();
      });

      it('should apply embedded delete operations', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});

        if (documentTypes.length === 0) return;

        const validType = documentTypes[0];
        const startingDoc = {
          _id: 'journal-1',
          name: 'World of Venoure',
          pages: [
            { _id: 'page-1', name: 'Intro' },
            { _id: 'page-2', name: 'Continents Duplicate' }
          ]
        };
        const finalDoc = {
          _id: 'journal-1',
          name: 'World of Venoure',
          pages: [
            { _id: 'page-1', name: 'Intro' }
          ]
        };

        const embeddedCollection = {
          contents: [
            { id: 'page-1', sort: 0 },
            { id: 'page-2', sort: 1 }
          ],
          documentClass: { documentName: 'JournalEntryPage' }
        };

        DocumentAPI.getDocument
          .mockResolvedValueOnce(startingDoc)
          .mockResolvedValueOnce(finalDoc);
        DocumentAPI.getDocumentInstance.mockResolvedValue({ pages: embeddedCollection });
        DocumentAPI.applyEmbeddedOperations.mockResolvedValue();

        const result = await tool.execute({
          documentType: validType,
          documentId: 'journal-1',
          operations: [
            { action: 'delete', path: 'pages', id: 'page-2' }
          ]
        });

        expect(DocumentAPI.applyEmbeddedOperations).toHaveBeenCalledWith(validType, 'journal-1', [
          expect.objectContaining({
            action: 'delete',
            embeddedName: 'JournalEntryPage',
            targetId: 'page-2'
          })
        ]);
        expect(DocumentAPI.updateDocument).not.toHaveBeenCalled();
        const payload = JSON.parse(result.content);
        expect(payload.message).toBe(`Updated ${validType}:journal-1`);
        expect(payload.document).toEqual(finalDoc);
        expect(result.document).toEqual(finalDoc);
      });

      it('should convert embedded updates into replace operations', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});

        if (documentTypes.length === 0) return;

        const validType = documentTypes[0];
        const startingDoc = {
          _id: 'journal-2',
          name: 'World of Venoure',
          pages: [
            { _id: 'page-1', name: 'Intro', text: { content: '<p>Old</p>' } }
          ]
        };
        const finalDoc = {
          _id: 'journal-2',
          name: 'World of Venoure',
          pages: [
            { _id: 'page-1', name: 'Intro', text: { content: '<p>Updated</p>' } }
          ]
        };

        const embeddedCollection = {
          contents: [
            { id: 'page-1', sort: 0 }
          ],
          documentClass: { documentName: 'JournalEntryPage' }
        };

        DocumentAPI.getDocument
          .mockResolvedValueOnce(startingDoc)
          .mockResolvedValueOnce(finalDoc);
        DocumentAPI.getDocumentInstance.mockResolvedValue({ pages: embeddedCollection });
        DocumentAPI.applyEmbeddedOperations.mockResolvedValue();

        const result = await tool.execute({
          documentType: validType,
          documentId: 'journal-2',
          updates: { 'pages.0.text.content': '<p>Updated</p>' }
        });

        expect(DocumentAPI.applyEmbeddedOperations).toHaveBeenCalledWith(validType, 'journal-2', [
          expect.objectContaining({
            action: 'replace',
            embeddedName: 'JournalEntryPage',
            data: expect.objectContaining({
              _id: 'page-1',
              text: expect.objectContaining({ content: '<p>Updated</p>' })
            })
          })
        ]);
        expect(DocumentAPI.updateDocument).not.toHaveBeenCalled();
        const payload = JSON.parse(result.content);
        expect(payload.message).toBe(`Updated ${validType}:journal-2`);
        expect(payload.document).toEqual(finalDoc);
        expect(result.document).toEqual(finalDoc);
      });
    });

    describe('Error Scenario Coverage', () => {
      it('should handle invalid document type errors', async () => {
        const result = await tool.execute({
          documentType: 'InvalidDocumentType',
          documentId: 'doc-123',
          updates: { name: 'Test' }
        });

        expect(result.error).toBeDefined();
        expect(result.error.message).toContain('not available in current system');
      });

      it('should handle malformed update data', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        if (documentTypes.length === 0) return; 
        
        const validType = documentTypes[0];
        
        // Test with various malformed update data
        const malformedUpdates = [
          null,
          undefined,
          'not an object',
          123,
          []
        ];

        for (const badUpdates of malformedUpdates) {
          const result = await tool.execute({
            documentType: validType,
            documentId: 'test-id',
            updates: badUpdates
          });

          expect(result.error).toBeDefined();
        }
      });

      it('should handle DocumentAPI failures gracefully', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        // Mock various API failure scenarios
        const apiErrors = [
          new Error('Network timeout'),
          new Error('Permission denied'),
          new Error('Validation failed'),
          new Error('Document locked'),
          new Error('Invalid field: test')
        ];

        for (const error of apiErrors) {
          DocumentAPI.updateDocument.mockRejectedValueOnce(error);
          
          const result = await tool.execute({
            documentType: validType,
            documentId: 'test-doc',
            updates: { name: 'Test Update' }
          });

          expect(result.error).toBeDefined();
          expect(result.error.message).toBe(error.message);
        }
      });

      it('should handle malformed document IDs', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        const malformedIds = [
          null,
          undefined,
          '',
          ' ',
          '   '
        ];

        for (const badId of malformedIds) {
          const result = await tool.execute({
            documentType: validType,
            documentId: badId,
            updates: { name: 'Test' }
          });

          expect(result.error).toBeDefined();
        }
      });
    });

    describe('Performance Testing', () => {
      it('should complete document updates within performance threshold', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        DocumentAPI.updateDocument.mockResolvedValueOnce({ id: 'perf-test', name: 'Perf Test' });
        
        const updateDocument = () => tool.execute({
          documentType: validType,
          documentId: 'perf-test',
          updates: { name: 'Performance Test Document' }
        });

        // Should complete within 400ms
        const result = PerformanceHelpers.assertPerformance(updateDocument, 400);
        
        await expect(result).resolves.toBeDefined();
      });

      it('should handle batch updates efficiently', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        DocumentAPI.updateDocument.mockImplementation(() => 
          Promise.resolve({ id: `batch-${Date.now()}-${Math.random()}`, name: 'Batch Updated' })
        );
        
        const promises = Array.from({ length: 5 }, (_, i) =>
          tool.execute({
            documentType: validType,
            documentId: `batch-doc-${i}`,
            updates: { name: `Batch Document ${i}` }
          })
        );
        
        const { duration } = PerformanceHelpers.measureTime(() => Promise.all(promises));
        
        // Batch updates should complete within reasonable time
        expect(duration).toBeLessThan(1000); // 1 second for 5 updates
      });
    });

    describe('Edge Case Testing', () => {
      it('should handle systems with no document types', () => {
        if (Object.keys(game.documentTypes || {}).length === 0) {
          expect(() => new DocumentUpdateTool()).not.toThrow();
          
          // Should reject any update attempt in empty system
          return tool.execute({
            documentType: 'AnyType',
            documentId: 'test',
            updates: { name: 'Test' }
          }).then(result => {
            expect(result.error).toBeDefined();
          });
        }
      });

      it('should handle complex nested updates', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        const complexUpdates = {
          name: 'Complex Update Test',
          'system.attributes.hp.value': 50,
          'system.attributes.hp.max': 100,
          'system.details.biography': 'A complex character with nested properties',
          'system.skills.acrobatics.value': 5,
          flags: {
            'simulacrum.testFlag': true,
            'other-module.setting': 'value'
          }
        };

        const latestDoc = { _id: 'complex-test', name: 'Complex Update Test', system: { attributes: { hp: { value: 50, max: 100 } } } };
        DocumentAPI.getDocument.mockResolvedValueOnce(latestDoc).mockResolvedValueOnce(latestDoc);

        const result = await tool.execute({
          documentType: validType,
          documentId: 'complex-test',
          updates: complexUpdates
        });

        expect(DocumentAPI.updateDocument).toHaveBeenCalledWith(
          validType, 
          'complex-test', 
          complexUpdates
        );
        const payload = JSON.parse(result.content);
        expect(payload.message).toBe(`Updated ${validType}:complex-test`);
        expect(payload.document).toEqual(latestDoc);
        expect(result.document).toEqual(latestDoc);
        expect(result.error).toBeUndefined();
      });

      it('should handle special characters in updates', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        const specialCharUpdates = {
          name: 'Test 🧙‍♂️ Character with émojis and accénts',
          description: '<script>alert("xss")</script>',
          unicode: '∑øł∂ƒ®öñ†∫∆'
        };

        const latestDoc = { _id: 'special-chars', ...specialCharUpdates };
        DocumentAPI.getDocument.mockResolvedValueOnce(latestDoc).mockResolvedValueOnce(latestDoc);

        const result = await tool.execute({
          documentType: validType,
          documentId: 'special-chars',
          updates: specialCharUpdates
        });

        expect(DocumentAPI.updateDocument).toHaveBeenCalledWith(
          validType, 
          'special-chars', 
          specialCharUpdates
        );
        const payload = JSON.parse(result.content);
        expect(payload.message).toBe(`Updated ${validType}:special-chars`);
        expect(payload.document).toEqual(latestDoc);
        expect(result.document).toEqual(latestDoc);
        expect(result.error).toBeUndefined();
      });
    });
  }
);

// System-agnostic legacy compatibility tests
describe('DocumentUpdateTool - Legacy Compatibility', () => {
  let tool;
  const mockDocument = {
    id: 'test-id-123',
    name: 'Test Document'
  };

  beforeEach(() => {
    setupMockFoundryEnvironment('D&D 5e');
    tool = new DocumentUpdateTool();
    jest.clearAllMocks();
    DocumentAPI.getDocument = jest.fn();
    DocumentAPI.getDocumentInstance = jest.fn();
    DocumentAPI.applyEmbeddedOperations = jest.fn();
    DocumentAPI.updateDocument = jest.fn();
  });

  afterEach(() => {
    cleanupMockEnvironment();
  });

  describe('execute - legacy compatibility', () => {

    it('should successfully update a document', async () => {
        const params = {
          documentType: 'Actor',
          documentId: 'actor-123',
          updates: { name: 'Updated Name' }
        };

        const latestDoc = { _id: 'actor-123', name: 'Updated Name' };
        DocumentAPI.getDocument.mockResolvedValueOnce(latestDoc).mockResolvedValueOnce(latestDoc);

        const result = await tool.execute(params);

        expect(DocumentAPI.updateDocument).toHaveBeenCalledWith('Actor', 'actor-123', { name: 'Updated Name' });
        const payload = JSON.parse(result.content);
        expect(payload.message).toBe('Updated Actor:actor-123');
        expect(payload.document).toEqual(latestDoc);
        expect(result.document).toEqual(latestDoc);
        expect(result.display).toBe('✅ Updated **Updated Name** (Actor)');
        expect(result.error).toBeUndefined();
    });

    it('should handle document without name', async () => {
        const params = {
          documentType: 'Scene',
          documentId: 'scene-456',
          updates: { width: 4000, height: 3000 }
        };

        const documentWithoutName = { _id: 'scene-456', width: 4000, height: 3000 };
        DocumentAPI.getDocument.mockResolvedValueOnce(documentWithoutName).mockResolvedValueOnce(documentWithoutName);

        const result = await tool.execute(params);

        expect(DocumentAPI.updateDocument).toHaveBeenCalledWith('Scene', 'scene-456', { width: 4000, height: 3000 });
        const payload = JSON.parse(result.content);
        expect(payload.message).toBe('Updated Scene:scene-456');
        expect(payload.document).toEqual(documentWithoutName);
        expect(result.document).toEqual(documentWithoutName);
        expect(result.display).toBe('✅ Updated **scene-456** (Scene)');
    });
  });

  describe('execute error handling', () => {

    it('should return error for invalid document type', async () => {
        const params = {
          documentType: 'InvalidType',
          documentId: 'doc-123',
          updates: { name: 'Test' }
        };

        const result = await tool.execute(params);

        expect(DocumentAPI.updateDocument).not.toHaveBeenCalled();
        expect(result.content).toContain('Document type "InvalidType" not available in current system');
        expect(result.display).toContain('❌ Unknown document type:');
        expect(result.error).toEqual({
          message: 'Document type "InvalidType" not available in current system',
          type: 'UNKNOWN_DOCUMENT_TYPE'
      });
    });

    it('should handle DocumentAPI errors', async () => {
        const params = {
          documentType: 'Actor',
          documentId: 'actor-123',
          updates: { name: 'Updated Name' }
        };

        const apiError = new Error('Document not found');
        DocumentAPI.updateDocument.mockRejectedValue(apiError);

        const result = await tool.execute(params);

        expect(result.content).toBe('Failed to update Actor:actor-123: Document not found');
        expect(result.display).toBe('❌ Failed to update Actor:actor-123: Document not found');
        expect(result.error).toEqual({
          message: 'Document not found',
          type: 'UPDATE_FAILED'
      });
    });
  });

  describe('execute validation errors', () => {

    it('should handle validation errors from FoundryVTT', async () => {
        const params = {
          documentType: 'Item',
          documentId: 'item-456',
          updates: { invalidField: 'invalid value' }
        };

        const validationError = new Error('Invalid field: invalidField');
        DocumentAPI.updateDocument.mockRejectedValue(validationError);

        const result = await tool.execute(params);

        expect(result.content).toContain('Failed to update Item:item-456');
        expect(result.display).toContain('❌ Failed to update Item:item-456');
        expect(result.error.type).toBe('UPDATE_FAILED');
    });
  });

  describe('execute system data updates', () => {

    it('should handle system data updates', async () => {
        const params = {
          documentType: 'Actor',
          documentId: 'actor-789',
          updates: {
            name: 'Hero',
            'system.attributes.hp.value': 50,
            'system.details.biography': 'A brave adventurer'
          }
        };

        const latestDoc = {
          _id: 'actor-789',
          name: 'Hero',
          system: { attributes: { hp: { value: 50 } }, details: { biography: 'A brave adventurer' } }
        };
        DocumentAPI.getDocument.mockResolvedValueOnce(latestDoc).mockResolvedValueOnce(latestDoc);

        const result = await tool.execute(params);

        expect(DocumentAPI.updateDocument).toHaveBeenCalledWith(
          'Actor', 
          'actor-789', 
          expect.objectContaining({
            name: 'Hero',
            'system.attributes.hp.value': 50,
            'system.details.biography': 'A brave adventurer'
          })
        );
        const payload = JSON.parse(result.content);
        expect(payload.message).toBe('Updated Actor:actor-789');
        expect(payload.document).toEqual(latestDoc);
        expect(result.document).toEqual(latestDoc);
        expect(result.display).toBe('✅ Updated **Hero** (Actor)');
    });

    it('should handle partial updates', async () => {
        const params = {
          documentType: 'Item',
          documentId: 'item-999',
          updates: { 'system.quantity': 5 }
        };

        const latestDoc = { _id: 'item-999', name: 'Existing Item', system: { quantity: 5 } };
        DocumentAPI.getDocument.mockResolvedValueOnce(latestDoc).mockResolvedValueOnce(latestDoc);

        const result = await tool.execute(params);

        expect(DocumentAPI.updateDocument).toHaveBeenCalledWith('Item', 'item-999', { 'system.quantity': 5 });
        const payload = JSON.parse(result.content);
        expect(payload.message).toBe('Updated Item:item-999');
        expect(payload.document).toEqual(latestDoc);
        expect(result.document).toEqual(latestDoc);
    });
  });

  describe('execute parameter validation', () => {

    it('should validate parameters correctly', async () => {
        // Test missing documentType
        const invalidParams1 = {
          documentId: 'doc-123',
          updates: { name: 'Test' }
        };

        // Since validateParams should be called by parent, let's test validation indirectly
        const result1 = await tool.execute(invalidParams1);
        expect(result1.error).toBeDefined();

        // Test missing documentId  
        const invalidParams2 = {
          documentType: 'Actor',
          updates: { name: 'Test' }
        };

        const result2 = await tool.execute(invalidParams2);
        expect(result2.error).toBeDefined();
    });
  });

  describe('inheritance from BaseTool', () => {
    it('should inherit isValidDocumentType method', () => {
      expect(typeof tool.isValidDocumentType).toBe('function');
      expect(tool.isValidDocumentType('Actor')).toBe(true);
      expect(tool.isValidDocumentType('InvalidType')).toBe(false);
    });

    it('should have requiresConfirmation set to true', () => {
      expect(tool.requiresConfirmation).toBe(true);
    });
  });
});

// System-agnostic validation tests
describe('DocumentUpdateTool - System-Agnostic Validation', () => {
  afterEach(() => {
    cleanupMockEnvironment();
  });
  
  it('should maintain consistent behavior across all systems', async () => {
    // Test that error handling works the same way regardless of system
    for (const system of ['D&D 5e', 'Pathfinder 2e', 'Minimal Core']) {
      setupMockFoundryEnvironment(system);
      const tool = new DocumentUpdateTool();
      
      const result = await tool.execute({
        documentType: 'InvalidType',
        documentId: 'test',
        updates: { name: 'Test' }
      });
      
      expect(result.error).toBeDefined();
      
      cleanupMockEnvironment();
    }
  });
});