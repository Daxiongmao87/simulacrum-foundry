import { Tool } from './tool-registry.js';
import DocumentDiscovery from './discovery-tools.js';
import { hasPermission } from '../settings.js';

export class ListDocumentsTool extends Tool {
  constructor() {
    super(
      'list_document_types',
      'Lists documents of specified type with optional filtering',
      {
        type: 'object',
        properties: {
          documentType: { type: 'string', description: 'Type of documents to list' },
          limit: { type: 'number', description: 'Maximum number of documents to return', default: 50 },
          filter: { type: 'object', description: 'Filter criteria for documents' }
        },
        required: ['documentType']
      }
    );
  }
  
  async execute(params) {
    try {
      const { documentType, limit = 50, filter = {} } = params;
      
      // Use DocumentDiscovery to find target collection
      const { collection, filterByType } = DocumentDiscovery.findCollection(documentType);
      
      let documents = collection.contents;
      
      // Apply subtype filtering if needed
      if (filterByType) {
        documents = documents.filter(doc => doc.type === filterByType);
      }
      
      // Apply additional filtering
      if (Object.keys(filter).length > 0) {
        documents = documents.filter(doc => {
          return Object.entries(filter).every(([key, value]) => {
            const docValue = foundry.utils.getProperty(doc, key);
            if (typeof value === 'string' && typeof docValue === 'string') {
              return docValue.toLowerCase().includes(value.toLowerCase());
            }
            return docValue === value;
          });
        });
      }
      
      // Apply limit
      const limitedDocuments = documents.slice(0, limit);
      
      return {
        success: true,
        result: {
          documentType,
          totalFound: documents.length,
          returned: limitedDocuments.length,
          documents: limitedDocuments.map(doc => ({
            id: doc.id,
            name: doc.name || doc.title,
            type: doc.type || documentType,
            folder: doc.folder?.name
          }))
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: `Failed to list ${params.documentType}: ${error.message}`,
          code: 'LIST_FAILED'
        }
      };
    }
  }
}