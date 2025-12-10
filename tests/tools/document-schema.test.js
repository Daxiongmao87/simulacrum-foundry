import { DocumentSchemaTool } from '../../scripts/tools/document-schema.js';

// Mock FoundryVTT globals
global.CONFIG = {
  Document: {
    documentTypes: {
      Actor: {},
      Item: {},
      Scene: {}
    }
  },
  Actor: {
    documentClass: {
      schema: {
        fields: { name: {}, type: {}, system: {} },
        has: (field) => field === 'system',
        getField: (field) => field === 'system' ? {
          fields: {
            health: {},
            attributes: { constructor: { name: 'ForeignDocumentField' }, model: { documentName: 'Item' } },
            items: {
              constructor: { name: 'ArrayField' },
              element: { constructor: { name: 'ForeignDocumentField' }, model: { documentName: 'Item' } }
            }
          }
        } : null
      },
      hierarchy: {
        items: { documentName: 'Item' },
        effects: { documentName: 'ActiveEffect' }
      },
      PERMISSION_LEVELS: { OBSERVER: 1, OWNER: 3 }
    }
  },
  Item: {
    documentClass: {
      schema: {
        fields: { name: {}, type: {} },
        has: () => false,
        getField: () => null
      },
      hierarchy: null
    }
  },
  Scene: {
    documentClass: {
      schema: {
        fields: { name: {}, width: {}, height: {} },
        has: () => false,
        getField: () => null
      },
      hierarchy: {}
    }
  }
};

global.game = {
  collections: {
    get: (type) => {
      const mockCollections = {
        Actor: { size: 5 },
        Item: { size: 20 },
        Scene: { size: 3 }
      };
      return mockCollections[type] || null;
    }
  },
  documentTypes: {
    Actor: {},
    Item: {},
    Scene: {}
  },
  packs: [
    { documentName: 'Actor' },
    { documentName: 'Item' },
    { documentName: 'Item' }
  ]
};

// Common test setup
let tool;

const setupDocumentSchemaTests = () => {
  tool = new DocumentSchemaTool();
};

describe('DocumentSchemaTool - constructor', () => {
  beforeEach(setupDocumentSchemaTests);

  it('should initialize with correct name and description', () => {
    expect(tool.name).toBe('inspect_document_schema');
    expect(tool.description).toBe('Inspect schema for any document type.  Important for creating rich documents.');
    expect(tool.schema).toHaveProperty('type', 'object');
    expect(tool.schema.properties).toHaveProperty('documentType');
  });

  it('should have optional documentType parameter', () => {
    const docTypeParam = tool.schema.properties.documentType;
    expect(docTypeParam.type).toBe('string');
    expect(docTypeParam.description).toContain('optional');
  });
});

describe('DocumentSchemaTool - execute', () => {
  beforeEach(setupDocumentSchemaTests);

  it('should return specific document schema when documentType provided', async () => {
    const result = await tool.execute({ documentType: 'Actor' });

    expect(result.content).toContain('Schema for Actor:');
    expect(result.display).toContain('**Actor Schema**');
    expect(result.display).toContain('Fields: name, type, system');
    expect(result.display).toContain('System Fields: health, attributes, items');
  });

  it('should return all document types when no documentType provided', async () => {
    const result = await tool.execute({});

    expect(result.content).toContain('Available document types:');
    expect(result.display).toContain('**Available Document Types**');
    expect(result.display).toContain('- Actor (5 in world');
    expect(result.display).toContain('- Item (20 in world');
    expect(result.display).toContain('- Scene (3 in world');
  });

  it('should handle invalid document type gracefully', async () => {
    const result = await tool.execute({ documentType: 'InvalidType' });

    expect(result.display).toContain('❌ No schema found for document type: InvalidType');
  });
});



describe('DocumentSchemaTool - getAllDocumentTypes', () => {
  beforeEach(setupDocumentSchemaTests);
  it('should return all available document types with counts', () => {
    const types = tool.getAllDocumentTypes();

    expect(types).toEqual([
      { name: 'Actor', collection: 5, compendiums: 1 },
      { name: 'Item', collection: 20, compendiums: 2 },
      { name: 'Scene', collection: 3, compendiums: 0 }
    ]);
  });
});

describe('DocumentSchemaTool - formatSchema', () => {
  beforeEach(setupDocumentSchemaTests);
  it('should format schema for display', () => {
    const schema = {
      fields: ['name', 'type'],
      systemFields: ['health', 'mana'],
      embedded: ['items'],
      relationships: { items: {} }
    };

    const formatted = tool.formatSchema('TestType', schema);

    expect(formatted).toContain('**TestType Schema**');
    expect(formatted).toContain('Fields: name, type');
    expect(formatted).toContain('System Fields: health, mana');
    expect(formatted).toContain('Embedded Documents: items (use inspect_document_schema to view their schemas)');
    expect(formatted).toContain('Relationships: items');
  });

  it('should handle null schema', () => {
    const formatted = tool.formatSchema('InvalidType', null);

    expect(formatted).toBe('❌ No schema found for document type: InvalidType');
  });

  it('should handle empty arrays', () => {
    const schema = {
      fields: [],
      systemFields: [],
      embedded: [],
      relationships: {}
    };

    const formatted = tool.formatSchema('EmptyType', schema);

    expect(formatted).toContain('Embedded Documents: None');
    expect(formatted).toContain('Relationships: None');
  });
});

describe('DocumentSchemaTool - formatAllDocumentTypes', () => {
  beforeEach(setupDocumentSchemaTests);
  it('should format all document types for display', () => {
    const types = [
      { name: 'Actor', collection: 5, compendiums: 1 },
      { name: 'Item', collection: 10, compendiums: 2 }
    ];

    const formatted = tool.formatAllDocumentTypes(types);

    expect(formatted).toContain('**Available Document Types**');
    expect(formatted).toContain('- Actor (5 in world, 1 in compendiums)');
    expect(formatted).toContain('- Item (10 in world, 2 in compendiums)');
  });

  it('should handle empty types array', () => {
    const formatted = tool.formatAllDocumentTypes([]);

    expect(formatted).toBe('No document types found in current system');
  });
});