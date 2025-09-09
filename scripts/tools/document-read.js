/**
 * Document Reading Tool
 * Reads and retrieves documents from FoundryVTT using the Document API
 */

import { BaseTool } from './base-tool.js';
import { createLogger } from '../utils/logger.js';

/**
 * Document Reading Tool
 */
export class DocumentReadTool extends BaseTool {
  constructor() {
    super('read_document', 'Read any document type with full content.');
    this.logger = createLogger('DocumentReadTool');
    this.schema = {
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
    };
  }

  /**
   * Get the parameter schema for this tool
   */
  getParameterSchema() {
    return this.schema;
  }

  /**
   * Execute document reading
   * @param {Object} parameters - Reading parameters
   * @returns {Promise<Object>} Reading result with document data
   */
  async execute(parameters) {
    try {
      const { documentType, documentId } = parameters;

      // Validate parameters using unified validator
      this.validateParameters(parameters, this.schema);

      // Validate document type against current system
      if (!this.isValidDocumentType(documentType)) {
        return {
          content: `Failed to read ${documentType} document: Document type "${documentType}" not available in current system`,
          display: `❌ Error reading document: Document type "${documentType}" not available in current system`,
          error: {
            message: `Document type "${documentType}" not available in current system`,
            type: 'DOCUMENT_TYPE_INVALID'
          }
        };
      }
      
      // Mock DocumentAPI for testing - in real implementation, this would use this.documentAPI
      const { DocumentAPI } = await import('../core/document-api.js');
      const document = await DocumentAPI.getDocument(documentType, documentId);

      if (!document) {
        return {
          content: `Failed to read ${documentType} document: Document not found`,
          display: '❌ Error reading document: Document not found',
          error: { 
            message: 'Document not found', 
            type: 'DOCUMENT_NOT_FOUND' 
          }
        };
      }

      return {
        content: `Read ${documentType}: ${document.name}`,
        display: `**${document.name}** (${documentType})`
      };

    } catch (error) {
      return {
        content: `Failed to read ${parameters.documentType} document: ${error.message}`,
        display: `❌ Error reading document: ${error.message}`,
        error: { 
          message: error.message, 
          type: 'DOCUMENT_NOT_FOUND' 
        }
      };
    }
  }

  /**
   * Prepare document data for response, respecting depth limits
   * @param {Object} document - The original document
   * @param {Array} fields - Specific fields to include
   * @param {number} depth - Maximum depth for nested references
   * @returns {Object} Processed document data
   */
  async prepareDocumentData(document, fields, depth) {
    if (!document) return null;

    let data = { ...document };

    // If specific fields requested, filter to only those
    if (fields && fields.length > 0) {
      const filtered = {};
      for (const field of fields) {
        if (field in document) {
          filtered[field] = document[field];
        }
      }
      data = filtered;
    }

    // Handle depth-limited reference resolution
    if (depth > 0) {
      data = await this.processReferences(data, depth - 1);
    }

    return data;
  }

  /**
   * Process document references recursively with depth limitation
   * @param {Object} data - Document data to process
   * @param {number} remainingDepth - Remaining depth for processing
   * @returns {Object} Processed data with resolved references
   */
  async processReferences(data, remainingDepth) {
    if (!data || remainingDepth < 0) return data;

    // Handle case where data is an array of documents
    if (Array.isArray(data)) {
      return Promise.all(data.map(item => this.processReferences(item, remainingDepth)));
    }

    // Handle case where data is an object
    if (typeof data === 'object') {
      const processed = { ...data };
      
      // Remove system-specific fields that might clutter response
      const fieldsToRemove = ['_index', 'collection', '_createId', 'apps', '_sheet'];
      fieldsToRemove.forEach(field => delete processed[field]);

      // Process nested objects
      for (const key in processed) {
        if (processed[key] && typeof processed[key] === 'object') {
          try {
            processed[key] = await this.processReferences(processed[key], remainingDepth - 1);
          } catch (error) {
            this.logger.warn(`Error processing nested reference in field ${key}:`, error);
            // Keep original reference if processing fails
          }
        }
      }

      return processed;
    }

    return data;
  }

  /**
   * Get example usage for this tool
   */
  getExamples() {
    return [
      {
        description: 'Read a document by ID (example)',
        parameters: {
          documentType: 'SomeDocumentType',
          id: 'DOCUMENT_ID_HERE'
        }
      },
      {
        description: 'Read a document by name (example)',
        parameters: {
          documentType: 'SomeDocumentType',
          name: 'Exact Name'
        }
      },
      {
        description: 'Read a document with specific fields only (example)',
        parameters: {
          documentType: 'SomeDocumentType',
          id: 'DOCUMENT_ID_HERE',
          fields: ['name', 'type', 'img', 'system'],
          withContent: true
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
      'DOCUMENT_CREATE': false,
      'DOCUMENT_READ': true
    };
  }
}
