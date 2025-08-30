import { Tool } from './tool-registry.js';
import DocumentDiscovery from './discovery-tools.js';

export class ReadDocumentTool extends Tool {
  constructor() {
    super('read_document', 'Reads an existing document by its ID or name.', {
      type: 'object',
      properties: {
        documentType: {
          type: 'string',
          description:
            'Optional: Type of document to read (e.g., "Actor", "Item"). If not specified, will search all collections.',
        },
        documentId: { type: 'string', description: 'ID of document to read' },
        documentName: {
          type: 'string',
          description: 'Name of document to read',
        },
      },
      required: [],
      anyOf: [{ required: ['documentId'] }, { required: ['documentName'] }],
    });
  }

  async execute(params) {
    try {
      const { documentType, documentId, documentName } = params;

      let document;
      let actualDocumentType;

      if (documentType) {
        // Use DocumentDiscovery to find target collection
        const { collection } = DocumentDiscovery.findCollection(documentType);

        if (documentId) {
          document = collection.get(documentId);
        } else if (documentName) {
          document = collection.getName(documentName);
        }
        actualDocumentType = documentType;
      } else {
        // Search all collections for the document
        const gameCollections = game?.collections;
        if (!gameCollections) {
          throw new Error('Foundry game collections are not available.');
        }

        for (const [collectionName, collection] of gameCollections.entries()) {
          if (documentId) {
            document = collection.get(documentId);
          } else if (documentName) {
            document = collection.getName(documentName);
          }

          if (document) {
            actualDocumentType = collectionName;
            break;
          }
        }
      }

      if (!document) {
        return {
          success: false,
          error: {
            message: `Document not found: ${documentId || documentName}`,
            code: 'DOCUMENT_NOT_FOUND',
          },
        };
      }

      return {
        success: true,
        result: {
          id: document.id,
          name: document.name || document.title,
          type: actualDocumentType,
          data: document.toObject(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: `Failed to read document: ${error.message}`,
          code: 'READ_FAILED',
        },
      };
    }
  }
}
