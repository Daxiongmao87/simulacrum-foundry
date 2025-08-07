import { Tool } from './tool-registry.js';
import DocumentDiscovery from './discovery-tools.js';
import { SimulacrumSettings } from '../settings.js';

export class DeleteDocumentTool extends Tool {
  constructor() {
    super(
      'delete_document',
      'Deletes an existing document by its ID or name (requires deletion permission).',
      {
        type: 'object',
        properties: {
          documentType: { type: 'string', description: 'Type of document to delete' },
          documentId: { type: 'string', description: 'ID of document to delete' },
          documentName: { type: 'string', description: 'Name of document to delete' }
        },
        required: ['documentType'],
        anyOf: [
          { required: ['documentId'] },
          { required: ['documentName'] }
        ]
      }
    );
  }
  
  shouldConfirmExecute() {
    // Always require confirmation for deletion unless in YOLO mode
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
            code: 'DELETION_DISABLED'
          }
        };
      }
      
      // Use DocumentDiscovery to find target collection
      const { collection } = DocumentDiscovery.findCollection(documentType);
      
      let document;
      if (documentId) {
        document = collection.get(documentId);
      } else if (documentName) {
        document = collection.getName(documentName);
      }
      
      if (!document) {
        return {
          success: false,
          error: {
            message: `Document not found: ${documentId || documentName}`,
            code: 'DOCUMENT_NOT_FOUND'
          }
        };
      }
      
      const documentInfo = {
        id: document.id,
        name: document.name || document.title,
        type: documentType
      };
      
      // Delete the document using Foundry API
      await document.delete();
      
      return {
        success: true,
        result: {
          message: `Deleted ${documentType}: ${documentInfo.name}`,
          deletedDocument: documentInfo
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: `Failed to delete ${params.documentType}: ${error.message}`,
          code: 'DELETE_FAILED'
        }
      };
    }
  }
}