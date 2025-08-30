import { Tool } from './tool-registry.js';
// import { SimulacrumSettings } from '../settings.js'; // Available for future use

export class ListDocumentsTool extends Tool {
  constructor() {
    super(
      'list_documents',
      'Lists documents with optional type filtering and pagination. If no documentType is specified, lists all documents from all collections.',
      {
        type: 'object',
        properties: {
          documentType: {
            type: 'string',
            description:
              'Optional: Type of documents to list (e.g., "Actor", "Item", "Scene"). If not specified, lists all document types.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of documents to return',
            default: 50,
          },
          offset: {
            type: 'number',
            description: 'Number of documents to skip for pagination',
            default: 0,
          },
          filter: {
            type: 'object',
            description:
              'Filter criteria for documents (e.g., {"name": "sword"} to find documents with "sword" in name)',
          },
        },
        required: [],
      }
    );
  }

  async execute(params) {
    try {
      const { documentType, limit = 50, offset = 0, filter = {} } = params;

      let documents = [];
      const resultsByType = {};

      if (documentType) {
        // List documents of a specific type
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

        documents = collection.contents;

        // Apply additional filtering
        if (Object.keys(filter).length > 0) {
          documents = documents.filter((doc) => {
            return Object.entries(filter).every(([key, value]) => {
              const docValue = foundry.utils.getProperty(doc, key);
              if (typeof value === 'string' && typeof docValue === 'string') {
                return docValue.toLowerCase().includes(value.toLowerCase());
              }
              return docValue === value;
            });
          });
        }

        // Apply limit and offset
        const limitedDocuments = documents.slice(offset, offset + limit);

        return {
          success: true,
          result: {
            documentType,
            totalFound: documents.length,
            returned: limitedDocuments.length,
            documents: limitedDocuments.map((doc) => ({
              id: doc.id,
              name: doc.name || doc.title,
              type: doc.type || documentType,
              folder: doc.folder?.name,
            })),
          },
        };
      } else {
        // List all documents from all collections
        const gameCollections = game?.collections;
        if (!gameCollections) {
          throw new Error('Foundry game collections are not available.');
        }

        // Get all documents from all collections
        const allDocuments = [];
        const collectionTypes = [];

        for (const [collectionName, collection] of gameCollections.entries()) {
          if (
            collection &&
            collection.contents &&
            collection.contents.length > 0
          ) {
            collectionTypes.push(collectionName);

            const collectionDocs = collection.contents.map((doc) => ({
              id: doc.id,
              name: doc.name || doc.title,
              type: doc.type || collectionName,
              documentType: collectionName, // Track which collection this came from
              folder: doc.folder?.name,
            }));

            allDocuments.push(...collectionDocs);
            resultsByType[collectionName] = {
              count: collection.contents.length,
              items:
                collectionDocs.length > 5
                  ? collectionDocs.slice(0, 5)
                  : collectionDocs,
            };
          }
        }

        // Apply additional filtering if specified
        let filteredDocuments = allDocuments;
        if (Object.keys(filter).length > 0) {
          filteredDocuments = allDocuments.filter((doc) => {
            return Object.entries(filter).every(([key, value]) => {
              const docValue = foundry.utils.getProperty(doc, key);
              if (typeof value === 'string' && typeof docValue === 'string') {
                return docValue.toLowerCase().includes(value.toLowerCase());
              }
              return docValue === value;
            });
          });
        }

        // Apply limit and offset
        const limitedDocuments = filteredDocuments.slice(
          offset,
          offset + limit
        );

        return {
          success: true,
          result: {
            documentType: 'all',
            availableTypes: collectionTypes,
            totalFound: filteredDocuments.length,
            returned: limitedDocuments.length,
            byType: resultsByType,
            documents: limitedDocuments,
          },
        };
      }
    } catch (error) {
      return {
        success: false,
        error: {
          message: `Failed to list documents${params.documentType ? ` of type ${params.documentType}` : ''}: ${error.message}`,
          code: 'LIST_FAILED',
        },
      };
    }
  }
}
