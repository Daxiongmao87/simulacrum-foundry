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
    DocumentAPI.updateDocument = jest.fn();
  });

  afterEach(() => {
    cleanupMockEnvironment();
  });

  it('should initialize with correct properties', () => {
      expect(tool.name).toBe('update_document');
      expect(tool.description).toBe('Update documents of any type supported by current system');
      expect(tool.requiresConfirmation).toBe(true);
  });

  it('should have correct schema structure', () => {
      expect(tool.schema.type).toBe('object');
      expect(tool.schema.properties).toHaveProperty('documentType');
      expect(tool.schema.properties).toHaveProperty('documentId');
      expect(tool.schema.properties).toHaveProperty('updates');
      expect(tool.schema.required).toEqual(['documentType', 'documentId', 'updates']);
  });

  it('should define required parameters correctly', () => {
      const { documentType, documentId, updates } = tool.schema.properties;
      
      expect(documentType.type).toBe('string');
      expect(documentType.required).toBe(true);
      expect(documentType.description).toContain('Type of document to update');
      
      expect(documentId.type).toBe('string');
      expect(documentId.required).toBe(true);
      expect(documentId.description).toContain('ID of document to update');
      
      expect(updates.type).toBe('object');
      expect(updates.required).toBe(true);
      expect(updates.description).toContain('Document updates');
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

        expect(details).toEqual({
          type: 'update',
          title: 'Update Actor Document',
          details: `Updating Actor:actor-123 with updates: ${JSON.stringify(params.updates, null, 2)}`
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
        expect(details.details).toContain('item-456');
        expect(details.details).toContain('Magic Sword');
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
      DocumentAPI.updateDocument = jest.fn();
    });

    afterEach(() => {
      cleanupMockEnvironment();
    });

    describe('execute', () => {
      it('should successfully update documents for valid types', async () => {
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
        if (documentTypes.length === 0) return;
        
        const testDocType = documentTypes[0];
        const params = {
          documentType: testDocType,
          documentId: 'test-123',
          updates: { name: 'Updated Name' }
        };

        DocumentAPI.updateDocument.mockResolvedValue(mockDocument);

        const result = await tool.execute(params);

        expect(DocumentAPI.updateDocument).toHaveBeenCalledWith(testDocType, 'test-123', { name: 'Updated Name' });
        expect(result.content).toBe(`Updated ${testDocType}:test-123`);
        expect(result.display).toBe('✅ Updated **Test Document** (' + testDocType + ')');
        expect(result.error).toBeUndefined();
      });

      it('should handle document without name', async () => {
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
        if (documentTypes.length === 0) return;
        
        const testDocType = documentTypes[0];
        const params = {
          documentType: testDocType,
          documentId: 'test-456',
          updates: { width: 4000, height: 3000 }
        };

        const documentWithoutName = { id: 'test-456' };
        DocumentAPI.updateDocument.mockResolvedValue(documentWithoutName);

        const result = await tool.execute(params);

        expect(result.content).toBe(`Updated ${testDocType}:test-456`);
        expect(result.display).toBe(`✅ Updated **test-456** (${testDocType})`);
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
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
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
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
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
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
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
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
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
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
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
        if (Object.keys(systemConfig.Document.documentTypes).length === 0) {
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
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
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

        DocumentAPI.updateDocument.mockResolvedValueOnce({ id: 'complex-test', name: 'Complex Update Test' });
        
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
        expect(result.error).toBeUndefined();
      });

      it('should handle special characters in updates', async () => {
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        const specialCharUpdates = {
          name: 'Test 🧙‍♂️ Character with émojis and accénts',
          description: '<script>alert("xss")</script>',
          unicode: '∑øł∂ƒ®öñ†∫∆'
        };

        DocumentAPI.updateDocument.mockResolvedValueOnce({ id: 'special-chars', name: specialCharUpdates.name });
        
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

        DocumentAPI.updateDocument.mockResolvedValue(mockDocument);

        const result = await tool.execute(params);

        expect(DocumentAPI.updateDocument).toHaveBeenCalledWith('Actor', 'actor-123', { name: 'Updated Name' });
        expect(result.content).toBe('Updated Actor:actor-123');
        expect(result.display).toBe('✅ Updated **Test Document** (Actor)');
        expect(result.error).toBeUndefined();
    });

    it('should handle document without name', async () => {
        const params = {
          documentType: 'Scene',
          documentId: 'scene-456',
          updates: { width: 4000, height: 3000 }
        };

        const documentWithoutName = { id: 'scene-456' };
        DocumentAPI.updateDocument.mockResolvedValue(documentWithoutName);

        const result = await tool.execute(params);

        expect(result.content).toBe('Updated Scene:scene-456');
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
        expect(result.display).toContain('❌ Update failed:');
        expect(result.error).toEqual({
          message: 'Document type "InvalidType" not available in current system',
          type: 'UPDATE_FAILED'
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
        expect(result.display).toBe('❌ Update failed: Document not found');
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
        expect(result.display).toContain('❌ Update failed:');
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

        DocumentAPI.updateDocument.mockResolvedValue({
          ...mockDocument,
          id: 'actor-789',
          name: 'Hero'
      });

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
        expect(result.content).toBe('Updated Actor:actor-789');
        expect(result.display).toBe('✅ Updated **Hero** (Actor)');
    });

    it('should handle partial updates', async () => {
        const params = {
          documentType: 'Item',
          documentId: 'item-999',
          updates: { 'system.quantity': 5 }
        };

        DocumentAPI.updateDocument.mockResolvedValue({
          id: 'item-999',
          name: 'Existing Item'
      });

        const result = await tool.execute(params);

        expect(DocumentAPI.updateDocument).toHaveBeenCalledWith('Item', 'item-999', { 'system.quantity': 5 });
        expect(result.content).toBe('Updated Item:item-999');
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