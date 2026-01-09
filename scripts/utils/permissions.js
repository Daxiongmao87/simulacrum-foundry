// SPDX-License-Identifier: MIT
// Copyright © 2024-2025 Aaron Riechert

import { createLogger } from './logger.js';

/**
 * Manages permissions for various document operations within FoundryVTT.
 * This class provides a centralized way to check if a user has the necessary
 * rights to perform actions on documents, respecting FoundryVTT's permission system.
 */
export class PermissionManager {
  /**
   * Checks if a user can list documents of a specific type.
   * This is a simplified check; actual listing permissions might depend on
   * specific document configurations or module settings.
   * @param {User} user The user performing the action.
   * @param {string} documentType The type of document to list.
   * @returns {boolean} True if the user can list, false otherwise.
   */
  // eslint-disable-next-line complexity
  static canListDocuments(user, documentType) {
    // Validate document type exists in current system and has a manipulable collection
    if (documentType) {
      const availableTypes = game?.documentTypes?.[documentType];
      const hasCollection = game?.collections?.get(documentType) !== undefined;
      if (!Array.isArray(availableTypes) || availableTypes.length === 0 || !hasCollection) {
        return false;
      }
    }

    // GMs can always list documents.
    if (user.isGM) return true;

    // For players and observers, we assume they can list if they have at least a certain role
    // or if the document type is generally viewable. This might need refinement
    // based on specific module requirements or FoundryVTT system settings.
    // Players and observers can generally see document lists
    // Prefer Foundry constants if available
    const ROLES = (globalThis.CONST && globalThis.CONST.USER_ROLES) || {};
    if (typeof user.hasRole === 'function') {
      if (typeof ROLES.PLAYER !== 'undefined') {
        // Try numeric roles (Foundry runtime) or fallback to string labels (tests/mocks)
        return (
          user.hasRole(ROLES.PLAYER) ||
          user.hasRole(ROLES.OBSERVER) ||
          user.hasRole('PLAYER') ||
          user.hasRole('OBSERVER')
        );
      }
    }
    // Fallback
    return false;
  }

  /**
   * Checks if a user can read a specific document.
   * @param {User} user The user performing the action.
   * @param {Document} document The document to read.
   * @returns {boolean} True if the user can read, false otherwise.
   */
  static canReadDocument(user, document) {
    // Use FoundryVTT's native permission check for a document.
    // The 'LIMITED' permission level allows read access.
    return document.testUserPermission(user, 'LIMITED');
  }

  /**
   * Checks if a user can create a document of a specific type.
   * @param {User} user The user performing the action.
   * @param {string} documentType The type of document to create.
   * @param {object} data The data for the new document.
   * @returns {boolean} True if the user can create, false otherwise.
   */
  static canCreateDocument(user) {
    // GMs can always create documents.
    if (user.isGM) return true;

    // For players, creation is usually restricted unless specific permissions are granted.
    // Check if user has general creation permission using the user.can method
    // This will respect mock permission configurations in testing environments
    return (user.can && user.can('create')) || false;
  }

  /**
   * Checks if a user can update a specific document.
   * @param {User} user The user performing the action.
   * @param {Document} document The document to update.
   * @param {object} updates The updates to apply to the document.
   * @returns {boolean} True if the user can update, false otherwise.
   */
  static canUpdateDocument(user, document) {
    // Use FoundryVTT's native permission check for a document.
    // The 'OWNER' permission level typically implies update access.
    return document.testUserPermission(user, 'OWNER');
  }

  /**
   * Checks if a user can delete a specific document.
   * @param {User} user The user performing the action.
   * @param {Document} document The document to delete.
   * @returns {boolean} True if the user can delete, false otherwise.
   */
  static canDeleteDocument(user, document) {
    // Use FoundryVTT's native permission check for a document.
    // The 'OWNER' permission level typically implies delete access.
    return document.testUserPermission(user, 'OWNER');
  }

  /**
   * Filters a list of documents based on a user's permission for a specific operation.
   * @param {User} user The user for whom to filter documents.
   * @param {Document[]} documents An array of documents to filter.
   * @param {string} operation The operation to check permission for (e.g., 'READ', 'UPDATE').
   * @returns {Promise<Document[]>} A promise that resolves to an array of documents the user has permission for.
   */
  static async filterByPermission(user, documents, operation) {
    const permittedDocuments = [];
    for (const document of documents) {
      let hasPermission = false;
      try {
        switch (operation) {
          case 'READ':
            hasPermission = this.canReadDocument(user, document);
            break;
          case 'UPDATE':
            hasPermission = this.canUpdateDocument(user, document);
            break;
          case 'DELETE':
            hasPermission = this.canDeleteDocument(user, document);
            break;
          // Add other operations as needed
          default: {
            const logger = createLogger('PermissionManager');
            logger.warn(`Unknown permission operation: ${operation}`);
            hasPermission = false;
            break;
          }
        }
        if (hasPermission) {
          permittedDocuments.push(document);
        }
      } catch (error) {
        // Log the error but continue processing other documents
        const logger = createLogger('PermissionManager');
        logger.warn(`Error checking permission for document ${document._id || 'unknown'}:`, error);
        // Document is excluded from results when permission check fails
      }
    }
    return permittedDocuments;
  }
}
