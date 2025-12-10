import { DocumentSearchTool } from '../../scripts/tools/document-search.js';
import { DocumentAPI } from '../../scripts/core/document-api.js';

// Mock DocumentAPI
jest.mock('../../scripts/core/document-api.js');

// Mock FoundryVTT globals for document type validation
global.CONFIG = {
  Document: {
    documentTypes: {
      Actor: {},
      Item: {},
      Scene: {}
    }
  }
};

// Common test setup
let tool;
const mockSearchResults = [
  {
    _id: 'actor-123',
    name: 'Hero Character',
    documentName: 'Actor',
    type: 'character'
  },
  {
    _id: 'item-456',
    name: 'Magic Sword',
    documentName: 'Item',
    type: 'weapon'
  },
  {
    _id: 'scene-789',
    name: 'Castle Dungeon',
    documentName: 'Scene'
  }
];

const setupTest = () => {
  tool = new DocumentSearchTool();
  jest.clearAllMocks();
  DocumentAPI.searchDocuments = jest.fn();
};

describe('DocumentSearchTool - constructor', () => {
  beforeEach(setupTest);

  it('should initialize with correct properties', () => {
    expect(tool.name).toBe('search_documents');
    expect(tool.description).toBe('Search for documents by text content, names, or metadata.  Use this for narrow, targetted searches.');
    expect(tool.requiresConfirmation).toBe(false);
  });

  it('should have correct schema structure', () => {
    expect(tool.schema.type).toBe('object');
    expect(tool.schema.properties).toHaveProperty('query');
    expect(tool.schema.properties).toHaveProperty('documentTypes');
    expect(tool.schema.properties).toHaveProperty('fields');
    expect(tool.schema.properties).toHaveProperty('maxResults');
    expect(tool.schema.required).toEqual(['query']);
  });

  it('should define parameters correctly', () => {
    const { query, documentTypes, fields, maxResults } = tool.schema.properties;

    expect(query.type).toBe('string');
    expect(query.required).toBe(true);
    expect(query.description).toContain('Search text - can be document names');

    expect(documentTypes.type).toBe('array');
    expect(documentTypes.items.type).toBe('string');
    expect(documentTypes.description).toContain('Limit search to specific document types');

    expect(fields.type).toBe('array');
    expect(fields.items.type).toBe('string');
    expect(fields.description).toContain('Specific document fields to search in');

    expect(maxResults.type).toBe('number');
    expect(maxResults.default).toBe(20);
    expect(maxResults.description).toContain('Maximum number of results');
  });
});

describe('DocumentSearchTool - execute - basic search', () => {
  beforeEach(setupTest);

  it('should successfully search documents', async () => {
    const params = {
      query: 'magic'
    };

    DocumentAPI.searchDocuments.mockResolvedValue(mockSearchResults);

    const result = await tool.execute(params);

    expect(DocumentAPI.searchDocuments).toHaveBeenCalledWith({
      query: 'magic',
      types: undefined,
      fields: undefined,
      maxResults: undefined
    });
    expect(result.content).toBe('Found 3 documents matching "magic"');
    expect(result.display).toContain('**Search Results for "magic"**');
    expect(result.display).toContain('- **Hero Character** (ID: actor-123, Type: character)');
    expect(result.display).toContain('- **Magic Sword** (ID: item-456, Type: weapon)');
    expect(result.display).toContain('- **Castle Dungeon** (ID: scene-789, Type: Unknown)');
    expect(result.error).toBeUndefined();
  });
});

describe('DocumentSearchTool - execute - filtered search', () => {
  beforeEach(setupTest);

  it('should search specific document types', async () => {
    const params = {
      query: 'sword',
      documentTypes: ['Item', 'Actor']
    };

    const filteredResults = mockSearchResults.filter(doc =>
      doc.documentName === 'Item' || doc.documentName === 'Actor'
    );
    DocumentAPI.searchDocuments.mockResolvedValue(filteredResults);

    const result = await tool.execute(params);

    expect(DocumentAPI.searchDocuments).toHaveBeenCalledWith({
      query: 'sword',
      types: ['Item', 'Actor'],
      fields: undefined,
      maxResults: undefined
    });
    expect(result.content).toBe('Found 2 documents matching "sword"');
  });

  it('should search specific fields', async () => {
    const params = {
      query: 'hero',
      documentTypes: ['Actor'],
      fields: ['name', 'system.biography']
    };

    const singleResult = [mockSearchResults[0]];
    DocumentAPI.searchDocuments.mockResolvedValue(singleResult);

    const result = await tool.execute(params);

    expect(DocumentAPI.searchDocuments).toHaveBeenCalledWith({
      query: 'hero',
      types: ['Actor'],
      fields: ['name', 'system.biography'],
      maxResults: undefined
    });
    expect(result.content).toBe('Found 1 documents matching "hero"');
  });
});

describe('DocumentSearchTool - execute - result limiting', () => {
  beforeEach(setupTest);

  it('should limit results when maxResults specified', async () => {
    const params = {
      query: 'test',
      maxResults: 2
    };

    DocumentAPI.searchDocuments.mockResolvedValue(mockSearchResults);

    const result = await tool.execute(params);

    expect(result.content).toBe('Found 2 documents matching "test"');
    // Should only show first 2 results
    const displayLines = result.display.split('\n');
    expect(displayLines).toHaveLength(3); // Title + 2 results
  });

  it('should handle no results found', async () => {
    const params = {
      query: 'nonexistent'
    };

    DocumentAPI.searchDocuments.mockResolvedValue([]);

    const result = await tool.execute(params);

    expect(result.content).toBe('Found 0 documents matching "nonexistent"');
    expect(result.display).toBe('No documents found matching "nonexistent"');
  });

});

describe('DocumentSearchTool - execute - advanced queries', () => {
  beforeEach(setupTest);

  it('should handle complex search queries', async () => {
    const params = {
      query: 'magic sword +3',
      documentTypes: ['Item'],
      fields: ['name', 'system.description'],
      maxResults: 10
    };

    DocumentAPI.searchDocuments.mockResolvedValue([mockSearchResults[1]]);

    const result = await tool.execute(params);

    expect(DocumentAPI.searchDocuments).toHaveBeenCalledWith({
      query: 'magic sword +3',
      types: ['Item'],
      fields: ['name', 'system.description'],
      maxResults: 10
    });
    expect(result.content).toBe('Found 1 documents matching "magic sword +3"');
  });

  it('should handle empty query gracefully', async () => {
    const params = {
      query: ''
    };

    DocumentAPI.searchDocuments.mockResolvedValue([]);

    const result = await tool.execute(params);

    expect(DocumentAPI.searchDocuments).toHaveBeenCalledWith({
      query: '',
      types: undefined,
      fields: undefined,
      maxResults: undefined
    });
    expect(result.content).toBe('Found 0 documents matching ""');
  });
});

describe('DocumentSearchTool - execute - error handling', () => {
  beforeEach(setupTest);

  it('should handle search API errors', async () => {
    const params = {
      query: 'test'
    };

    const searchError = new Error('Search index unavailable');
    DocumentAPI.searchDocuments.mockRejectedValue(searchError);

    const result = await tool.execute(params);

    expect(result.content).toBe('Failed to search documents: Search index unavailable');
    expect(result.display).toBe('❌ Search failed: Search index unavailable');
    expect(result.error).toEqual({
      message: 'Search index unavailable',
      type: 'SEARCH_FAILED'
    });
  });

  it('should handle permission errors', async () => {
    const params = {
      query: 'secret'
    };

    const permissionError = new Error('Insufficient permissions to search documents');
    DocumentAPI.searchDocuments.mockRejectedValue(permissionError);

    const result = await tool.execute(params);

    expect(result.content).toContain('Failed to search documents');
    expect(result.display).toContain('❌ Search failed:');
    expect(result.error.type).toBe('SEARCH_FAILED');
  });

});

describe('DocumentSearchTool - formatSearchResults - basic formatting', () => {
  beforeEach(setupTest);

  it('should format results with names', () => {
    const results = [
      { _id: '1', name: 'Test Item', documentName: 'Item' },
      { _id: '2', name: 'Test Actor', documentName: 'Actor' }
    ];

    const formatted = tool.formatSearchResults(results, 'test');

    expect(formatted).toBe(
      '**Search Results for "test"**\n' +
      '- **Test Item** (ID: 1, Type: Unknown)\n' +
      '- **Test Actor** (ID: 2, Type: Unknown)'
    );
  });

  it('should handle documents without names', () => {
    const results = [
      { _id: 'no-name-1', documentName: 'Item' },
      { _id: 'no-name-2', title: 'Has Title', documentName: 'Scene' },
      { _id: 'no-name-3' }
    ];

    const formatted = tool.formatSearchResults(results, 'unnamed');

    expect(formatted).toContain('- **no-name-1** (ID: no-name-1, Type: Unknown)');
    expect(formatted).toContain('- **Has Title** (ID: no-name-2, Type: Unknown)');
    expect(formatted).toContain('- **no-name-3** (ID: no-name-3, Type: Unknown)');
  });
});

describe('DocumentSearchTool - formatSearchResults - edge cases', () => {
  beforeEach(setupTest);

  it('should handle empty results', () => {
    const formatted = tool.formatSearchResults([], 'nothing');

    expect(formatted).toBe('No documents found matching "nothing"');
  });

  it('should handle documents with various name fields', () => {
    const results = [
      { _id: '1', name: 'Has Name', documentName: 'Actor', type: 'character' },
      { _id: '2', title: 'Has Title', documentName: 'Scene', type: 'scene' },
      { _id: '3', documentName: 'Item', type: 'item' }, // Will use _id
      { _id: '4', type: 'unknown' } // Will use _id and 'unknown' type
    ];

    const formatted = tool.formatSearchResults(results, 'various');

    expect(formatted).toContain('- **Has Name** (ID: 1, Type: character)');
    expect(formatted).toContain('- **Has Title** (ID: 2, Type: scene)');
    expect(formatted).toContain('- **3** (ID: 3, Type: item)');
    expect(formatted).toContain('- **4** (ID: 4, Type: unknown)');
  });

  it('should handle special characters in names and queries', () => {
    const results = [
      { _id: '1', name: 'Test "Special" Characters & More', documentName: 'Item' }
    ];

    const formatted = tool.formatSearchResults(results, 'special "query"');

    expect(formatted).toContain('**Search Results for "special "query""**');
    expect(formatted).toContain('- **Test "Special" Characters & More** (ID: 1, Type: Unknown)');
  });
});

describe('DocumentSearchTool - inheritance from BaseTool', () => {
  beforeEach(setupTest);

  it('should not require confirmation for searches', () => {
    expect(tool.requiresConfirmation).toBe(false);
  });

  it('should inherit from BaseTool', () => {
    expect(tool instanceof DocumentSearchTool).toBe(true);
  });
});

describe('DocumentSearchTool - edge cases - large datasets', () => {
  beforeEach(setupTest);

  it('should handle large result sets', async () => {
    const params = {
      query: 'common',
      maxResults: 5
    };

    // Create 100 mock results
    const largeResultSet = Array.from({ length: 100 }, (_, i) => ({
      _id: `doc-${i}`,
      name: `Document ${i}`,
      documentName: 'Item'
    }));

    DocumentAPI.searchDocuments.mockResolvedValue(largeResultSet.slice(0, 5));

    const result = await tool.execute(params);

    expect(result.content).toBe('Found 5 documents matching "common"');
    const displayLines = result.display.split('\n');
    expect(displayLines).toHaveLength(6); // Title + 5 results
  });
});

describe('DocumentSearchTool - edge cases - maxResults handling', () => {
  beforeEach(setupTest);

  it('should handle maxResults larger than result set', async () => {
    const params = {
      query: 'test',
      maxResults: 100
    };

    DocumentAPI.searchDocuments.mockResolvedValue(mockSearchResults);

    const result = await tool.execute(params);

    expect(result.content).toBe('Found 3 documents matching "test"');
  });

  it('should handle undefined maxResults', async () => {
    const params = {
      query: 'test'
      // maxResults not specified
    };

    DocumentAPI.searchDocuments.mockResolvedValue(mockSearchResults);

    const result = await tool.execute(params);

    expect(result.content).toBe('Found 3 documents matching "test"');
  });
});