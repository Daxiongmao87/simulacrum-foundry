/**
 * Document Delete Tool - Delete documents of any type supported by current system
 */

import { BaseTool } from './base-tool.js';
import { DocumentAPI } from '../core/document-api.js';
import { ValidationErrorHandler } from '../utils/validation-errors.js';
import { documentReadRegistry } from '../utils/document-read-registry.js';

class DocumentDeleteTool extends BaseTool {
  /**
   * Validate that the document has been read before deletion
   * @param {string} documentType - Document type
   * @param {string} documentId - Document ID
   * @param {string} [pack] - Optional compendium pack ID
   * @returns {Promise<Object>} The current document if valid
   * @throws {Error} If document not read or stale
   */
  async #enforceReadBeforeDelete(documentType, documentId, pack) {
    const { DocumentAPI } = await import('../core/document-api.js');
    const opts = pack ? { pack } : {};
    const currentDoc = await DocumentAPI.getDocument(documentType, documentId, opts);
    if (!currentDoc) {
      const error = new Error(`Document ${documentType}:${documentId} not found`);
      error.code = 'DOCUMENT_NOT_FOUND';
      throw error;
    }
    const currentData =
      typeof currentDoc?.toObject === 'function' ? currentDoc.toObject() : currentDoc;
    documentReadRegistry.requireReadForModification(documentType, documentId, currentData);
    return currentDoc;
  }

  /**
   * Create a new Document Delete Tool
   */
  constructor() {
    super('delete_document', 'Delete documents of any type supported by current system.', {
      type: 'object',
      properties: {
        documentType: {
          type: 'string',
          description: 'Type of document to delete',
        },
        documentId: {
          type: 'string',
          description: 'ID of document to delete',
        },
        pack: {
          type: 'string',
          description: 'Compendium pack ID to delete document from (e.g., "dnd5e.items")',
        },
      },
      required: ['documentType', 'documentId'],
    });
    this.requiresConfirmation = true;
  }

  /**
   * Get confirmation details for document deletion
   * @param {Object} params - Tool parameters
   * @returns {Object} Confirmation details
   */
  async getConfirmationDetails(params) {
    // Show what will be deleted
    return {
      type: 'delete',
      title: `Delete ${params.documentType} Document`,
      details: `Permanently delete ${params.documentType} document with ID: ${params.documentId}`,
    };
  }

  /**
   * Execute the tool
   * @param {Object} params - Tool parameters
   * @returns {Object} Tool result
   */
  async execute(params) {
    try {
      // Validate document type exists
      if (!this.isValidDocumentType(params.documentType)) {
        return this.#buildErrorResponse(
          params,
          'UNKNOWN_DOCUMENT_TYPE',
          `Document type "${params.documentType}" not available in current system`
        );
      }

      // Enforce read-before-delete
      await this.#enforceReadBeforeDelete(params.documentType, params.documentId, params.pack);

      const deleteOpts = params.pack ? { pack: params.pack } : {};
      await DocumentAPI.deleteDocument(params.documentType, params.documentId, deleteOpts);
      documentReadRegistry.unregister(params.documentType, params.documentId);

      return {
        content: `Deleted ${params.documentType}:${params.documentId}`,
        display: `✅ Deleted **${params.documentType}** document with ID: ${params.documentId}`,
      };
    } catch (error) {
      if (
        error.code === 'DOCUMENT_NOT_READ' ||
        error.code === 'DOCUMENT_STALE' ||
        error.code === 'DOCUMENT_NOT_FOUND'
      ) {
        return this.#buildErrorResponse(params, error.code, error.message);
      }
      return ValidationErrorHandler.createToolErrorResponse(
        error,
        'delete',
        params.documentType,
        params.documentId
      );
    }
  }

  #buildErrorResponse(params, code, message) {
    return {
      content: message,
      display: `❌ ${message}`,
      error: {
        message,
        type: code,
        documentType: params.documentType,
        documentId: params.documentId,
      },
    };
  }
}

export { DocumentDeleteTool };
