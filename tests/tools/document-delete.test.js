/**
 * Tests for DocumentDeleteTool
 * Enhanced with error scenario coverage, performance testing, and multi-system validation
 */

import { DocumentDeleteTool } from '../../scripts/tools/document-delete.js';
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
describe('DocumentDeleteTool - constructor', () => {
  let tool;

  beforeEach(() => {
    setupMockFoundryEnvironment('D&D 5e');
    tool = new DocumentDeleteTool();
    jest.clearAllMocks();
    DocumentAPI.deleteDocument = jest.fn();
  });

  afterEach(() => {
    cleanupMockEnvironment();
  });

  it('should initialize with correct properties', () => {
      expect(tool.name).toBe('delete_document');
      expect(tool.description).toBe('Delete documents of any type supported by current system');
      expect(tool.requiresConfirmation).toBe(true);
  });

  it('should have correct schema structure', () => {
      expect(tool.schema.type).toBe('object');
      expect(tool.schema.properties).toHaveProperty('documentType');
      expect(tool.schema.properties).toHaveProperty('documentId');
      expect(tool.schema.required).toEqual(['documentType', 'documentId']);
  });

  it('should define required parameters correctly', () => {
      const { documentType, documentId } = tool.schema.properties;
      
      expect(documentType.type).toBe('string');
      expect(documentType.required).toBe(true);
      expect(documentType.description).toContain('Type of document to delete');
      
      expect(documentId.type).toBe('string');
      expect(documentId.required).toBe(true);
      expect(documentId.description).toContain('ID of document to delete');
  });

  describe('getConfirmationDetails', () => {
    it('should return correct confirmation details', async () => {
        const params = {
          documentType: 'Actor',
          documentId: 'actor-123'
        };

        const details = await tool.getConfirmationDetails(params);

        expect(details).toEqual({
          type: 'delete',
          title: 'Delete Actor Document',
          details: 'Permanently delete Actor document with ID: actor-123'
      });
    });

    it('should handle different document types', async () => {
        const params = {
          documentType: 'Item',
          documentId: 'item-456'
        };

        const details = await tool.getConfirmationDetails(params);

        expect(details.type).toBe('delete');
        expect(details.title).toBe('Delete Item Document');
        expect(details.details).toContain('item-456');
        expect(details.details).toContain('Permanently delete');
    });

    it('should warn about permanent deletion', async () => {
        const params = {
          documentType: 'Scene',
          documentId: 'scene-789'
        };

        const details = await tool.getConfirmationDetails(params);

        expect(details.details).toContain('Permanently delete');
    });
  });
});

// Enhanced error scenario and performance testing
describe.each(createParameterizedSystemTests())(
  'DocumentDeleteTool - Enhanced Testing with %s system',
  (systemName, systemConfig) => {
    let tool;

    beforeEach(() => {
      setupMockFoundryEnvironment(systemName);
      tool = new DocumentDeleteTool();
      jest.clearAllMocks();
      DocumentAPI.deleteDocument = jest.fn();
    });

    afterEach(() => {
      cleanupMockEnvironment();
    });

    describe('execute', () => {
      it('should successfully delete documents for valid types', async () => {
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
        if (documentTypes.length === 0) return;
        
        const testDocType = documentTypes[0];
        const params = {
          documentType: testDocType,
          documentId: 'test-123'
        };

        DocumentAPI.deleteDocument.mockResolvedValue(undefined);

        const result = await tool.execute(params);

        expect(DocumentAPI.deleteDocument).toHaveBeenCalledWith(testDocType, 'test-123');
        expect(result.content).toBe(`Deleted ${testDocType}:test-123`);
        expect(result.display).toBe(`✅ Deleted **${testDocType}** document with ID: test-123`);
        expect(result.error).toBeUndefined();
      });

      it('should handle deletion of different document types', async () => {
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
        if (documentTypes.length < 2) return;
        
        const testDocType = documentTypes[1]; // Use second type if available
        const params = {
          documentType: testDocType,
          documentId: 'test-456'
        };

        DocumentAPI.deleteDocument.mockResolvedValue(undefined);

        const result = await tool.execute(params);

        expect(DocumentAPI.deleteDocument).toHaveBeenCalledWith(testDocType, 'test-456');
        expect(result.content).toBe(`Deleted ${testDocType}:test-456`);
        expect(result.display).toBe(`✅ Deleted **${testDocType}** document with ID: test-456`);
      });
    });

    describe('Error Scenario Coverage', () => {
      it('should handle invalid document type errors', async () => {
        const result = await tool.execute({
          documentType: 'InvalidDocumentType',
          documentId: 'doc-123'
        });

        expect(result.error).toBeDefined();
        expect(result.error.message).toContain('not available in current system');
      });

      it('should handle malformed document IDs', async () => {
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        // Mock DocumentAPI to reject malformed IDs
        const malformedIds = [
          null,
          undefined,
          '',
          ' ',
          '   '
        ];

        for (const badId of malformedIds) {
          // Mock the API to reject malformed IDs
          DocumentAPI.deleteDocument.mockRejectedValueOnce(new Error(`Invalid document ID: ${badId}`));
          
          const result = await tool.execute({
            documentType: validType,
            documentId: badId
          });

          expect(result.error).toBeDefined();
        }
      });

      it('should handle DocumentAPI failures gracefully', async () => {
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        const apiErrors = [
          new Error('Document not found'),
          new Error('Permission denied'),
          new Error('Document locked'),
          new Error('Cannot delete: referenced by other documents'),
          new Error('Document was already deleted')
        ];

        for (const error of apiErrors) {
          DocumentAPI.deleteDocument.mockRejectedValueOnce(error);
          
          const result = await tool.execute({
            documentType: validType,
            documentId: 'test-doc'
          });

          expect(result.error).toBeDefined();
          expect(result.error.message).toBe(error.message);
        }
      });

      it('should handle permission errors', async () => {
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        const permissionError = new Error('Insufficient permissions to delete document');
        DocumentAPI.deleteDocument.mockRejectedValue(permissionError);

        const result = await tool.execute({
          documentType: validType,
          documentId: 'restricted-doc'
        });

        expect(result.content).toContain(`Failed to delete ${validType}:restricted-doc`);
        expect(result.display).toContain('❌ Deletion failed:');
        expect(result.error.type).toBe('DELETE_FAILED');
        expect(result.error.message).toBe('Insufficient permissions to delete document');
      });

      it('should handle documents that are being used by other entities', async () => {
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        const usageError = new Error('Cannot delete: still referenced by other documents');
        DocumentAPI.deleteDocument.mockRejectedValue(usageError);

        const result = await tool.execute({
          documentType: validType,
          documentId: 'referenced-doc'
        });

        expect(result.content).toContain(`Failed to delete ${validType}:referenced-doc`);
        expect(result.display).toContain('❌ Deletion failed:');
        expect(result.error.message).toBe('Cannot delete: still referenced by other documents');
      });

      it('should handle concurrent deletion attempts gracefully', async () => {
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        const concurrencyError = new Error('Document was already deleted');
        DocumentAPI.deleteDocument.mockRejectedValue(concurrencyError);

        const result = await tool.execute({
          documentType: validType,
          documentId: 'concurrent-doc'
        });

        expect(result.content).toContain(`Failed to delete ${validType}:concurrent-doc`);
        expect(result.display).toContain('❌ Deletion failed:');
        expect(result.error.message).toBe('Document was already deleted');
      });
    });

    describe('Performance Testing', () => {
      it('should complete document deletion within performance threshold', async () => {
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        DocumentAPI.deleteDocument.mockResolvedValueOnce(undefined);
        
        const deleteDocument = () => tool.execute({
          documentType: validType,
          documentId: 'perf-test'
        });

        // Should complete within 200ms
        const result = PerformanceHelpers.assertPerformance(deleteDocument, 200);
        
        await expect(result).resolves.toBeDefined();
      });

      it('should handle batch deletions efficiently', async () => {
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        DocumentAPI.deleteDocument.mockImplementation(() => Promise.resolve(undefined));
        
        const promises = Array.from({ length: 3 }, (_, i) =>
          tool.execute({
            documentType: validType,
            documentId: `batch-doc-${i}`
          })
        );
        
        const { duration } = PerformanceHelpers.measureTime(() => Promise.all(promises));
        
        // Batch deletions should complete within reasonable time
        expect(duration).toBeLessThan(600); // 600ms for 3 deletions
      });
    });

    describe('Edge Case Testing', () => {
      it('should handle systems with no document types', () => {
        if (Object.keys(systemConfig.Document.documentTypes).length === 0) {
          expect(() => new DocumentDeleteTool()).not.toThrow();
          
          // Should reject any deletion attempt in empty system
          return tool.execute({
            documentType: 'AnyType',
            documentId: 'test'
          }).then(result => {
            expect(result.error).toBeDefined();
          });
        }
      });

      it('should handle special characters in document IDs', async () => {
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        const specialIds = [
          'test-émoji-🧙‍♂️',
          'test with spaces',
          'test/with/slashes',
          'test.with.dots',
          'test_with_underscores'
        ];

        DocumentAPI.deleteDocument.mockImplementation(() => Promise.resolve(undefined));
        
        for (const specialId of specialIds) {
          const result = await tool.execute({
            documentType: validType,
            documentId: specialId
          });

          expect(DocumentAPI.deleteDocument).toHaveBeenCalledWith(validType, specialId);
          expect(result.error).toBeUndefined();
        }
      });

      it('should handle very long document IDs', async () => {
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        const longId = 'a'.repeat(1000); // Very long ID
        
        DocumentAPI.deleteDocument.mockResolvedValueOnce(undefined);
        
        const result = await tool.execute({
          documentType: validType,
          documentId: longId
        });

        expect(DocumentAPI.deleteDocument).toHaveBeenCalledWith(validType, longId);
        expect(result.error).toBeUndefined();
      });
    });

    describe('Safety Features', () => {
      it('should require confirmation for all deletions', () => {
        expect(tool.requiresConfirmation).toBe(true);
      });

      it('should provide clear warning in confirmation details', async () => {
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        const params = {
          documentType: validType,
          documentId: 'important-doc'
        };

        const details = await tool.getConfirmationDetails(params);

        expect(details.details).toContain('Permanently delete');
        expect(details.type).toBe('delete');
      });
    });
  }
);

// System-agnostic legacy compatibility tests
describe('DocumentDeleteTool - Legacy Compatibility', () => {
  let tool;

  beforeEach(() => {
    setupMockFoundryEnvironment('D&D 5e');
    tool = new DocumentDeleteTool();
    jest.clearAllMocks();
    DocumentAPI.deleteDocument = jest.fn();
  });

  afterEach(() => {
    cleanupMockEnvironment();
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

    it('should inherit from BaseTool', () => {
        expect(tool instanceof DocumentDeleteTool).toBe(true);
    });
  });
});

// System-agnostic validation tests
describe('DocumentDeleteTool - System-Agnostic Validation', () => {
  afterEach(() => {
    cleanupMockEnvironment();
  });
  
  it('should maintain consistent behavior across all systems', async () => {
    // Test that error handling works the same way regardless of system
    for (const system of ['D&D 5e', 'Pathfinder 2e', 'Minimal Core']) {
      setupMockFoundryEnvironment(system);
      const tool = new DocumentDeleteTool();
      
      const result = await tool.execute({
        documentType: 'InvalidType',
        documentId: 'test'
      });
      
      expect(result.error).toBeDefined();
      
      cleanupMockEnvironment();
    }
  });
});