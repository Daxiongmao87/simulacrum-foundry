/**
 * Document Schema Tool - Discover document types and schemas
 */

import { BaseTool } from './base-tool.js';
import { DocumentAPI } from '../core/document-api.js';
import { detectDocumentReferences } from '../utils/schema-introspection.js';

class DocumentSchemaTool extends BaseTool {
  /**
   * Create a new Document Schema Tool
   */
  constructor() {
    super('get_document_schema', 'Get schema for any document type', {
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
   * Get document schema for a specific type
   * @param {string} documentType - Document type
   * @returns {Object|null} Document schema or null if not found
   */
  getDocumentSchema(documentType) {
    const documentClass = CONFIG[documentType]?.documentClass;
    if (!documentClass) return null;
    
    return {
      type: documentType,
      fields: Object.keys(documentClass.schema.fields),
      systemFields: documentClass.schema.has('system') ? 
        Object.keys(documentClass.schema.getField('system').fields) : [],
      embedded: this.getEmbeddedTypes(documentClass),
      relationships: this.getDocumentRelationships(documentClass),
      references: this.getDocumentReferences(documentClass),
      permissions: documentClass.PERMISSION_LEVELS || {}
    };
  }

  /**
   * Get document relationships
   * @param {Object} documentClass - Document class
   * @returns {Object} Document relationships
   */
  getDocumentRelationships(documentClass) {
    const relationships = {};
    
    // Embedded documents (whatever exists in document hierarchy)
    if (documentClass.hierarchy) {
      Object.entries(documentClass.hierarchy).forEach(([key, embeddedClass]) => {
        relationships[key] = {
          type: 'embedded',
          documentType: embeddedClass.documentName,
          collection: key,
          canCreate: true,
          canUpdate: true,
          canDelete: true
        };
      });
    }
    
    return relationships;
  }

  /**
   * Get document references
   * @param {Object} documentClass - Document class
   * @returns {Object} Document references
   */
  getDocumentReferences(documentClass) {
    return detectDocumentReferences(documentClass);
  }

  /**
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
   * Get embedded types for a document class
   * @param {Object} documentClass - Document class
   * @returns {Array} Embedded types
   */
  getEmbeddedTypes(documentClass) {
    return documentClass.hierarchy ? Object.keys(documentClass.hierarchy) : [];
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
           `Embedded: ${schema.embedded.join(', ') || 'None'}
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