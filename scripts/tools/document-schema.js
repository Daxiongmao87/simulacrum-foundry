/**
 * Document Schema Tool - Discover document types and schemas
 */

import { BaseTool } from './base-tool.js';
import { DocumentAPI } from '../core/document-api.js';

class DocumentSchemaTool extends BaseTool {
  /**
   * Create a new Document Schema Tool
   */
  constructor() {
    super('inspect_document_schema', 'Inspect schema for any document type.  Important for creating rich documents.', {
      type: 'object',
      properties: {
        documentType: {
          type: 'string',
          description: 'Document type to get schema for (optional - returns all if omitted)'
        }
      }
    });
  }

  /**
   * Execute the tool
   * @param {Object} params - Tool parameters
   * @returns {Object} Tool result
   */
  async execute(params) {
    if (params.documentType) {
      // Get specific document type schema
      const schema = DocumentAPI.getDocumentSchema(params.documentType);
      return {
        content: `Schema for ${params.documentType}: ${JSON.stringify(schema)}`,
        display: this.formatSchema(params.documentType, schema)
      };
    } else {
      // Get all available document types and their basic info
      const availableTypes = this.getAllDocumentTypes();
      return {
        content: `Available document types: ${JSON.stringify(availableTypes)}`,
        display: this.formatAllDocumentTypes(availableTypes)
      };
    }
  }

  /**
   * Get all document types
   * @returns {Array} All document types with info
   */
  getAllDocumentTypes() {
    return Object.keys(game?.documentTypes || {})
      .filter(type => game?.collections?.get(type) !== undefined)
      .map(type => ({
        name: type,
        collection: game.collections.get(type)?.size || 0,
        compendiums: game.packs.filter(p => p.documentName === type).length
      }));
  }

  /**
   * Format schema for display
   * @param {string} documentType - Document type
   * @param {Object} schema - Document schema
   * @returns {string} Formatted schema
   */
  formatSchema(documentType, schema) {
    if (!schema) {
      return `❌ No schema found for document type: ${documentType}`;
    }

    return `**${documentType} Schema**
` +
      `Fields: ${schema.fields.join(', ')}
` +
      `System Fields: ${schema.systemFields.join(', ')}
` +
      `Embedded Documents: ${schema.embedded.length > 0 ? schema.embedded.join(', ') + ' (use inspect_document_schema to view their schemas)' : 'None'}
` +
      `Relationships: ${Object.keys(schema.relationships).join(', ') || 'None'}`;
  }

  /**
   * Format all document types for display
   * @param {Array} types - Document types
   * @returns {string} Formatted types
   */
  formatAllDocumentTypes(types) {
    if (types.length === 0) {
      return 'No document types found in current system';
    }

    return '**Available Document Types**\n' +
      types.map(type =>
        `- ${type.name} (${type.collection} in world, ${type.compendiums} in compendiums)`
      ).join('\n');
  }
}

export { DocumentSchemaTool };
