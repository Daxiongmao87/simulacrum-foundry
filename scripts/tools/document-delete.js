/**
 * Document Delete Tool - Delete documents of any type supported by current system
 */

import { BaseTool } from './base-tool.js';
import { DocumentAPI } from '../core/document-api.js';
import { ValidationErrorHandler } from '../utils/validation-errors.js';

class DocumentDeleteTool extends BaseTool {
  /**
   * Create a new Document Delete Tool
   */
  constructor() {
    super('delete_document', 'Delete documents of any type supported by current system.', {
      type: 'object',
      properties: {
        documentType: {
          type: 'string',
          description: 'Type of document to delete'
        },
        documentId: {
          type: 'string',
          description: 'ID of document to delete'
        }
      },
      required: ['documentType', 'documentId']
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
      details: `Permanently delete ${params.documentType} document with ID: ${params.documentId}`
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
        return {
          content: `Document type "${params.documentType}" not available in current system`,
          display: `❌ Unknown document type: ${params.documentType}`,
          error: { message: `Document type "${params.documentType}" not available in current system`, type: 'UNKNOWN_DOCUMENT_TYPE' }
        };
      }

      await DocumentAPI.deleteDocument(
        params.documentType,
        params.documentId
      );

      return {
        content: `Deleted ${params.documentType}:${params.documentId}`,
        display: `✅ Deleted **${params.documentType}** document with ID: ${params.documentId}`
      };
    } catch (error) {
      return ValidationErrorHandler.createToolErrorResponse(
        error,
        'delete',
        params.documentType,
        params.documentId
      );
    }
  }
}

export { DocumentDeleteTool };
