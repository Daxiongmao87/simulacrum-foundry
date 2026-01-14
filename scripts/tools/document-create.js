/**
 * Document Creation Tool
 * Creates new documents within FoundryVTT using the Document API
 */

import { BaseTool } from './base-tool.js';
import { ValidationErrorHandler } from '../utils/validation-errors.js';
import { documentReadRegistry } from '../utils/document-read-registry.js';

/**
 * Validation schema for document creation parameters
 * Currently handled by validateParams method
 */
// const createDocumentSchema = {
//   type: 'object',
//   required: ['documentType', 'name'],

/**
 * Document Creation Tool
 */
export class DocumentCreateTool extends BaseTool {
  constructor() {
    super('create_document', 'Create document of any type supported by current system');
    this.requiresConfirmation = true;
    this.schema = {
      type: 'object',
      properties: {
        documentType: {
          type: 'string',
          description: 'Type of document to create',
        },
        data: {
          type: 'object',
          description: 'Document data (will be validated by FoundryVTT)',
        },
        folder: {
          type: 'string',
          description: 'Folder ID to create document in',
        },
        pack: {
          type: 'string',
          description: 'Compendium pack ID to create document in (e.g., "dnd5e.items")',
        },
      },
      required: ['documentType', 'data'],
    };
  }

  /**
   * Get the parameter schema for this tool
   */
  getParameterSchema() {
    return this.schema;
  }

  /**
   * Get confirmation details for this tool
   */
  async getConfirmationDetails(params) {
    const { documentType, data } = params;

    // Mock DocumentAPI call (would be real in actual implementation)
    const mockSchema = { fields: ['name', 'type'], systemFields: ['attributes'] };

    return {
      type: 'create',
      title: `Create ${documentType} Document`,
      details: `Creating ${documentType}: ${data.name || 'Unnamed'}`,
      availableFields: mockSchema.fields,
      systemFields: mockSchema.systemFields,
    };
  }

  async _promoteSystemFields(documentType, data) {
    try {
      const { DocumentAPI } = await import('../core/document-api.js');
      const schema = DocumentAPI.getDocumentSchema(documentType);

      if (!schema?.systemFields || !Array.isArray(schema.systemFields)) return;

      if (!data.system) data.system = {};

      for (const field of schema.systemFields) {
        this._migrateField(data, field, schema);
      }
    } catch (migrationError) {
      // Ignoring migration errors
    }
  }

  _migrateField(data, field, schema) {
    // Skip if field not at root or already in system
    if (data[field] === undefined || data.system[field] !== undefined) return;

    const targetType = schema.systemFieldDetails?.[field]?.type;
    const value = data[field];

    if (typeof value === 'string' && (targetType === 'schema_field' || targetType === 'object')) {
      data.system[field] = { value: value };
    } else {
      data.system[field] = value;
    }

    delete data[field];
  }

  /**
   * Execute document creation
   * @param {Object} parameters - Creation parameters
   * @returns {Promise<Object>} Creation result
   */
  async execute(parameters) {
    try {
      const { documentType, data } = parameters;

      // Check if document type is valid
      if (!this.isValidDocumentType(documentType)) {
        return {
          content: `Document type "${documentType}" not available in current system`,
          display: `❌ Unknown document type: ${documentType}`,
          error: {
            message: `Document type "${documentType}" not available in current system`,
            type: 'UNKNOWN_DOCUMENT_TYPE',
          },
        };
      }

      // Validate parameters
      this.validateParameters(parameters, this.schema);

      // Generic Schema Migration (String -> Object promotion)
      await this._promoteSystemFields(documentType, data);

      // Validate image URLs (Task-04)
      await this.validateImageUrls(data);
      if (parameters.folder) await this.validateImageUrls({ folder: parameters.folder }); // unlikely but consistent

      // Mock DocumentAPI for testing - in real implementation, this would use this.documentAPI
      const { DocumentAPI } = await import('../core/document-api.js');

      // RESHAPE DATA: Transform AI-friendly arrays into Foundry-required objects (e.g., MappingField)
      const documentClass = CONFIG[documentType]?.documentClass;
      if (documentClass) {
        this.#reshapeData(data, documentClass, data.type);
      }

      let document;
      if (parameters.pack) {
        const packCollection = game.packs.get(parameters.pack);
        if (!packCollection) {
          return {
            content: `Compendium pack "${parameters.pack}" not found`,
            display: `❌ Pack not found: ${parameters.pack}`,
            error: { message: `pack "${parameters.pack}" not found`, type: 'PACK_NOT_FOUND' }
          };
        }

        // Check if pack is locked
        if (packCollection.locked) {
          return {
            content: `Compendium pack "${parameters.pack}" is locked. Cannot create document.`,
            display: `❌ Pack is locked: ${parameters.pack}`,
            error: { message: `pack "${parameters.pack}" is locked`, type: 'PACK_LOCKED' }
          };
        }

        // Validate document type against pack type
        if (packCollection.documentName !== documentType) {
          return {
            content: `Pack "${parameters.pack}" contains ${packCollection.documentName} documents, but you requested ${documentType}`,
            display: `❌ Type mismatch: Pack contains ${packCollection.documentName}`,
            error: { message: `Type mismatch`, type: 'TYPE_MISMATCH' }
          };
        }

        // Create directly in pack
        document = await documentClass.create(data, { pack: parameters.pack });
      } else {
        document = await DocumentAPI.createDocument(documentType, data);
      }

      if (!document) {
        return {
          content: `Document creation failed`,
          display: `❌ Failed to create ${documentType} document`,
          error: { message: 'Document creation failed', type: 'CREATE_FAILED' },
        };
      }

      // Fetch the full document with embedded data for verification
      // IMPORTANT: Pass pack parameter so we look in the right place!
      const verificationOpts = { includeEmbedded: true };
      if (parameters.pack) verificationOpts.pack = parameters.pack;

      const fullDocument = await DocumentAPI.getDocument(
        documentType,
        document.id || document._id,
        verificationOpts
      );

      // Register the read so the AI can immediately edit it if needed
      if (fullDocument) {
        documentReadRegistry.registerRead(
          documentType,
          fullDocument.id || fullDocument._id,
          fullDocument
        );
      }

      const message = `Created @UUID[${documentType}.${fullDocument._id || fullDocument.id}]{${fullDocument.name || fullDocument._id}}`;
      const contentPayload = {
        message,
        document: fullDocument,
      };

      return {
        content: JSON.stringify(contentPayload, null, 2),
        display: `✅ Created **${fullDocument.name || fullDocument._id || fullDocument.id}** (${documentType})`,
        document: fullDocument,
      };
    } catch (error) {
      return ValidationErrorHandler.createToolErrorResponse(
        error,
        'create',
        parameters.documentType
      );
    }
  }

  /**
   * Reshape data to match Foundry's strict DataModel expectations.
   * Specifically transforms Arrays -> ID-keyed Objects for MappingFields.
   * @param {Object} data - The data object to reshape (modified in place)
   * @param {Class} documentClass - The DataModel class
   * @param {String} [documentSubType] - The sub-type (e.g., 'weapon') for system data lookup
   */
  #reshapeData(data, documentClass, documentSubType) {
    if (!data || typeof data !== 'object') return;

    // 1. Get the relevant schema
    // If we are looking at 'system' data, we need the type-specific model
    const schema = documentClass.schema;

    // Attempt to handle system data reshaping
    if (data.system && typeof data.system === 'object') {
      try {
        const systemModel = CONFIG[documentClass.documentName]?.dataModels?.[documentSubType];
        if (systemModel && systemModel.schema) {
          this.#reshapeDataFields(data.system, systemModel.schema);
        } else if (documentClass.schema?.fields?.system?.model?.schema) {
          // Some systems handle it differently, simplified fallback
          this.#reshapeDataFields(data.system, documentClass.schema.fields.system.model.schema);
        }
      } catch (e) {
        // Ignore system lookup errors
      }
    }

    // 2. Reshape top-level fields
    // (Note: Top level fields on Documents are rarely MappingFields, but good for completeness)
    if (schema) {
      this.#reshapeDataFields(data, schema);
    }
  }

  /**
   * Recursive field processor for #reshapeData
   * @param {Object} dataObject - The object containing data properties
   * @param {Schema} schema - The schema defining those properties
   */
  #reshapeDataFields(dataObject, schema) {
    if (!schema?.fields) return;

    for (const [fieldName, value] of Object.entries(dataObject)) {
      if (!value) continue;
      const field = schema.fields[fieldName];
      if (!field) continue;

      // CHECK: Array provided for a MappingField?
      // MappingFields (like system.activities in dnd5e) require ID-keyed objects
      if (Array.isArray(value)) {
        // USE HELPER: Check full prototype chain for MappingField ancestry
        // (Fixes issue where 'ActivitiesField' subclass was not detected)
        if (this.#isMappingField(field)) {
          // TRANSFORM: Array -> Object with random IDs
          const obj = {};
          value.forEach(item => {
            // Use standard randomID if available, else simple fallback
            const id =
              typeof foundry !== 'undefined'
                ? foundry.utils.randomID()
                : Math.random().toString(36).substring(2, 18);
            obj[id] = item;

            // Recurse into the item if it has its own schema (e.g. Activity DataModel)
            if (field.model?.schema) {
              this.#reshapeDataFields(item, field.model.schema);
            }
          });
          dataObject[fieldName] = obj;
          continue; // Done with this field
        }
      }

      // Recurse for nested objects (SchemaField)
      if (
        field.constructor.name === 'SchemaField' &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        this.#reshapeDataFields(value, field); // SchemaField acts as schema
      }
    }
  }

  /**
   * Helper to identify MappingField instances by checking prototype chain.
   * Handles subclasses like ActivitiesField.
   * @param {DataField} field
   * @returns {boolean}
   */
  #isMappingField(field) {
    if (!field) return false;

    // Check direct constructor
    if (field.constructor.name === 'MappingField') return true;

    // Walk prototype chain to check for inheritance
    let proto = Object.getPrototypeOf(field);
    while (proto) {
      if (proto.constructor?.name === 'MappingField') return true;
      proto = Object.getPrototypeOf(proto);
    }

    return false;
  }

  /**
   * Get example usage for this tool
   */
  getExamples() {
    return [
      {
        description: 'Create a new document (example)',
        parameters: {
          documentType: 'SomeDocumentType',
          name: 'Example Name',
          data: {
            content: '<p>Example content</p>',
          },
        },
      },
      {
        description: 'Create a typed document (example)',
        parameters: {
          documentType: 'SomeDocumentType',
          name: 'Example Entity',
          data: {
            type: 'some-type',
            img: 'icons/example.png',
            system: {
              details: { description: 'Example description' },
            },
          },
        },
      },
      {
        description: 'Create a document in a specific folder (example)',
        parameters: {
          documentType: 'SomeDocumentType',
          name: 'Example Object',
          folder: 'Compendium.foundryvtt.content-folder',
          data: {
            type: 'some-type',
            img: 'icons/example.svg',
            system: { uses: { value: 1, max: 1 } },
          },
        },
      },
    ];
  }

  /**
   * Get required permissions for this tool
   */
  getRequiredPermissions() {
    return {
      FILES_BROWSE: true,
      FILES_UPLOAD: true,
      DOCUMENT_CREATE: true,
      [`ENTITY_CREATE`]: true,
    };
  }
}
