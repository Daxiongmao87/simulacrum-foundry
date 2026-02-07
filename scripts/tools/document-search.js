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
      'Search for documents by matching a text query against document names, content, and metadata fields. Use this when you have a specific search term — for browsing all documents of a type without a query, use `list_documents` instead. Searches across all document types by default; use `documentTypes` to restrict scope.',
      {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The text to search for. Matches against document names, text content, and metadata fields (e.g., "goblin", "fire damage", "healing potion").',
          },
          documentTypes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Restrict the search to specific document classes (e.g., ["Actor", "Item"]). Omit to search all types.',
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description: 'Restrict the search to specific document fields (e.g., ["name", "system.description.value"]). Omit to search all fields.',
          },
          maxResults: {
            type: 'number',
            default: 20,
            description: 'The maximum number of results to return. Defaults to 20.',
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
        return `- @UUID[${uuid}]{${name}} (${type}, id: ${id})`;
      } else {
        return `- **${name}** (Type: ${type}, id: ${id})`;
      }
    });

    return '**Search Results for "' + query + '"**\n' + formattedResults.join('\n');
  }
}

export { DocumentSearchTool };
