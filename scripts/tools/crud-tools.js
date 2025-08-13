/**
 * @file CRUDTools
 * @module simulacrum/tools/crud-tools
 * @description Provides Tool wrappers for generic CRUD operations on FoundryVTT documents.
 */

import { Tool } from './tool-registry.js';
// import { GenericCRUDTools } from '../core/generic-crud-tools.js'; // Available for future use

/**
 * Tool for creating a new FoundryVTT document.
 */
export class CreateDocumentTool extends Tool {
  /**
   * @param {GenericCRUDTools} crudService An instance of GenericCRUDTools.
   */
  constructor(crudService) {
    super(
      'create_document',
      'Creates a new FoundryVTT document of a specified type with provided data.',
      {
        type: 'object',
        properties: {
          documentType: {
            type: 'string',
            description:
              'The type of document to create. Must be dynamically discovered from the active game system.',
          },
          data: {
            type: 'object',
            description:
              'The data to initialize the new document with (e.g., { name: "New Actor", img: "path/to/img.png" }).',
          },
        },
        required: ['documentType', 'data'],
      }
    );
    this.crudService = crudService;
  }

  /**
   * @param {object} params
   * @param {string} params.documentType
   * @param {object} params.data
   * @returns {Promise<object>} The created document instance.
   */
  async execute(params) {
    console.log('Simulacrum | CreateDocumentTool.execute() started');
    console.log(
      'Simulacrum | Calling crudService.createDocument() with:',
      params.documentType,
      params.data
    );
    try {
      const result = await this.crudService.createDocument(
        params.documentType,
        params.data
      );
      console.log(
        'Simulacrum | crudService.createDocument() succeeded:',
        result
      );
      return result;
    } catch (error) {
      console.error('Simulacrum | crudService.createDocument() failed:', error);
      throw error;
    }
  }
}

/**
 * Tool for reading a FoundryVTT document.
 */
export class ReadDocumentTool extends Tool {
  /**
   * @param {GenericCRUDTools} crudService An instance of GenericCRUDTools.
   */
  constructor(crudService) {
    super('read_document', 'Reads a FoundryVTT document by its ID and type.', {
      type: 'object',
      properties: {
        documentType: {
          type: 'string',
          description:
            'The type of document to read (e.g., "Actor", "Item", "Scene").',
        },
        documentId: {
          type: 'string',
          description: 'The ID of the document to retrieve.',
        },
      },
      required: ['documentType', 'documentId'],
    });
    this.crudService = crudService;
  }

  /**
   * @param {object} params
   * @param {string} params.documentType
   * @param {string} params.documentId
   * @returns {Promise<object>} The retrieved document instance.
   */
  async execute(params) {
    return this.crudService.readDocument(
      params.documentType,
      params.documentId
    );
  }
}

/**
 * Tool for updating an existing FoundryVTT document.
 */
export class UpdateDocumentTool extends Tool {
  /**
   * @param {GenericCRUDTools} crudService An instance of GenericCRUDTools.
   */
  constructor(crudService) {
    super(
      'update_document',
      'Updates an existing FoundryVTT document with new data.',
      {
        type: 'object',
        properties: {
          documentType: {
            type: 'string',
            description: 'The type of document to update.',
          },
          documentId: {
            type: 'string',
            description: 'The ID of the document to update.',
          },
          updates: {
            type: 'object',
            description: 'The data to update the document with.',
          },
        },
        required: ['documentType', 'documentId', 'updates'],
      }
    );
    this.crudService = crudService;
  }

  /**
   * @param {object} params
   * @param {string} params.documentType
   * @param {string} params.documentId
   * @param {object} params.updates
   * @returns {Promise<object>} The updated document instance.
   */
  async execute(params) {
    return this.crudService.updateDocument(
      params.documentType,
      params.documentId,
      params.updates
    );
  }
}

/**
 * Tool for deleting a FoundryVTT document.
 */
export class DeleteDocumentTool extends Tool {
  /**
   * @param {GenericCRUDTools} crudService An instance of GenericCRUDTools.
   */
  constructor(crudService) {
    super(
      'delete_document',
      'Deletes a FoundryVTT document by its ID and type.',
      {
        type: 'object',
        properties: {
          documentType: {
            type: 'string',
            description: 'The type of document to delete.',
          },
          documentId: {
            type: 'string',
            description: 'The ID of the document to delete.',
          },
        },
        required: ['documentType', 'documentId'],
      }
    );
    this.crudService = crudService;
  }

  /**
   * @param {object} params
   * @param {string} params.documentType
   * @param {string} params.documentId
   * @returns {Promise<object>} The deleted document instance.
   */
  async execute(params) {
    return this.crudService.deleteDocument(
      params.documentType,
      params.documentId
    );
  }
}
