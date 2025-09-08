/**
 * Document Search Tool - Search documents by content or metadata
 */

import { BaseTool } from './base-tool.js';
import { DocumentAPI } from '../core/document-api.js';

class DocumentSearchTool extends BaseTool {
  /**
   * Create a new Document Search Tool
   */
  constructor() {
    super('search_documents', 'Search documents by content or metadata', {
      type: 'object',
      properties: {
        query: { 
          type: 'string', 
          required: true,
          description: 'Search query text'
        },
        documentTypes: { 
          type: 'array',
          items: { type: 'string' },
          description: 'Document types to search (empty for all types)'
        },
        fields: { 
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to search in (empty for all fields)'
        },
        maxResults: { 
          type: 'number', 
          default: 20,
          description: 'Maximum number of results to return'
        }
      },
      required: ['query']
    });
  }

  /**
   * Execute the tool
   * @param {Object} params - Tool parameters
   * @returns {Object} Tool result
   */
  async execute(params) {
    try {
      const results = await DocumentAPI.searchDocuments(
        params.query,
        params.documentTypes,
        params.fields
      );

      // Limit results if maxResults specified
      const limitedResults = params.maxResults ? 
        results.slice(0, params.maxResults) : results;

      return {
        content: `Found ${limitedResults.length} documents matching "${params.query}"`,
        display: this.formatSearchResults(limitedResults, params.query)
      };
    } catch (error) {
      return {
        content: `Failed to search documents: ${error.message}`,
        display: `❌ Search failed: ${error.message}`,
        error: { message: error.message, type: 'SEARCH_FAILED' }
      };
    }
  }

  /**
   * Format search results for display
   * @param {Array} results - Search results
   * @param {string} query - Search query
   * @returns {string} Formatted results
   */
  formatSearchResults(results, query) {
    if (results.length === 0) {
      return `No documents found matching "${query}"`;
    }

    const formattedResults = results.map(doc => {
      const name = doc.name || doc.title || doc._id || 'Untitled';
      const type = doc.documentName || 'Unknown';
      return `- **${name}** (${type})`;
    });

    return `**Search Results for "${query}"**\n${formattedResults.join('\n')}`;
  }
}

export { DocumentSearchTool };