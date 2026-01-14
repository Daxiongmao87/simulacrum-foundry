/**
 * Document Reading Tool
 * Reads and retrieves documents from FoundryVTT using the Document API
 */

import { BaseTool } from './base-tool.js';
import { createLogger } from '../utils/logger.js';
import { documentReadRegistry } from '../utils/document-read-registry.js';

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
          description: 'Type of document to read',
        },
        documentId: {
          type: 'string',
          description: 'ID of document to read',
        },
        includeEmbedded: {
          type: 'boolean',
          default: true,
          description: 'Include embedded documents (tokens, items, etc.)',
        },
        pack: {
          type: 'string',
          description: 'Compendium Pack ID if reading from a compendium (e.g. "dnd5e.monsters")',
        },
        startLine: {
          type: 'integer',
          description: 'Start line for pagination (1-indexed). Optional.',
        },
        endLine: {
          type: 'integer',
          description: 'End line for pagination (inclusive). Optional.',
        },
      },
      required: ['documentType', 'documentId'],
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
      this.validateParameters(parameters, this.schema);
      const { documentType, documentId, pack } = parameters;

      if (!this.isValidDocumentType(documentType) && !pack) {
        return this._createErrorResponse(
          documentType,
          'DOCUMENT_TYPE_INVALID',
          `Document type "${documentType}" not available in current system`
        );
      }

      const document = await this._fetchDocument(documentType, documentId, { pack });
      if (!document) {
        return this._createErrorResponse(documentType, 'DOCUMENT_NOT_FOUND', 'Document not found');
      }

      // Register that this document has been read (for read-before-modify enforcement)
      const data = typeof document?.toObject === 'function' ? document.toObject() : document;
      documentReadRegistry.registerRead(documentType, documentId, data);

      const content = this._formatDocumentContent(document, documentId, parameters);
      const documentName = document?.name || documentId;

      return {
        content: `Read ${documentType}: ${documentName}\n\n${content}`,
        display: `**${documentName}** (${documentType})`,
      };
    } catch (error) {
      const isNotFound =
        error.message.includes('Document not found') || error.message.includes('not found');
      const code = isNotFound ? 'DOCUMENT_NOT_FOUND' : 'UNKNOWN_ERROR';
      return this._createErrorResponse(parameters.documentType, code, error.message);
    }
  }

  async _fetchDocument(type, id, options = {}) {
    const { DocumentAPI } = await import('../core/document-api.js');
    return DocumentAPI.getDocument(type, id, options);
  }

  _formatDocumentContent(document, id, params) {
    const data = typeof document?.toObject === 'function' ? document.toObject() : document;
    const json = JSON.stringify(data, null, 2);

    if (!params.startLine && !params.endLine) return json;
    return this._paginateContent(json, params.startLine, params.endLine);
  }

  _paginateContent(json, startLine, endLine) {
    const lines = json.split('\n');
    const total = lines.length;
    const start = Math.max(0, (startLine || 1) - 1);
    const end = endLine ? Math.min(total, endLine) : total;

    if (start >= total) {
      return `[Error: Start line ${start + 1} exceeds line count ${total}]`;
    }

    const slice = lines.slice(start, end).join('\n');
    return `[Paginated View: Lines ${start + 1}-${end} of ${total}]\n${slice}`;
  }

  _createErrorResponse(type, code, message) {
    return {
      content: `Failed to read ${type} document: ${message}`,
      display: `❌ Error reading document: ${message}`,
      error: { message, type: code },
    };
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
          id: 'DOCUMENT_ID_HERE',
        },
      },
      {
        description: 'Read a document by name (example)',
        parameters: {
          documentType: 'SomeDocumentType',
          name: 'Exact Name',
        },
      },
      {
        description: 'Read a document with specific fields only (example)',
        parameters: {
          documentType: 'SomeDocumentType',
          id: 'DOCUMENT_ID_HERE',
          fields: ['name', 'type', 'img', 'system'],
          withContent: true,
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
      DOCUMENT_CREATE: false,
      DOCUMENT_READ: true,
    };
  }
}
