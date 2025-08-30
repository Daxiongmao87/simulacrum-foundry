import { Tool } from './tool-registry.js';
import DocumentDiscovery from './discovery-tools.js';
// import { SimulacrumSettings } from '../settings.js'; // Available for future use

export class UpdateDocumentTool extends Tool {
  constructor() {
    super(
      'update_document',
      'Updates an existing document with new data by its ID or name.',
      {
        type: 'object',
        properties: {
          documentType: {
            type: 'string',
            description:
              'Optional: Type of document to update (e.g., "Actor", "Item"). If not specified, will search all collections.',
          },
          documentId: {
            type: 'string',
            description: 'ID of document to update',
          },
          documentName: {
            type: 'string',
            description: 'Name of document to update',
          },
          updateData: {
            type: 'object',
            description: 'Data to update in the document',
          },
        },
        required: ['updateData'],
        anyOf: [{ required: ['documentId'] }, { required: ['documentName'] }],
      }
    );
  }

  async execute(params) {
    try {
      const { documentType, documentId, documentName, updateData } = params;

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

      // Update the document using Foundry API
      const updatedDocument = await document.update(updateData);

      return {
        success: true,
        result: {
          id: updatedDocument.id,
          name: updatedDocument.name || updatedDocument.title,
          type: actualDocumentType,
          data: updatedDocument.toObject(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: `Failed to update document: ${error.message}`,
          code: 'UPDATE_FAILED',
        },
      };
    }
  }
}
