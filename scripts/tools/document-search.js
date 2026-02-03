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
    super(
      'search_documents',
      'Search for documents by text content, names, or metadata.  Use this for narrow, targetted searches.',
      {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search text - can be document names, content, or keywords.',
          },
          documentTypes: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Limit search to specific document types (optional - searches all types if omitted)',
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Specific document fields to search in (optional - searches all fields if omitted)',
          },
          maxResults: {
            type: 'number',
            default: 20,
            description: 'Maximum number of results to return (default: 20)',
          },
        },
        required: ['query'],
      }
    );
  }

  /**
   * Execute the tool
   * @param {Object} params - Tool parameters
   * @returns {Object} Tool result
   */
  async execute(params) {
    try {
      const results = await DocumentAPI.searchDocuments({
        query: params.query,
        types: params.documentTypes,
        fields: params.fields,
        maxResults: params.maxResults,
      });

      // Ensure results are limited even if API returns more
      const limitedResults = params.maxResults ? results.slice(0, params.maxResults) : results;

      const resultCount = limitedResults.length;
      const summary = `Found ${resultCount} document${resultCount !== 1 ? 's' : ''} matching "${params.query}"`;
      return {
        content: this.formatSearchResults(limitedResults, params.query),
        display: `<p><strong>${summary}</strong></p>`,
      };
    } catch (error) {
      return {
        content: 'Failed to search documents: ' + error.message,
        display: 'Search failed: ' + error.message,
        error: { message: error.message, type: 'SEARCH_FAILED' },
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
      return 'No documents found matching "' + query + '"';
    }

    const formattedResults = results.map(doc => {
      const name = doc.name || doc.title || doc._id || 'Untitled';
      const id = doc.id || doc._id || 'Unknown ID';
      const type = doc.type || 'Unknown';
      let uuid = doc.uuid;

      // Construct UUID if missing
      if (!uuid) {
        if (doc.pack) {
          uuid = `Compendium.${doc.pack}.${id}`;
        } else {
          const docType = doc.documentName || (doc.constructor?.documentName) || type;
          // Basic heuristic if documentName isn't available on the result object
          if (docType) {
            uuid = `${docType}.${id}`;
          }
        }
      }

      if (uuid) {
        return `- @UUID[${uuid}]{${name}} (${type})`;
      } else {
        return '- **' + name + '** (ID: ' + id + ', Type: ' + type + ')';
      }
    });

    return '**Search Results for "' + query + '"**\n' + formattedResults.join('\n');
  }
}

export { DocumentSearchTool };
