import { Tool } from './tool-registry.js';
import DocumentDiscovery from './discovery-tools.js';
// SimulacrumSettings import removed - not needed for this tool

export class DeleteDocumentTool extends Tool {
  constructor() {
    super(
      'delete_document',
      'Deletes an existing document by its ID or name (requires deletion permission).',
      {
        type: 'object',
        properties: {
          documentType: {
            type: 'string',
            description:
              'Optional: Type of document to delete (e.g., "Actor", "Item"). If not specified, will search all collections.',
          },
          documentId: {
            type: 'string',
            description: 'ID of document to delete',
          },
          documentName: {
            type: 'string',
            description: 'Name of document to delete',
          },
        },
        required: [],
        anyOf: [{ required: ['documentId'] }, { required: ['documentName'] }],
      }
    );
  }

  shouldConfirmExecute() {
    // Always require confirmation for deletion unless in Gremlin mode
    return true;
  }

  async execute(params) {
    try {
      const { documentType, documentId, documentName } = params;

      // Check deletion permission
      const allowDeletion = game.settings.get('simulacrum', 'allowDeletion');
      if (!allowDeletion) {
        return {
          success: false,
          error: {
            message: 'Document deletion is disabled in settings',
            code: 'DELETION_DISABLED',
          },
        };
      }

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

      const documentInfo = {
        id: document.id,
        name: document.name || document.title,
        type: actualDocumentType,
      };

      // Delete the document using Foundry API
      await document.delete();

      return {
        success: true,
        result: {
          message: `Deleted ${actualDocumentType}: ${documentInfo.name}`,
          deletedDocument: documentInfo,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: `Failed to delete document: ${error.message}`,
          code: 'DELETE_FAILED',
        },
      };
    }
  }
}
