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
    super('list_documents', 'List documents of any type available in current system', {
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
    // Validate document type exists in current system
    if (params.documentType && !this.isValidDocumentType(params.documentType)) {
      return {
        content: `Document type "${params.documentType}" not available in current system`,
        display: `❌ Unknown document type: ${params.documentType}`,
        error: { message: 'Invalid document type', type: 'UNKNOWN_DOCUMENT_TYPE' }
      };
    }

    try {
      const documents = await DocumentAPI.listDocuments(
        params.documentType,
        { filters: params.filters }
      );
      
      return {
        content: `Found ${documents.length} ${params.documentType || 'total'} documents`,
        display: this.formatDocumentList(documents, params.documentType)
      };
    } catch (error) {
      return {
        content: `Failed to list documents: ${error.message}`,
        display: `❌ Error listing documents: ${error.message}`,
        error: { message: error.message, type: 'LIST_FAILED' }
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
      return `No ${documentType || ''} documents found`;
    }

    const grouped = documentType ? 
      { [documentType]: documents } : 
      this.groupByType(documents);

    return Object.entries(grouped)
      .map(([type, docs]) => `**${type}** (${docs.length}): ${docs.map(d => d.name || d._id).join(', ')}`)
      .join('\n');
  }

  /**
   * Group documents by type
   * @param {Array} documents - Documents to group
   * @returns {Object} Grouped documents
   */
  groupByType(documents) {
    const grouped = {};
    documents.forEach(doc => {
      const type = doc.documentName || 'Unknown';
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