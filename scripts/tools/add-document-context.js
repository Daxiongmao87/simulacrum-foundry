import { Tool } from './tool-registry.js';
import DocumentDiscovery from './discovery-tools.js';

export class AddDocumentContextTool extends Tool {
  constructor() {
    super(
      'add_document_context',
      'Add a document to the conversation context',
      {
        type: 'object',
        properties: {
          documentType: {
            type: 'string',
            description: 'Type of document to add to context',
          },
          documentId: {
            type: 'string',
            description: 'ID of document to add to context',
          },
        },
        required: ['documentType', 'documentId'],
      }
    );
  }

  async execute(params) {
    try {
      const { documentType, documentId } = params;
      const { collection } = DocumentDiscovery.findCollection(documentType);
      const document = collection.get(documentId);

      if (!document) {
        return { success: false, error: 'Document not found' };
      }

      const contextManager = game.simulacrum.contextManager;
      contextManager.addDocument(documentType, documentId);

      return {
        success: true,
        data: {
          message: `Added ${document.name} to conversation context`,
          documentName: document.name,
          documentType: documentType,
        },
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
