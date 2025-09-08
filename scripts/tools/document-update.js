/**
 * Document Update Tool - Update documents of any type supported by current system
 */

import { BaseTool } from './base-tool.js';
import { DocumentAPI } from '../core/document-api.js';

class DocumentUpdateTool extends BaseTool {
  /**
   * Create a new Document Update Tool
   */
  constructor() {
    super('update_document', 'Update documents of any type supported by current system', {
      type: 'object',
      properties: {
        documentType: { 
          type: 'string', 
          required: true,
          description: 'Type of document to update'
        },
        documentId: { 
          type: 'string', 
          required: true,
          description: 'ID of document to update'
        },
        updates: { 
          type: 'object', 
          required: true,
          description: 'Document updates (will be validated by FoundryVTT)'
        }
      },
      required: ['documentType', 'documentId', 'updates']
    });
    this.requiresConfirmation = true;
  }

  /**
   * Get confirmation details for document update
   * @param {Object} params - Tool parameters
   * @returns {Object} Confirmation details
   */
  async getConfirmationDetails(params) {
    // Show what will be updated
    return {
      type: 'update',
      title: `Update ${params.documentType} Document`,
      details: `Updating ${params.documentType}:${params.documentId} with updates: ${JSON.stringify(params.updates, null, 2)}`
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
        throw new Error(`Document type "${params.documentType}" not available in current system`);
      }

      const document = await DocumentAPI.updateDocument(
        params.documentType,
        params.documentId,
        params.updates
      );

      return {
        content: `Updated ${params.documentType}:${params.documentId}`,
        display: `✅ Updated **${document.name || document.id}** (${params.documentType})`
      };
    } catch (error) {
      return {
        content: `Failed to update ${params.documentType}:${params.documentId}: ${error.message}`,
        display: `❌ Update failed: ${error.message}`,
        error: { message: error.message, type: 'UPDATE_FAILED' }
      };
    }
  }
}

export { DocumentUpdateTool };