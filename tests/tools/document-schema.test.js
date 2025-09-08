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
    expect(tool.name).toBe('get_document_schema');
    expect(tool.description).toBe('Get schema for any document type');
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

describe('DocumentSchemaTool - getDocumentSchema', () => {
  beforeEach(setupDocumentSchemaTests);
  it('should return complete schema for valid document type', () => {
    const schema = tool.getDocumentSchema('Actor');
      
    expect(schema).toEqual({
        type: 'Actor',
        fields: ['name', 'type', 'system'],
        systemFields: ['health', 'attributes', 'items'],
        embedded: ['items', 'effects'],
        relationships: {
          items: {
            type: 'embedded',
            documentType: 'Item',
            collection: 'items',
            canCreate: true,
            canUpdate: true,
            canDelete: true
          },
          effects: {
            type: 'embedded',
            documentType: 'ActiveEffect', 
            collection: 'effects',
            canCreate: true,
            canUpdate: true,
            canDelete: true
          }
        },
        references: {
          attributes: {
            field: 'attributes',
            documentType: 'Item',
            path: 'system.attributes',
            type: 'reference',
            required: false
          },
          items: {
            field: 'items',
            documentType: 'Item',
            path: 'system.items',
            type: 'array',
            required: false
          }
        },
        permissions: { OBSERVER: 1, OWNER: 3 }
      });
    });
});

describe('DocumentSchemaTool - getDocumentSchema edge cases', () => {
  beforeEach(setupDocumentSchemaTests);

  it('should return null for invalid document type', () => {
    const schema = tool.getDocumentSchema('InvalidType');
    expect(schema).toBeNull();
    });

  it('should handle document without system schema', () => {
    const schema = tool.getDocumentSchema('Item');
      
    expect(schema.systemFields).toEqual([]);
    expect(schema.embedded).toEqual([]);
    expect(schema.relationships).toEqual({});
  });
});

describe('DocumentSchemaTool - getDocumentRelationships', () => {
  beforeEach(setupDocumentSchemaTests);
  it('should extract embedded document relationships', () => {
    const documentClass = CONFIG.Actor.documentClass;
    const relationships = tool.getDocumentRelationships(documentClass);
      
    expect(relationships).toEqual({
        items: {
          type: 'embedded',
          documentType: 'Item',
          collection: 'items',
          canCreate: true,
          canUpdate: true,
          canDelete: true
        },
        effects: {
          type: 'embedded',
          documentType: 'ActiveEffect',
          collection: 'effects',
          canCreate: true,
          canUpdate: true,
          canDelete: true
        }
      });
    });

  it('should return empty object when no hierarchy', () => {
    const documentClass = { hierarchy: null };
    const relationships = tool.getDocumentRelationships(documentClass);
      
    expect(relationships).toEqual({});
  });
});

describe('DocumentSchemaTool - getDocumentReferences', () => {
  beforeEach(setupDocumentSchemaTests);
  it('should extract document references from system schema', () => {
    const documentClass = CONFIG.Actor.documentClass;
    const references = tool.getDocumentReferences(documentClass);
      
    expect(references).toEqual({
        attributes: {
          field: 'attributes',
          documentType: 'Item',
          path: 'system.attributes',
          type: 'reference',
          required: false
        },
        items: {
          field: 'items',
          documentType: 'Item',
          path: 'system.items',
          type: 'array',
          required: false
        }
      });
    });

  it('should return empty object when no system schema', () => {
    const documentClass = { schema: { getField: () => null } };
    const references = tool.getDocumentReferences(documentClass);
      
    expect(references).toEqual({});
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

describe('DocumentSchemaTool - getEmbeddedTypes', () => {
  beforeEach(setupDocumentSchemaTests);
  it('should return embedded types from hierarchy', () => {
    const documentClass = CONFIG.Actor.documentClass;
    const embedded = tool.getEmbeddedTypes(documentClass);
      
    expect(embedded).toEqual(['items', 'effects']);
    });

  it('should return empty array when no hierarchy', () => {
    const documentClass = { hierarchy: null };
    const embedded = tool.getEmbeddedTypes(documentClass);
      
    expect(embedded).toEqual([]);
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
    expect(formatted).toContain('Embedded: items');
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
      
    expect(formatted).toContain('Embedded: None');
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