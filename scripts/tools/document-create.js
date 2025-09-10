/**
 * Document Creation Tool
 * Creates new documents within FoundryVTT using the Document API
 */

import { BaseTool } from './base-tool.js';
import { SimulacrumError } from '../utils/errors.js';

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
      systemFields: mockSchema.systemFields
    };
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
          error: { message: `Document type "${documentType}" not available in current system`, type: 'UNKNOWN_DOCUMENT_TYPE' }
        };
      }

      // Validate parameters
      this.validateParameters(parameters, this.schema);
      
      // Mock DocumentAPI for testing - in real implementation, this would use this.documentAPI
      const { DocumentAPI } = await import('../core/document-api.js');
      const document = await DocumentAPI.createDocument(documentType, data);

      if (!document) {
        return {
          content: `Document creation failed`,
          display: `❌ Failed to create ${documentType} document`,
          error: { message: 'Document creation failed', type: 'CREATE_FAILED' }
        };
      }

      return {
        content: `Created ${documentType}: ${document.name}`,
        display: `✅ Created **${document.name}** (${documentType})`
      };

    } catch (error) {
      return {
        content: `Failed to create ${parameters.documentType} document: ${error.message}`,
        display: `❌ Failed to create ${parameters.documentType}: ${error.message}`,
        error: { message: error.message, type: 'CREATE_FAILED' }
      };
    }
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
            content: '<p>Example content</p>'
          }
        }
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
              details: { description: 'Example description' }
            }
          }
        }
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
            system: { uses: { value: 1, max: 1 } }
          }
        }
      }
    ];
  }

  /**
   * Get required permissions for this tool
   */
  getRequiredPermissions() {
    return {
      'FILES_BROWSE': true,
      'FILES_UPLOAD': true,
      'DOCUMENT_CREATE': true,
      [`ENTITY_CREATE`]: true
    };
  }
}
