import { Tool } from './tool-registry.js';
// import { SimulacrumSettings } from '../settings.js'; // Available for future use

export class SearchDocumentsTool extends Tool {
  constructor() {
    super(
      'search_documents',
      'Searches document content and properties using text matching across specified fields with filtering, pagination, and relevance scoring',
      {
        type: 'object',
        properties: {
          documentType: {
            type: 'string',
            description: 'Type of documents to search',
          },
          query: { type: 'string', description: 'Search query text' },
          searchFields: {
            type: 'array',
            items: { type: 'string' },
            description: 'Fields to search in (name, description, etc.)',
            default: ['name'],
          },
          limit: {
            type: 'number',
            description: 'Maximum results to return',
            default: 20,
          },
          offset: {
            type: 'number',
            description: 'Number of results to skip for pagination',
            default: 0,
          },
        },
        required: ['documentType', 'query'],
      }
    );
  }

  async execute(params) {
    try {
      const {
        documentType,
        query,
        searchFields = ['name'],
        limit = 20,
        offset = 0,
      } = params;
      const searchQuery = query.toLowerCase();

      // Use game collections directly
      const gameCollections = game?.collections;
      if (!gameCollections) {
        throw new Error('Foundry game collections are not available.');
      }

      const collection = gameCollections.get(documentType);
      if (!collection) {
        throw new Error(
          `No collection found for document type: ${documentType}`
        );
      }

      const documents = collection.contents;

      // Search documents
      const searchResults = [];

      for (const doc of documents) {
        let relevanceScore = 0;
        const matchedFields = [];

        for (const field of searchFields) {
          const fieldValue = foundry.utils.getProperty(doc, field);
          if (fieldValue && typeof fieldValue === 'string') {
            const fieldText = fieldValue.toLowerCase();
            if (fieldText.includes(searchQuery)) {
              // Exact matches score higher
              const exactMatch = fieldText === searchQuery;
              const startsWithMatch = fieldText.startsWith(searchQuery);

              if (exactMatch) {
                relevanceScore += 10;
              } else if (startsWithMatch) {
                relevanceScore += 5;
              } else {
                relevanceScore += 1;
              }

              matchedFields.push(field);
            }
          }
        }

        if (relevanceScore > 0) {
          searchResults.push({
            document: doc,
            relevanceScore,
            matchedFields,
          });
        }
      }

      // Sort by relevance and apply limit and offset
      searchResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
      const limitedResults = searchResults.slice(offset, offset + limit);

      return {
        success: true,
        result: {
          query,
          documentType,
          totalFound: searchResults.length,
          returned: limitedResults.length,
          documents: limitedResults.map((result) => ({
            id: result.document.id,
            name: result.document.name || result.document.title,
            type: result.document.type || documentType,
            relevanceScore: result.relevanceScore,
            matchedFields: result.matchedFields,
            folder: result.document.folder?.name,
          })),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: `Failed to search ${params.documentType}: ${error.message}`,
          code: 'SEARCH_FAILED',
        },
      };
    }
  }
}
