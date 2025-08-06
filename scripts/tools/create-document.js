import { Tool } from './tool-registry.js';
import DocumentDiscovery from './discovery-tools.js';

export class CreateDocumentTool extends Tool {
  constructor() {
    super(
      'create_document', 
      'Creates a new document of specified type',
      {
        type: 'object',
        properties: {
          documentType: { type: 'string', description: 'Type of document to create' },
          documentData: { type: 'object', description: 'Data for the new document' }
        },
        required: ['documentType', 'documentData']
      }
    );
  }
  
  async execute(params) {
    try {
      const { documentType, documentData } = params;
      
      // Use DocumentDiscovery to find target collection
      const { collection } = DocumentDiscovery.findCollection(documentType);
      
      // Create the document using Foundry API
      const createdDocument = await collection.documentClass.create(documentData);
      
      return {
        success: true,
        result: {
          id: createdDocument.id,
          name: createdDocument.name || createdDocument.title,
          type: documentType,
          data: createdDocument.toObject()
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: `Failed to create ${params.documentType}: ${error.message}`,
          code: 'CREATE_FAILED'
        }
      };
    }
  }
}