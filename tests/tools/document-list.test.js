// SPDX-License-Identifier: MIT
// Copyright © 2024-2025 Aaron Riechert

import { DocumentListTool } from '../../scripts/tools/document-list.js';
import { DocumentAPI } from '../../scripts/core/document-api.js';
import {
  setupMockFoundryEnvironment,
  cleanupMockEnvironment,
  createParameterizedSystemTests
} from '../helpers/mock-setup.js';

// Mock DocumentAPI
jest.mock('../../scripts/core/document-api.js');

// System-independent constructor tests
describe('DocumentListTool - constructor', () => {
  let documentListTool;

  beforeEach(() => {
    setupMockFoundryEnvironment('D&D 5e'); // Any system works for constructor
    documentListTool = new DocumentListTool();
  });

  afterEach(() => {
    cleanupMockEnvironment();
  });

  it('should initialize with correct properties', () => {
    expect(documentListTool.name).toBe('list_documents');
    expect(documentListTool.description).toBe('List documents of any type available in current system.  Use this as a broad search.');
    expect(documentListTool.schema).toEqual({
      type: 'object',
      properties: {
        documentType: { 
          type: 'string', 
          description: 'Document type to list (optional - lists all types if omitted)'
        },
        filters: { 
          type: 'object',
          description: 'Filter criteria (name, folder, etc.)'
        },
        includeCompendiums: { 
          type: 'boolean', 
          default: false,
          description: 'Include documents from compendium packs'
        }
      }
    });
  });
});

// Parameterized validation tests across all game systems
describe.each(createParameterizedSystemTests())(
  'DocumentListTool - execute validation with %s system',
  (systemName, systemConfig) => {
    let documentListTool;

    beforeEach(() => {
      setupMockFoundryEnvironment(systemName);
      documentListTool = new DocumentListTool();
    });

    afterEach(() => {
      cleanupMockEnvironment();
    });

    it('should handle invalid document type', async () => {
      const result = await documentListTool.execute({ documentType: 'InvalidType' });
      
      expect(result.content).toContain('Document type "InvalidType" not available in current system');
      expect(result.display).toContain('❌ Unknown document type:');
      expect(result.error).toEqual({
        message: 'Invalid document type',
        type: 'UNKNOWN_DOCUMENT_TYPE'
      });
    });

    it('should accept valid document types for the current system', async () => {
      const documentTypes = Object.keys(systemConfig.documentTypes);
      
      // Test each valid document type for this system
      for (const docType of documentTypes) {
        DocumentAPI.listDocuments.mockResolvedValue([]);
        
        const result = await documentListTool.execute({ documentType: docType });
        
        // Should not have error for valid types
        expect(result.error).toBeUndefined();
        expect(result.content).toContain(`Found 0 ${docType} documents`);
      }
    });

    it('should handle systems with no document types', async () => {
      if (Object.keys(systemConfig.documentTypes).length === 0) {
        const result = await documentListTool.execute({ documentType: 'AnyType' });
        
        expect(result.error).toBeDefined();
        expect(result.content).toContain('not available in current system');
      }
    });
  }
);

// Parameterized success cases across all game systems
describe.each(createParameterizedSystemTests())(
  'DocumentListTool - execute success cases with %s system',
  (systemName, systemConfig) => {
    let documentListTool;

    beforeEach(() => {
      setupMockFoundryEnvironment(systemName);
      documentListTool = new DocumentListTool();
    });

    afterEach(() => {
      cleanupMockEnvironment();
    });

    it('should return success result for valid document types', async () => {
      const documentTypes = Object.keys(systemConfig.documentTypes);
      
      if (documentTypes.length === 0) {
        // Skip test for systems with no document types
        return;
      }
      
      const testDocType = documentTypes[0]; // Use first available type
      DocumentAPI.listDocuments.mockResolvedValue([]);
      
      const result = await documentListTool.execute({ documentType: testDocType });
      
      expect(result.content).toBe(`Found 0 ${testDocType} documents`);
      expect(result.display).toBe(`No ${testDocType} documents found`);
  });

  it('should handle documents with names', async () => {
    const documentTypes = Object.keys(systemConfig.documentTypes);
    
    if (documentTypes.length === 0) {
      // Skip test for systems with no document types
      return;
    }
    
    const testDocType = documentTypes[0];
    const mockDocuments = [
      { name: 'Hero', _id: 'actor1' },
      { name: 'Villain', _id: 'actor2' }
    ];
    DocumentAPI.listDocuments.mockResolvedValue(mockDocuments);
    
    const result = await documentListTool.execute({ documentType: testDocType });
    
    expect(result.content).toBe(`Found 2 ${testDocType} documents`);
    expect(result.display).toBe(`**${testDocType} Documents** (2 total):\nHero (actor1)\nVillain (actor2)`);
  });

  it('should handle documents without names (fallback to _id)', async () => {
    const documentTypes = Object.keys(systemConfig.documentTypes);
    
    if (documentTypes.length === 0) {
      // Skip test for systems with no document types
      return;
    }
    
    const testDocType = documentTypes[0];
    const mockDocuments = [
      { _id: 'actor1' },
      { _id: 'actor2' }
    ];
    DocumentAPI.listDocuments.mockResolvedValue(mockDocuments);
    
    const result = await documentListTool.execute({ documentType: testDocType });
    
    expect(result.content).toBe(`Found 2 ${testDocType} documents`);
    expect(result.display).toBe(`**${testDocType} Documents** (2 total):\nUnnamed (actor1)\nUnnamed (actor2)`);
  });

  it('should handle mixed document types when no specific type is provided', async () => {
    DocumentAPI.getAllDocumentTypes.mockReturnValue(['Actor', 'Item', 'Scene']);
    game.collections.get.mockImplementation((type) => {
      if (type === 'Actor') {
        return { contents: [{ name: 'Hero', _id: 'actor1' }] };
      }
      if (type === 'Item') {
        return { contents: [{ name: 'Sword', _id: 'item1' }] };
      }
      if (type === 'Scene') {
        return { contents: [{ name: 'Dungeon', _id: 'scene1' }] };
      }
      return { contents: [] };
    });

    const result = await documentListTool.execute({});
    
    expect(result.content).toBe('Available document types: Actor, Item, Scene');
    expect(result.display).toContain('Actor (1 documents): Hero');
    expect(result.display).toContain('Item (1 documents): Sword');
    expect(result.display).toContain('Scene (1 documents): Dungeon');
  });

  it('should handle empty document list without specific type', async () => {
    DocumentAPI.getAllDocumentTypes.mockReturnValue([]);
    
    const result = await documentListTool.execute({});
    
    expect(result.content).toBe('No document types available');
    expect(result.display).toBe('No document types available in current system');
  });

  it('should handle API errors', async () => {
    const documentTypes = Object.keys(systemConfig.documentTypes);
    
    if (documentTypes.length === 0) {
      // Skip test for systems with no document types
      return;
    }
    
    const testDocType = documentTypes[0];
    DocumentAPI.listDocuments.mockRejectedValue(new Error('API Error'));
    
    const result = await documentListTool.execute({ documentType: testDocType });
    
    expect(result.content).toBe('Failed to list documents: API Error');
    expect(result.display).toBe('❌ Error listing documents: API Error');
    expect(result.error).toEqual({
      message: 'API Error',
      type: 'LIST_FAILED'
    });
  });
});

describe('DocumentListTool - formatDocumentList', () => {
  let documentListTool;

  beforeEach(() => {
    setupMockFoundryEnvironment('D&D 5e');
    documentListTool = new DocumentListTool();
  });

  afterEach(() => {
    cleanupMockEnvironment();
  });

  it('should handle empty document list with specific type', () => {
    const result = documentListTool.formatDocumentList([], 'Actor');
    expect(result).toBe('No Actor documents found');
  });

  it('should handle empty document list without specific type', () => {
    const result = documentListTool.formatDocumentList([]);
    expect(result).toBe('No  documents found');
  });

  it('should format documents with specific type', () => {
    const documents = [
      { name: 'Hero', _id: 'actor1' },
      { name: 'Villain', _id: 'actor2' }
    ];
    const result = documentListTool.formatDocumentList(documents, 'Actor');
    expect(result).toBe('**Actor Documents** (2 total):\nHero (actor1)\nVillain (actor2)');
  });

  it('should format mixed document types', () => {
    const documents = [
      { name: 'Hero', _id: 'actor1', documentName: 'Actor' },
      { name: 'Sword', _id: 'item1', documentName: 'Item' }
    ];
    const result = documentListTool.formatDocumentList(documents, 'All');
    expect(result).toContain('Hero (actor1)');
    expect(result).toContain('Sword (item1)');
  });
});

describe('DocumentListTool - groupByType', () => {
  let documentListTool;

  beforeEach(() => {
    setupMockFoundryEnvironment('D&D 5e');
    documentListTool = new DocumentListTool();
  });

  afterEach(() => {
    cleanupMockEnvironment();
  });

  it('should group documents by documentName', () => {
    const documents = [
      { name: 'Hero', documentName: 'Actor' },
      { name: 'Villain', documentName: 'Actor' },
      { name: 'Sword', documentName: 'Item' }
    ];
    const result = documentListTool.groupByType(documents);
    
    expect(result).toEqual({
      Actor: [
        { name: 'Hero', documentName: 'Actor' },
        { name: 'Villain', documentName: 'Actor' }
      ],
      Item: [
        { name: 'Sword', documentName: 'Item' }
      ]
    });
  });

  it('should handle documents without documentName', () => {
    const documents = [
      { name: 'Mystery', _id: 'doc1' },
      { name: 'Another', _id: 'doc2' }
    ];
    const result = documentListTool.groupByType(documents);
    
    expect(result).toEqual({
      Unknown: [
        { name: 'Mystery', _id: 'doc1' },
        { name: 'Another', _id: 'doc2' }
      ]
    });
  });

  it('should handle empty document array', () => {
    const result = documentListTool.groupByType([]);
    expect(result).toEqual({});
  });
});