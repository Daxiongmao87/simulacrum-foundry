import { Tool } from './tool-registry.js';
import DocumentDiscovery from './discovery-tools.js';
import { hasPermission } from '../settings.js';

export class UpdateDocumentTool extends Tool {
  constructor() {
    super(
      'update_document',
      'Updates an existing document with new data',
      {
        type: 'object',
        properties: {
          documentType: { type: 'string', description: 'Type of document to update' },
          documentId: { type: 'string', description: 'ID of document to update' },
          documentName: { type: 'string', description: 'Name of document to update' },
          updateData: { type: 'object', description: 'Data to update in the document' }
        },
        required: ['documentType', 'updateData'],
        anyOf: [
          { required: ['documentId'] },
          { required: ['documentName'] }
        ]
      }
    );
  }
  
  async execute(params) {
    try {
      const { documentType, documentId, documentName, updateData } = params;
      
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
      
      // Update the document using Foundry API
      const updatedDocument = await document.update(updateData);
      
      return {
        success: true,
        result: {
          id: updatedDocument.id,
          name: updatedDocument.name || updatedDocument.title,
          type: documentType,
          data: updatedDocument.toObject()
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: `Failed to update ${params.documentType}: ${error.message}`,
          code: 'UPDATE_FAILED'
        }
      };
    }
  }
}