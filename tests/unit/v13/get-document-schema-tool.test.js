/**
 * @file tests/unit/v13/get-document-schema-tool.test.js
 * @description Unit tests for GetDocumentSchemaTool - Issue #90
 */

import { jest } from '@jest/globals';

// Mock FoundrySchemaExtractor before importing the tool
const mockFoundrySchemaExtractor = {
  getDocumentSchema: jest.fn()
};

// Mock the module
jest.unstable_mockModule('../../../scripts/core/foundry-schema-extractor.js', () => ({
  FoundrySchemaExtractor: mockFoundrySchemaExtractor
}));

// Mock the Tool base class
jest.unstable_mockModule('../../../scripts/tools/tool-registry.js', () => ({
  Tool: class MockTool {
    constructor(name, description, parameterSchema, isMarkdown, canUpdate) {
      this.name = name;
      this.description = description;
      this.parameterSchema = parameterSchema;
      this.isOutputMarkdown = isMarkdown || false;
      this.canUpdateOutput = canUpdate || false;
    }
  }
}));

const { GetDocumentSchemaTool } = await import('../../../scripts/tools/get-document-schema.js');

describe('GetDocumentSchemaTool', () => {
  let tool;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create tool instance
    tool = new GetDocumentSchemaTool();
  });

  describe('constructor', () => {
    test('should initialize with correct name and description', () => {
      expect(tool.name).toBe('get_document_schema');
      expect(tool.description).toBe('Retrieves the schema for a specific document type to understand required fields and structure');
    });

    test('should have correct parameter schema', () => {
      expect(tool.parameterSchema).toEqual({
        type: 'object',
        properties: {
          documentType: {
            type: 'string',
            description: 'Type of document to get schema for (e.g., Actor, Item, Scene, etc.)',
          },
        },
        required: ['documentType'],
      });
    });

    test('should not require confirmation', () => {
      expect(tool.shouldConfirmExecute()).toBe(false);
    });
  });

  describe('execute', () => {
    // REAL FoundryVTT Actor schema from web-navigator research: CONFIG.Actor.dataModels.character.defineSchema()
    const realActorSchema = {
      currency: { constructor: { name: 'MappingField' }, required: true, nullable: false },
      abilities: { constructor: { name: 'MappingField' }, required: true, nullable: false },
      bonuses: { constructor: { name: 'SchemaField' }, required: true, nullable: false },
      skills: { constructor: { name: 'MappingField' }, required: true, nullable: false },
      tools: { constructor: { name: 'MappingField' }, required: true, nullable: false },
      spells: { constructor: { name: 'MappingField' }, required: true, nullable: false },
      attributes: { constructor: { name: 'SchemaField' }, required: true, nullable: false },
      bastion: { constructor: { name: 'SchemaField' }, required: true, nullable: false },
      details: { constructor: { name: 'SchemaField' }, required: true, nullable: false },
      traits: { constructor: { name: 'SchemaField' }, required: true, nullable: false },
      resources: { constructor: { name: 'SchemaField' }, required: true, nullable: false },
      favorites: { constructor: { name: 'ArrayField' }, required: true, nullable: false }
    };

    test('should successfully retrieve and format schema', async () => {
      mockFoundrySchemaExtractor.getDocumentSchema.mockResolvedValue(realActorSchema);

      const result = await tool.execute({ documentType: 'Actor' });

      expect(mockFoundrySchemaExtractor.getDocumentSchema).toHaveBeenCalledWith('Actor');
      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        documentType: 'Actor',
        schema: {
          fields: {
            currency: {
              type: 'MappingField',
              required: true,
              nullable: false,
              initial: undefined
            },
            abilities: {
              type: 'MappingField',
              required: true,
              nullable: false,
              initial: undefined
            },
            bonuses: {
              type: 'SchemaField',
              required: true,
              nullable: false,
              initial: undefined
            },
            skills: {
              type: 'MappingField',
              required: true,
              nullable: false,
              initial: undefined
            },
            tools: {
              type: 'MappingField',
              required: true,
              nullable: false,
              initial: undefined
            },
            spells: {
              type: 'MappingField',
              required: true,
              nullable: false,
              initial: undefined
            },
            attributes: {
              type: 'SchemaField',
              required: true,
              nullable: false,
              initial: undefined
            },
            bastion: {
              type: 'SchemaField',
              required: true,
              nullable: false,
              initial: undefined
            },
            details: {
              type: 'SchemaField',
              required: true,
              nullable: false,
              initial: undefined
            },
            traits: {
              type: 'SchemaField',
              required: true,
              nullable: false,
              initial: undefined
            },
            resources: {
              type: 'SchemaField',
              required: true,
              nullable: false,
              initial: undefined
            },
            favorites: {
              type: 'ArrayField',
              required: true,
              nullable: false,
              initial: undefined
            }
          },
          summary: {
            totalFields: 12,
            requiredFields: ['currency', 'abilities', 'bonuses', 'skills', 'tools', 'spells', 'attributes', 'bastion', 'details', 'traits', 'resources', 'favorites'],
            optionalFields: [],
            imageFields: []
          }
        },
        fieldCount: 12
      });
    });

    test('should identify image fields correctly', async () => {
      const schemaWithImageFields = {
        name: { constructor: { name: 'StringField' }, required: true },
        img: { constructor: { name: 'FilePathField' }, required: false },
        avatar: { constructor: { name: 'FilePathField' }, required: false },
        token: { constructor: { name: 'ObjectField' }, required: false },
        portrait: { constructor: { name: 'StringField' }, required: false },
        background: { constructor: { name: 'StringField' }, required: false }
      };

      mockFoundrySchemaExtractor.getDocumentSchema.mockResolvedValue(schemaWithImageFields);

      const result = await tool.execute({ documentType: 'Actor' });

      expect(result.success).toBe(true);
      expect(result.result.schema.summary.imageFields).toEqual(['img', 'avatar', 'token', 'portrait', 'background']);
    });

    test('should categorize required and optional fields correctly', async () => {
      const schemaWithMixedFields = {
        requiredField1: { constructor: { name: 'StringField' }, required: true },
        requiredField2: { constructor: { name: 'NumberField' }, required: true },
        optionalField1: { constructor: { name: 'StringField' }, required: false },
        optionalField2: { constructor: { name: 'BooleanField' } } // undefined required defaults to false
      };

      mockFoundrySchemaExtractor.getDocumentSchema.mockResolvedValue(schemaWithMixedFields);

      const result = await tool.execute({ documentType: 'Item' });

      expect(result.success).toBe(true);
      expect(result.result.schema.summary.requiredFields).toEqual(['requiredField1', 'requiredField2']);
      expect(result.result.schema.summary.optionalFields).toEqual(['optionalField1', 'optionalField2']);
    });

    test('should handle schema not found', async () => {
      mockFoundrySchemaExtractor.getDocumentSchema.mockResolvedValue(null);

      const result = await tool.execute({ documentType: 'NonExistentType' });

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        message: 'No schema found for document type: NonExistentType',
        code: 'SCHEMA_NOT_FOUND'
      });
    });

    test('should handle FoundrySchemaExtractor errors', async () => {
      const mockError = new Error('Schema extraction failed');
      mockFoundrySchemaExtractor.getDocumentSchema.mockRejectedValue(mockError);

      const result = await tool.execute({ documentType: 'Actor' });

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        message: 'Failed to get schema for Actor: Schema extraction failed',
        code: 'SCHEMA_EXTRACTION_FAILED'
      });
    });

    test('should handle malformed schema field gracefully', async () => {
      const schemaWithBadField = {
        goodField: { constructor: { name: 'StringField' }, required: true },
        badField: null, // This will cause an error during processing
        anotherGoodField: { constructor: { name: 'NumberField' }, required: false }
      };

      mockFoundrySchemaExtractor.getDocumentSchema.mockResolvedValue(schemaWithBadField);

      const result = await tool.execute({ documentType: 'Actor' });

      expect(result.success).toBe(true);
      // Should skip the bad field and process the good ones
      expect(Object.keys(result.result.schema.fields)).toEqual(['goodField', 'anotherGoodField']);
      expect(result.result.schema.summary.totalFields).toBe(2);
    });

    test('should handle empty schema', async () => {
      mockFoundrySchemaExtractor.getDocumentSchema.mockResolvedValue({});

      const result = await tool.execute({ documentType: 'EmptyType' });

      expect(result.success).toBe(true);
      expect(result.result.schema.fields).toEqual({});
      expect(result.result.schema.summary).toEqual({
        totalFields: 0,
        requiredFields: [],
        optionalFields: [],
        imageFields: []
      });
      expect(result.result.fieldCount).toBe(0);
    });
  });

  describe('formatSchemaForAI', () => {
    test('should format basic field types correctly', () => {
      const mockSchema = {
        name: { constructor: { name: 'StringField' }, required: true, nullable: false, initial: 'test' },
        count: { constructor: { name: 'NumberField' }, required: false, nullable: true, initial: 0 }
      };

      const formatted = tool.formatSchemaForAI(mockSchema);

      expect(formatted.fields.name).toEqual({
        type: 'StringField',
        required: true,
        nullable: false,
        initial: 'test'
      });

      expect(formatted.fields.count).toEqual({
        type: 'NumberField',
        required: false,
        nullable: true,
        initial: 0
      });
    });
  });

  describe('isImageField', () => {
    test('should identify common image field patterns', () => {
      const imageFieldNames = ['img', 'image', 'avatar', 'token', 'texture', 'icon', 'portrait', 'artwork', 'background', 'cover', 'thumbnail'];
      
      for (const fieldName of imageFieldNames) {
        expect(tool.isImageField(fieldName, {})).toBe(true);
      }
    });

    test('should identify image fields with mixed case', () => {
      expect(tool.isImageField('userAvatar', {})).toBe(true);
      expect(tool.isImageField('characterPortrait', {})).toBe(true);
      expect(tool.isImageField('backgroundImage', {})).toBe(true);
    });

    test('should not identify non-image fields', () => {
      expect(tool.isImageField('name', {})).toBe(false);
      expect(tool.isImageField('description', {})).toBe(false);
      expect(tool.isImageField('health', {})).toBe(false);
    });
  });
});