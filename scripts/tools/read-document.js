import { Tool } from './tool-registry.js';
import DocumentDiscovery from './discovery-tools.js';

export class ReadDocumentTool extends Tool {
  constructor() {
    super('read_document', 'Reads an existing document by its ID or name.', {
      type: 'object',
      properties: {
        documentType: {
          type: 'string',
          description: 'Type of document to read',
        },
        documentId: { type: 'string', description: 'ID of document to read' },
        documentName: {
          type: 'string',
          description: 'Name of document to read',
        },
      },
      required: ['documentType'],
      anyOf: [{ required: ['documentId'] }, { required: ['documentName'] }],
    });
  }

  async execute(params) {
    try {
      const { documentType, documentId, documentName } = params;

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
            code: 'DOCUMENT_NOT_FOUND',
          },
        };
      }

      return {
        success: true,
        result: {
          id: document.id,
          name: document.name || document.title,
          type: documentType,
          data: document.toObject(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: `Failed to read ${params.documentType}: ${error.message}`,
          code: 'READ_FAILED',
        },
      };
    }
  }
}
