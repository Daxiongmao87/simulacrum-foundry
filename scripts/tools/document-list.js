/**
 * Document List Tool - List documents of any type available in current system
 */

import { BaseTool } from './base-tool.js';
import { DocumentAPI } from '../core/document-api.js';

class DocumentListTool extends BaseTool {
  /**
   * Create a new Document List Tool
   */
  constructor() {
    super('list_documents', 'List documents of any type available in current system.  Use this as a broad search.', {
      type: 'object',
      properties: {
        documentType: { 
          type: 'string', 
          description: 'Document type to list (optional - lists all types if omitted)'
        },
        filters: { 
          type: 'object',
          description: 'Filter criteria (name, folder, etc.)'
        },
        includeCompendiums: { 
          type: 'boolean', 
          default: false,
          description: 'Include documents from compendium packs'
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
    // If no documentType specified, list all available document types
    if (!params.documentType) {
      return this.listAllDocumentTypes();
    }

    // Validate document type exists in current system
    if (params.documentType && !this.isValidDocumentType(params.documentType)) {
      return {
        content: 'Document type "' + params.documentType + '" not available in current system',
        display: '❌ Unknown document type: ' + params.documentType,
        error: { message: 'Invalid document type', type: 'UNKNOWN_DOCUMENT_TYPE' }
      };
    }

    try {
      const documents = await DocumentAPI.listDocuments(
        params.documentType,
        { filters: params.filters }
      );
      
      return {
        content: 'Found ' + documents.length + ' ' + (params.documentType || 'total') + ' documents',
        display: this.formatDocumentList(documents, params.documentType)
      };
    } catch (error) {
      return {
        content: 'Failed to list documents: ' + error.message,
        display: '❌ Error listing documents: ' + error.message,
        error: { message: error.message, type: 'LIST_FAILED' }
      };
    }
  }

  /**
   * List all available document types
   * @returns {Object} Tool result with document types
   */
  listAllDocumentTypes() {
    try {
      const documentTypes = DocumentAPI.getAllDocumentTypes();
      
      if (documentTypes.length === 0) {
        return {
          content: 'No document types available',
          display: 'No document types available in current system'
        };
      }

      // Try to get sample documents for each type to show names
      const typeInfo = documentTypes.map(type => {
        try {
          const collection = game.collections.get(type);
          if (collection && collection.contents && collection.contents.length > 0) {
            // Get a few sample document names
            const samples = collection.contents.slice(0, 3).map(doc => {
              const obj = doc.toObject ? doc.toObject() : doc;
              return obj.name || obj._id || 'Unnamed';
            });
            return type + ' (' + collection.contents.length + ' documents): ' + samples.join(', ');
          } else {
            return type + ' (0 documents)';
          }
        } catch (e) {
          return type + ' (Unknown)';
        }
      });

      return {
        content: 'Available document types: ' + documentTypes.join(', '),
        display: '**Available Document Types**\n' + typeInfo.join('\n')
      };
    } catch (error) {
      return {
        content: 'Failed to list document types: ' + error.message,
        display: '❌ Error listing document types: ' + error.message,
        error: { message: error.message, type: 'LIST_TYPES_FAILED' }
      };
    }
  }

  /**
   * Format document list for display
   * @param {Array} documents - Documents to format
   * @param {string} documentType - Document type
   * @returns {string} Formatted document list
   */
  formatDocumentList(documents, documentType) {
    if (documents.length === 0) {
      return 'No ' + (documentType || '') + ' documents found';
    }

    // Format each document with its name and ID
    const formattedDocs = documents.map(doc => {
      const name = doc.name || 'Unnamed';
      const id = doc._id || 'Unknown ID';
      return name + ' (' + id + ')';
    });

    const docsToShow = formattedDocs.slice(0, 20);
    const moreText = formattedDocs.length > 20 ? '\n... and ' + (formattedDocs.length - 20) + ' more' : '';
    return '**' + documentType + ' Documents** (' + documents.length + ' total):\n' + docsToShow.join('\n') + moreText;
  }

  /**
   * Group documents by type
   * @param {Array} documents - Documents to group
   * @returns {Object} Grouped documents
   */
  groupByType(documents) {
    const grouped = {};
    documents.forEach(doc => {
      const type = doc.documentName || doc.type || 'Unknown';
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(doc);
    });
    return grouped;
  }
}

// Export the DocumentListTool class
export { DocumentListTool };
