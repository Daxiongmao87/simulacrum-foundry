/**
 * @file CRUDTools
 * @module simulacrum/tools/crud-tools
 * @description Provides Tool wrappers for generic CRUD operations on FoundryVTT documents.
 */

import { Tool } from './tool-registry.js';
import { WorkflowEnforcer } from '../core/workflow-enforcer.js';
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
      'Creates a new FoundryVTT document of a specified type with provided data. REQUIRED: The img field is mandatory - you MUST use list_images tool to find an appropriate image before creating any document.',
      {
        type: 'object',
        properties: {
          documentType: {
            type: 'string',
            description:
              'The type of document to create (e.g., "Item", "Actor", "Scene"). Must be a valid FoundryVTT document type discovered from the active game system.',
          },
          data: {
            type: 'object',
            description:
              'The complete document data object with ALL required fields filled. MANDATORY: Must include valid image paths in img field obtained from list_images tool. The img field is required for ALL documents without exception. Example: { name: "Magic Sword", img: "systems/dnd5e/icons/equipment/weapons/sword-long.png", system: {...} }',
          },
        },
        required: ['documentType', 'data'],
      }
    );
    this.crudService = crudService;
    this.workflowEnforcer = new WorkflowEnforcer();
  }

  /**
   * @param {object} params
   * @param {string} params.documentType
   * @param {object} params.data
   * @returns {Promise<object>} The created document instance.
   */
  async execute(params) {
    try {
      // Validate required parameters
      if (!params.documentType) {
        throw new Error(
          'Parameter "documentType" is required and cannot be undefined or null'
        );
      }
      if (!params.data) {
        throw new Error(
          'Parameter "data" is required and cannot be undefined or null'
        );
      }

      // Get global workflow enforcer instance
      const workflowEnforcer = game.simulacrum?.workflowEnforcer;
      if (workflowEnforcer) {
        const validation = workflowEnforcer.validateDocumentCreation(params);
        if (!validation.isValid) {
          const errorMessage = `WORKFLOW ENFORCEMENT FAILED:\n${validation.errors.join('\n')}`;
          throw new Error(errorMessage);
        }
      }

      // Validate that data contains required img field
      if (!params.data.img) {
        throw new Error(
          'WORKFLOW VIOLATION: Document data must include "img" field with valid image path. You MUST use list_images tool first to find appropriate images.'
        );
      }

      // Validate that img field is not a placeholder or invalid path
      if (
        typeof params.data.img === 'string' &&
        (params.data.img.includes('placeholder') ||
          params.data.img.includes('example') ||
          params.data.img.includes('path/to/') ||
          params.data.img.includes('custom-assets'))
      ) {
        throw new Error(
          'WORKFLOW VIOLATION: Invalid image path detected. You MUST use list_images tool to find real, existing image paths from FoundryVTT directories.'
        );
      }

      game.simulacrum?.logger?.debug(
        `CreateDocumentTool executing with documentType: ${params.documentType}, data:`,
        params.data
      );

      const result = await this.crudService.createDocument(
        params.documentType,
        params.data
      );

      // Reset workflow enforcer after successful creation
      if (workflowEnforcer) {
        workflowEnforcer.reset();
      }

      return result;
    } catch (error) {
      game.simulacrum?.logger?.error(
        'crudService.createDocument() failed:',
        error
      );
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
