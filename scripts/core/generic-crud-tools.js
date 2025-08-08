
/**
 * @file GenericCRUDTools
 * @module simulacrum/core/generic-crud-tools
 * @description Provides generic CRUD (Create, Read, Update, Delete) operations for FoundryVTT documents.
 */

import { DocumentDiscoveryEngine } from './document-discovery-engine.js';
import { ValidationErrorRecovery } from '../tools/validation-error-recovery.js';

/**
 * A class providing generic CRUD operations for FoundryVTT documents.
 * It leverages the DocumentDiscoveryEngine to normalize document types
 * and interacts directly with FoundryVTT's API for document manipulation.
 */
export class GenericCRUDTools {
  /**
   * @param {DocumentDiscoveryEngine} discoveryEngine An instance of DocumentDiscoveryEngine.
   */
  constructor(discoveryEngine, aiService = null) {
    if (!discoveryEngine || !(discoveryEngine instanceof DocumentDiscoveryEngine)) {
      throw new Error("Simulacrum | GenericCRUDTools requires an instance of DocumentDiscoveryEngine.");
    }
    this.discoveryEngine = discoveryEngine;
    this.aiService = aiService;
    this.validationErrorRecovery = aiService ? new ValidationErrorRecovery(aiService) : null;
  }

  /**
   * Creates a new FoundryVTT document of a specified type.
   * @param {string} documentType The type of document to create (e.g., "Actor", "character", "Item", "weapon").
   * @param {object} data The data to initialize the new document with.
   * @returns {Promise<Document>} The created document instance.
   * @throws {Error} If the document creation fails or the type is invalid.
   */
  async createDocument(documentType, data) {
    try {
      const { collection, subtype } = await this.discoveryEngine.normalizeDocumentType(documentType);

      if (subtype) {
        data.type = subtype;
      }

      const DocumentClass = CONFIG[collection]?.documentClass;
      if (!DocumentClass) {
        throw new Error(`Simulacrum | No document class found for collection: ${collection}`);
      }

      const result = await DocumentClass.create(data);

      ui.notifications.info(`Simulacrum | Created ${collection}${subtype ? ` (${subtype})` : ''}: ${result.name}`);
      return result;
    } catch (error) {
      // Attempt AI retry if validation error and AI service available
      if (this.isValidationError(error) && this.validationErrorRecovery) {
        try {
          console.log(`Simulacrum | Attempting AI retry for validation error: ${error.message}`);
          const correctionPrompt = await this.validationErrorRecovery.buildValidationErrorPrompt(
            error.message, 
            data, 
            documentType
          );
          
          // Note: This would need proper integration with the AI service flow
          // For now, we'll log the correction prompt and still throw the original error
          console.log(`Simulacrum | AI correction prompt:`, correctionPrompt);
          ui.notifications.warn(`Simulacrum | Validation error detected - AI retry mechanism ready but not fully integrated`);
        } catch (retryError) {
          console.warn(`Simulacrum | AI retry failed:`, retryError);
        }
      }
      
      ui.notifications.error(`Simulacrum | Failed to create ${documentType}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reads a FoundryVTT document by its ID and type.
   * @param {string} documentType The type of document to read (e.g., "Actor", "Item", "Scene").
   * @param {string} documentId The ID of the document to retrieve.
   * @returns {Promise<Document>} The retrieved document instance.
   * @throws {Error} If the document is not found or the type is invalid.
   */
  async readDocument(documentType, documentId) {
    try {
      const { collection } = await this.discoveryEngine.normalizeDocumentType(documentType);

      const collectionInstance = game.collections.get(collection);
      if (!collectionInstance) {
        throw new Error(`Simulacrum | No collection found for type: ${collection}`);
      }

      const document = collectionInstance.get(documentId);
      if (!document) {
        throw new Error(`Simulacrum | ${documentType} with ID ${documentId} not found.`);
      }

      ui.notifications.info(`Simulacrum | Read ${documentType}: ${document.name}`);
      return document;
    } catch (error) {
      ui.notifications.error(`Simulacrum | Failed to read ${documentType} with ID ${documentId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Updates an existing FoundryVTT document.
   * @param {string} documentType The type of document to update.
   * @param {string} documentId The ID of the document to update.
   * @param {object} updates The data to update the document with.
   * @returns {Promise<Document>} The updated document instance.
   * @throws {Error} If the document update fails or the type/ID is invalid.
   */
  async updateDocument(documentType, documentId, updates) {
    try {
      const document = await this.readDocument(documentType, documentId);
      const result = await document.update(updates);

      ui.notifications.info(`Simulacrum | Updated ${documentType}: ${document.name}`);
      return result;
    } catch (error) {
      // Attempt AI retry if validation error and AI service available
      if (this.isValidationError(error) && this.validationErrorRecovery) {
        try {
          console.log(`Simulacrum | Attempting AI retry for validation error: ${error.message}`);
          const correctionPrompt = await this.validationErrorRecovery.buildValidationErrorPrompt(
            error.message, 
            updates, 
            documentType
          );
          
          // Note: This would need proper integration with the AI service flow
          // For now, we'll log the correction prompt and still throw the original error
          console.log(`Simulacrum | AI correction prompt:`, correctionPrompt);
          ui.notifications.warn(`Simulacrum | Validation error detected - AI retry mechanism ready but not fully integrated`);
        } catch (retryError) {
          console.warn(`Simulacrum | AI retry failed:`, retryError);
        }
      }
      
      ui.notifications.error(`Simulacrum | Failed to update ${documentType} with ID ${documentId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deletes a FoundryVTT document.
   * @param {string} documentType The type of document to delete.
   * @param {string} documentId The ID of the document to delete.
   * @returns {Promise<Document>} The deleted document instance.
   * @throws {Error} If the document deletion fails or the type/ID is invalid.
   */
  async deleteDocument(documentType, documentId) {
    try {
      const document = await this.readDocument(documentType, documentId);
      const documentName = document.name; // Store name before deletion
      const result = await document.delete();

      ui.notifications.info(`Simulacrum | Deleted ${documentType}: ${documentName}`);
      return result;
    } catch (error) {
      ui.notifications.error(`Simulacrum | Failed to delete ${documentType} with ID ${documentId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Determines if an error is a FoundryVTT validation error.
   * @param {Error} error The error to check.
   * @returns {boolean} True if this appears to be a validation error.
   */
  isValidationError(error) {
    if (!error || !error.message) return false;
    
    const errorMessage = error.message.toLowerCase();
    
    // Check for common FoundryVTT validation error patterns
    return errorMessage.includes('validation') ||
           errorMessage.includes('failed to create') ||
           errorMessage.includes('failed to update') ||
           errorMessage.includes('invalid') ||
           errorMessage.includes('required') ||
           errorMessage.includes('must be') ||
           errorMessage.includes('should be') ||
           errorMessage.includes('type error') ||
           errorMessage.includes('schema') ||
           // FoundryVTT specific validation error patterns
           errorMessage.includes('cannot read properties of undefined') ||
           errorMessage.includes('may not be undefined') ||
           errorMessage.includes('validation errors:') ||
           errorMessage.includes('datamodelvalidationfailure');
  }
}
