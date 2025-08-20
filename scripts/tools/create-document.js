import { Tool } from './tool-registry.js';
import DocumentDiscovery from './discovery-tools.js';

export class CreateDocumentTool extends Tool {
  constructor() {
    super('create_document', 'Creates a new document of specified type', {
      type: 'object',
      properties: {
        documentType: {
          type: 'string',
          description: 'Type of document to create',
        },
        name: { type: 'string', description: 'The name of the new document.' },
        data: {
          type: 'object',
          description:
            'Optional: Additional data to initialize the document with, as a JSON object.',
        },
      },
      required: ['documentType', 'name'],
    });
  }

  async execute(params) {
    try {
      const { documentType, name, data } = params;

      // Use DocumentDiscovery to find target collection
      const { collection } = DocumentDiscovery.findCollection(documentType);

      // Create the document using Foundry API
      const createdDocument = await collection.documentClass.create({
        name,
        ...data,
      });

      return {
        success: true,
        result: {
          id: createdDocument.id,
          name: createdDocument.name || createdDocument.title,
          type: documentType,
          data: createdDocument.toObject(),
        },
      };
    } catch (error) {
      console.error(
        `Simulacrum | CreateDocumentTool: Failed to create ${params.documentType}:`,
        error
      );
      return {
        success: false,
        error: {
          message: `Failed to create ${params.documentType}: ${error.message}`,
          code: 'CREATE_FAILED',
        },
      };
    }
  }
}
