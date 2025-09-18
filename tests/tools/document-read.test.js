/**
 * Tests for DocumentReadTool
 * Enhanced with error scenario coverage, performance testing, and multi-system validation
 */

import { DocumentReadTool } from '../../scripts/tools/document-read.js';
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
describe('DocumentReadTool - constructor', () => {
  let documentReadTool;

  beforeEach(() => {
    setupMockFoundryEnvironment('D&D 5e');
    documentReadTool = new DocumentReadTool();
  });

  afterEach(() => {
    cleanupMockEnvironment();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(documentReadTool.name).toBe('read_document');
      expect(documentReadTool.description).toBe('Read any document type with full content.');
      expect(documentReadTool.schema).toEqual({
        type: 'object',
        properties: {
          documentType: { 
            type: 'string', 
            required: true,
            description: 'Type of document to read'
          },
          documentId: { 
            type: 'string', 
            required: true,
            description: 'ID of document to read'
          },
          includeEmbedded: { 
            type: 'boolean', 
            default: true,
            description: 'Include embedded documents (tokens, items, etc.)'
          }
        },
        required: ['documentType', 'documentId']
      });
    });
  });
});

describe('DocumentReadTool - Utility Methods', () => {
  let documentReadTool;

  beforeEach(() => {
    setupMockFoundryEnvironment('D&D 5e');
    documentReadTool = new DocumentReadTool();
  });

  afterEach(() => {
    cleanupMockEnvironment();
  });

  describe('execute', () => {
    it('should have correct properties for read operations', () => {
      expect(documentReadTool.name).toBe('read_document');
      expect(documentReadTool.description).toBe('Read any document type with full content.');
      expect(documentReadTool.requiresConfirmation).toBe(false); // Reading doesn't require confirmation
    });

    it('should execute document reading successfully', async () => {
      DocumentAPI.getDocument.mockResolvedValue({ 
        name: 'Test Actor',
        type: 'character',
        system: { abilities: {} }
      });

      const result = await documentReadTool.execute({ 
        documentType: 'Actor', 
        documentId: 'test-id' 
      });
      
      const [header, jsonText] = result.content.split(/\n\n/);
      const parsed = JSON.parse(jsonText);
      expect(header).toBe('Read Actor: Test Actor');
      expect(parsed.name).toBe('Test Actor');
      expect(parsed.type).toBe('character');
      expect(result.display).toBe('**Test Actor** (Actor)');
    });

    it('should include journal pages in JSON payload', async () => {
      DocumentAPI.getDocument.mockResolvedValue({ 
        name: 'World of Venoure',
        pages: [{ id: 'page1', text: { content: '<p>Continents</p>' } }]
      });

      const result = await documentReadTool.execute({
        documentType: 'JournalEntry',
        documentId: 'journal-id'
      });

      const [header, jsonText] = result.content.split(/\n\n/);
      const parsed = JSON.parse(jsonText);
      expect(header).toBe('Read JournalEntry: World of Venoure');
      expect(parsed.pages).toBeDefined();
      expect(parsed.pages[0].text.content).toContain('Continents');
      expect(result.display).toBe('**World of Venoure** (JournalEntry)');
    });
  });
});

// Enhanced error scenario and performance testing
describe.each(createParameterizedSystemTests())(
  'DocumentReadTool - Enhanced Testing with %s system',
  (systemName, systemConfig) => {
    let documentReadTool;

    beforeEach(() => {
      setupMockFoundryEnvironment(systemName);
      documentReadTool = new DocumentReadTool();
    });

    afterEach(() => {
      cleanupMockEnvironment();
    });

    describe('execute', () => {
      it('should return document content for valid document types', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        if (documentTypes.length === 0) return;
        
        const testDocType = documentTypes[0];
        const mockDocument = { name: 'Test Document', _id: '123' };
        const mockSchema = { type: testDocType, fields: ['name', '_id'], systemFields: [] };
        
        DocumentAPI.getDocument.mockResolvedValue(mockDocument);
        DocumentAPI.getDocumentSchema.mockReturnValue(mockSchema);
        
        const result = await documentReadTool.execute({ 
          documentType: testDocType, 
          documentId: '123' 
        });
        
        expect(result.content).toContain('Test Document');
        expect(result.display).toContain(`**Test Document** (${testDocType})`);
      });

      it('should return error for non-existent document', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        if (documentTypes.length === 0) return;
        
        const testDocType = documentTypes[0];
        DocumentAPI.getDocument.mockRejectedValue(new Error('Document not found'));
        
        const result = await documentReadTool.execute({ 
          documentType: testDocType, 
          documentId: 'nonexistent' 
        });
        
        expect(result.content).toBe(`Failed to read ${testDocType} document: Document not found`);
        expect(result.display).toBe('❌ Error reading document: Document not found');
        expect(result.error).toEqual({ 
          message: 'Document not found', 
          type: 'DOCUMENT_NOT_FOUND' 
        });
      });

      it('should handle invalid document type errors', async () => {
        const result = await documentReadTool.execute({
          documentType: 'InvalidDocumentType',
          documentId: 'test-id'
        });

        expect(result.error).toBeDefined();
        expect(result.error.message).toContain('not available in current system');
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
          const result = await documentReadTool.execute({
            documentType: validType,
            documentId: badId
          });

          expect(result.error).toBeDefined();
        }
      });

      it('should handle DocumentAPI failures gracefully', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        const apiErrors = [
          new Error('Network timeout'),
          new Error('Permission denied'),
          new Error('Document corrupted'),
          new Error('Database connection lost')
        ];

        for (const error of apiErrors) {
          DocumentAPI.getDocument.mockRejectedValueOnce(error);
          
          const result = await documentReadTool.execute({
            documentType: validType,
            documentId: 'test-doc'
          });

          expect(result.error).toBeDefined();
          expect(result.error.message).toBe(error.message);
        }
      });
    });

    describe('Performance Testing', () => {
      it('should complete document reading within performance threshold', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        const mockDocument = { name: 'Perf Test Doc', _id: 'perf-test' };
        
        DocumentAPI.getDocument.mockResolvedValueOnce(mockDocument);
        DocumentAPI.getDocumentSchema.mockReturnValue({ fields: [], systemFields: [] });
        
        const readDocument = () => documentReadTool.execute({
          documentType: validType,
          documentId: 'perf-test'
        });

        // Should complete within 300ms
        const result = PerformanceHelpers.assertPerformance(readDocument, 300);
        
        await expect(result).resolves.toBeDefined();
      });

      it('should handle batch document reading efficiently', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        DocumentAPI.getDocument.mockImplementation(() => 
          Promise.resolve({ 
            name: `Batch Doc ${Date.now()}`, 
            _id: `batch-${Math.random()}` 
          })
        );
        
        DocumentAPI.getDocumentSchema.mockReturnValue({ fields: [], systemFields: [] });
        
        const promises = Array.from({ length: 5 }, (_, i) =>
          documentReadTool.execute({
            documentType: validType,
            documentId: `batch-doc-${i}`
          })
        );
        
        const { duration } = PerformanceHelpers.measureTime(() => Promise.all(promises));
        
        // Batch reading should complete within reasonable time
        expect(duration).toBeLessThan(800); // 800ms for 5 documents
      });
    });

    describe('Edge Case Testing', () => {
      it('should handle systems with no document types', () => {
        if (Object.keys(game.documentTypes || {}).length === 0) {
          expect(() => new DocumentReadTool()).not.toThrow();
          
          return documentReadTool.execute({
            documentType: 'AnyType',
            documentId: 'test'
          }).then(result => {
            expect(result.error).toBeDefined();
          });
        }
      });

      it('should handle documents with special characters and unicode', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        const specialCharDoc = {
          name: 'Test 🧙‍♂️ Document with émojis and accénts',
          _id: 'unicode-test',
          description: 'Contains ∑øł∂ƒ®öñ†∫∆ unicode symbols'
        };

        DocumentAPI.getDocument.mockResolvedValueOnce(specialCharDoc);
        DocumentAPI.getDocumentSchema.mockReturnValue({ fields: [], systemFields: [] });
        
        const result = await documentReadTool.execute({
          documentType: validType,
          documentId: 'unicode-test'
        });

        expect(result.error).toBeUndefined();
        expect(result.content).toContain('émojis');
      });

      it('should handle deeply nested document structures', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        const deeplyNestedDoc = {
          name: 'Nested Doc',
          _id: 'nested-test',
          level1: {
            level2: {
              level3: {
                level4: {
                  value: 'deep value'
                }
              }
            }
          }
        };

        DocumentAPI.getDocument.mockResolvedValueOnce(deeplyNestedDoc);
        DocumentAPI.getDocumentSchema.mockReturnValue({ fields: [], systemFields: [] });
        
        const result = await documentReadTool.execute({
          documentType: validType,
          documentId: 'nested-test',
          includeEmbedded: true
        });

        expect(result.error).toBeUndefined();
      });

      it('should handle circular reference prevention', async () => {
        const documentTypes = Object.keys(game.documentTypes || {});
        
        if (documentTypes.length === 0) return;
        
        const validType = documentTypes[0];
        
        // Create circular reference structure
        const circularDoc = {
          name: 'Circular Doc',
          _id: 'circular-test'
        };
        circularDoc.self = circularDoc; // Circular reference

        DocumentAPI.getDocument.mockResolvedValueOnce(circularDoc);
        DocumentAPI.getDocumentSchema.mockReturnValue({ fields: [], systemFields: [] });
        
        const result = await documentReadTool.execute({
          documentType: validType,
          documentId: 'circular-test'
        });

        // Should handle gracefully without infinite recursion
        expect(result).toBeDefined();
      });
    });
  }
);

// System-agnostic utility method tests
describe('DocumentReadTool - Utility Methods', () => {
  let documentReadTool;

  beforeEach(() => {
    setupMockFoundryEnvironment('D&D 5e');
    documentReadTool = new DocumentReadTool();
  });

  afterEach(() => {
    cleanupMockEnvironment();
  });

  describe('prepareDocumentData', () => {

    it('should return null for null document', async () => {
      const result = await documentReadTool.prepareDocumentData(null, [], 1);
      expect(result).toBe(null);
    });

    it('should filter to specific fields when requested', async () => {
      const document = {
        id: 'test123',
        name: 'Test Document',
        type: 'Actor',
        data: { hp: 100 },
        secret: 'should not be included'
      };
      
      const result = await documentReadTool.prepareDocumentData(
        document, 
        ['name', 'type'], 
        0
      );
      
      expect(result.name).toBe('Test Document');
      expect(result.type).toBe('Actor');
      expect(result.id).toBeUndefined();
      expect(result.secret).toBeUndefined();
    });

    it('should include all fields when no filter specified', async () => {
      const document = {
        id: 'test123',
        name: 'Test Document',
        type: 'Actor'
      };
      
      const result = await documentReadTool.prepareDocumentData(document, [], 0);
      
      expect(result.id).toBe('test123');
      expect(result.name).toBe('Test Document');
      expect(result.type).toBe('Actor');
    });
  });

  describe('prepareDocumentData depth processing', () => {
    it('should process references when depth > 0', async () => {
      const document = {
        id: 'test123',
        name: 'Test Document',
        nested: { data: 'value' }
      };
      
      const result = await documentReadTool.prepareDocumentData(document, [], 1);
      
      expect(result.id).toBe('test123');
      expect(result.nested).toBeDefined();
    });
  });

  describe('processReferences', () => {
    it('should return data unchanged when remainingDepth < 0', async () => {
      const data = { test: 'value' };
      const result = await documentReadTool.processReferences(data, -1);
      
      expect(result).toEqual(data);
    });

    it('should return data unchanged when data is null', async () => {
      const result = await documentReadTool.processReferences(null, 5);
      
      expect(result).toBe(null);
    });

    it('should process array of documents', async () => {
      const data = [
        { id: '1', name: 'Doc 1' },
        { id: '2', name: 'Doc 2' }
      ];
      
      const result = await documentReadTool.processReferences(data, 1);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('2');
    });
  });

  describe('processReferences field filtering', () => {
    it('should remove system fields from objects', async () => {
      const data = {
        id: 'test123',
        name: 'Test',
        _index: 'should be removed',
        collection: 'should be removed',
        _createId: 'should be removed',
        apps: 'should be removed',
        _sheet: 'should be removed',
        keepThis: 'should remain'
      };
      
      const result = await documentReadTool.processReferences(data, 1);
      
      expect(result.id).toBe('test123');
      expect(result.name).toBe('Test');
      expect(result.keepThis).toBe('should remain');
      expect(result._index).toBeUndefined();
      expect(result.collection).toBeUndefined();
      expect(result._createId).toBeUndefined();
      expect(result.apps).toBeUndefined();
      expect(result._sheet).toBeUndefined();
    });

    it('should handle nested object processing', async () => {
      const data = {
        id: 'test123',
        nested: {
          _index: 'should be removed',
          keepThis: 'should remain',
          deepNested: {
            value: 'deep value'
          }
        }
      };
      
      const result = await documentReadTool.processReferences(data, 2);
      
      expect(result.nested.keepThis).toBe('should remain');
      expect(result.nested._index).toBeUndefined();
      expect(result.nested.deepNested.value).toBe('deep value');
    });
  });

  describe('processReferences error handling', () => {
    it('should handle processing errors gracefully', async () => {
      // Mock console.warn to capture warnings
      // eslint-disable-next-line no-console
      const originalWarn = console.warn;
      // eslint-disable-next-line no-console
      console.warn = jest.fn();
      
      const data = {
        id: 'test123',
        problematicField: {
          // This will cause an error when we try to process it
          get badProperty() {
            throw new Error('Processing error');
          }
        }
      };
      
      const result = await documentReadTool.processReferences(data, 1);
      
      expect(result.id).toBe('test123');
      // eslint-disable-next-line no-console
      expect(console.warn).toHaveBeenCalledWith(
        '[Simulacrum:DocumentReadTool]',
        expect.stringContaining('Error processing nested reference'),
        expect.any(Error)
      );
      
      // Restore console.warn
      // eslint-disable-next-line no-console
      console.warn = originalWarn;
    });
  });

  describe('processReferences primitives', () => {
    it('should return primitive values unchanged', async () => {
      expect(await documentReadTool.processReferences('string', 1)).toBe('string');
      expect(await documentReadTool.processReferences(123, 1)).toBe(123);
      expect(await documentReadTool.processReferences(true, 1)).toBe(true);
    });
  });

  describe('getExamples', () => {
    it('should return usage examples', () => {
      const examples = documentReadTool.getExamples();
      
      expect(Array.isArray(examples)).toBe(true);
      expect(examples.length).toBeGreaterThan(0);
      
      examples.forEach(example => {
        expect(example).toHaveProperty('description');
        expect(example).toHaveProperty('parameters');
        expect(typeof example.description).toBe('string');
        expect(typeof example.parameters).toBe('object');
      });
    });
  });

  describe('getRequiredPermissions', () => {
    it('should return required permissions', () => {
      const permissions = documentReadTool.getRequiredPermissions();
      
      expect(permissions).toHaveProperty('FILES_BROWSE');
      expect(permissions).toHaveProperty('DOCUMENT_CREATE');
      expect(permissions).toHaveProperty('DOCUMENT_READ');
      
      expect(permissions.FILES_BROWSE).toBe(true);
      expect(permissions.DOCUMENT_CREATE).toBe(false);
      expect(permissions.DOCUMENT_READ).toBe(true);
    });
  });
});

// System-agnostic validation tests
describe('DocumentReadTool - System-Agnostic Validation', () => {
  afterEach(() => {
    cleanupMockEnvironment();
  });
  
  it('should maintain consistent behavior across all systems', async () => {
    // Test that error handling works the same way regardless of system
    for (const system of ['D&D 5e', 'Pathfinder 2e', 'Minimal Core']) {
      setupMockFoundryEnvironment(system);
      const tool = new DocumentReadTool();
      
      const result = await tool.execute({
        documentType: 'InvalidType',
        documentId: 'test'
      });
      
      expect(result.error).toBeDefined();
      
      cleanupMockEnvironment();
    }
  });
});
