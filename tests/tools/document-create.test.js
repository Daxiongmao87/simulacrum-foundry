/**
 * Tests for DocumentCreateTool
 * Enhanced with error scenario coverage, performance testing, and multi-system validation
 */

import { DocumentCreateTool } from '../../scripts/tools/document-create.js';
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
describe('DocumentCreateTool - constructor', () => {
  let documentCreateTool;

  beforeEach(() => {
    setupMockFoundryEnvironment('D&D 5e');
    documentCreateTool = new DocumentCreateTool();
  });

  afterEach(() => {
    cleanupMockEnvironment();
  });

  it('should initialize with correct properties', () => {
    expect(documentCreateTool.name).toBe('create_document');
    expect(documentCreateTool.description).toBe('Create document of any type supported by current system');
    expect(documentCreateTool.schema).toEqual({
      type: 'object',
      properties: {
        documentType: { 
          type: 'string', 
          required: true,
          description: 'Type of document to create'
        },
        data: { 
          type: 'object', 
          required: true,
          description: 'Document data (will be validated by FoundryVTT)'
        },
        folder: { 
          type: 'string',
          description: 'Folder ID to create document in'
        }
      },
      required: ['documentType', 'data']
    });
    expect(documentCreateTool.requiresConfirmation).toBe(true);
  });
});

describe('DocumentCreateTool - Utility Methods', () => {
  let documentCreateTool;

  beforeEach(() => {
    setupMockFoundryEnvironment('D&D 5e');
    documentCreateTool = new DocumentCreateTool();
  });

  afterEach(() => {
    cleanupMockEnvironment();
  });

  describe('getConfirmationDetails', () => {
    it('should return confirmation details', async () => {
      const mockSchema = { fields: ['name', 'type'], systemFields: ['attributes'] };
      DocumentAPI.getDocumentSchema.mockReturnValue(mockSchema);
      
      const params = { 
        documentType: 'Actor', 
        data: { name: 'New Actor' } 
      };
      
      const details = await documentCreateTool.getConfirmationDetails(params);
      
      expect(details.type).toBe('create');
      expect(details.title).toBe('Create Actor Document');
      expect(details.details).toContain('New Actor');
      expect(details.availableFields).toEqual(['name', 'type']);
      expect(details.systemFields).toEqual(['attributes']);
    });
  });

  describe('execute', () => {
    it('should create document for valid parameters', async () => {
      const mockDocument = { name: 'New Actor', id: 'new-actor-id' };
      DocumentAPI.createDocument.mockResolvedValue(mockDocument);
      
      const result = await documentCreateTool.execute({ 
        documentType: 'Actor', 
        data: { name: 'New Actor' } 
      });
      
      expect(result.content).toBe('Created Actor: New Actor');
      expect(result.display).toBe('✅ Created **New Actor** (Actor)');
    });

    it('should return error for invalid document type', async () => {
      await expect(documentCreateTool.execute({ 
        documentType: 'InvalidType', 
        data: { name: 'New Actor' } 
      })).rejects.toThrow('not available in current system');
    });

    it('should handle API errors gracefully', async () => {
      DocumentAPI.createDocument.mockRejectedValue(new Error('Creation failed'));
      
      await expect(documentCreateTool.execute({ 
        documentType: 'Actor', 
        data: { name: 'New Actor' } 
      })).rejects.toThrow('Creation failed');
    });
  });
});

// Enhanced error scenario and performance testing
describe.each(createParameterizedSystemTests())(
  'DocumentCreateTool - Enhanced Testing with %s system',
  (systemName, systemConfig) => {
    let documentCreateTool;

    beforeEach(() => {
      setupMockFoundryEnvironment(systemName);
      documentCreateTool = new DocumentCreateTool();
    });

    afterEach(() => {
      cleanupMockEnvironment();
    });

    describe('Error Scenario Coverage', () => {
      it('should handle invalid document type errors', async () => {
        await expect(documentCreateTool.execute({
          documentType: 'InvalidDocumentType',
          data: { name: 'Test' }
        })).rejects.toThrow('not available in current system');
      });

      it('should handle malformed document data', async () => {
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
        if (documentTypes.length === 0) return; // Skip for empty systems
        
        const validType = documentTypes[0];
        
        // Test with various malformed data
        const malformedData = [
          null,
          undefined,
          'not an object',
          123,
          []
        ];

        for (const badData of malformedData) {
          await expect(documentCreateTool.execute({
            documentType: validType,
            data: badData
          })).rejects.toThrow();
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
          new Error('Database connection lost')
        ];

        for (const error of apiErrors) {
          DocumentAPI.createDocument.mockRejectedValueOnce(error);
          
          await expect(documentCreateTool.execute({
            documentType: validType,
            data: { name: 'Test Document' }
          })).rejects.toThrow(error.message);
        }
      });
    });

    describe('Performance Testing', () => {
      it('should complete document creation within performance threshold', async () => {
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        DocumentAPI.createDocument.mockResolvedValueOnce({ id: 'perf-test' });
        
        const createDocument = () => documentCreateTool.execute({
          documentType: validType,
          data: { name: 'Performance Test Document' }
        });

        // Should complete within 500ms
        const result = PerformanceHelpers.assertPerformance(createDocument, 500);
        
        await expect(result).resolves.toBeDefined();
      });

      it('should handle batch creation efficiently', async () => {
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        DocumentAPI.createDocument.mockImplementation(() => 
          Promise.resolve({ id: `batch-${Date.now()}-${Math.random()}` })
        );
        
        const promises = Array.from({ length: 10 }, (_, i) =>
          documentCreateTool.execute({
            documentType: validType,
            data: { name: `Batch Document ${i}` }
          })
        );
        
        const { duration } = PerformanceHelpers.measureTime(() => Promise.all(promises));
        
        // Batch creation should complete within reasonable time
        expect(duration).toBeLessThan(1000); // 1 second for 10 documents
      });
    });

    describe('Edge Case Testing', () => {
      it('should handle systems with no document types', async () => {
        if (Object.keys(systemConfig.Document.documentTypes).length === 0) {
          expect(() => new DocumentCreateTool()).not.toThrow();
          
          // Should reject any creation attempt in empty system
          await expect(documentCreateTool.execute({
            documentType: 'AnyType',
            data: { name: 'Test' }
          })).rejects.toThrow('not available in current system');
        }
      });

      it('should handle special characters in document data', async () => {
        const documentTypes = Object.keys(systemConfig.Document.documentTypes);
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        const specialCharData = {
          name: 'Test 🧙‍♂️ Document with émojis and accénts',
          description: '<script>alert("xss")</script>',
          unicode: '∑øł∂ƒ®öñ†∫∆'
        };

        DocumentAPI.createDocument.mockResolvedValueOnce({ id: 'special-chars' });
        
        const result = await documentCreateTool.execute({
          documentType: validType,
          data: specialCharData
        });

        // Should handle special characters without issues
        expect(DocumentAPI.createDocument).toHaveBeenCalledWith(
          validType, 
          specialCharData
        );
      });
    });
  }
);

// System-agnostic validation tests
describe('DocumentCreateTool - System-Agnostic Validation', () => {
  afterEach(() => {
    cleanupMockEnvironment();
  });
  
  it('should maintain consistent behavior across all systems', async () => {
    // Test that error handling works the same way regardless of system
    for (const system of ['D&D 5e', 'Pathfinder 2e', 'Minimal Core']) {
      setupMockFoundryEnvironment(system);
      const tool = new DocumentCreateTool();
      
      await expect(tool.execute({
        documentType: 'InvalidType',
        data: { name: 'Test' }
      })).rejects.toThrow('not available in current system');
      
      cleanupMockEnvironment();
    }
  });
});