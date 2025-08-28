// FoundrySchemaExtractor
// Extracts FoundryVTT document schemas for AI retry mechanisms.
// This file provides a foundation for schema extraction.

import { DocumentDiscoveryEngine } from './document-discovery-engine.js';

/**
 * Class responsible for extracting JSON schemas from FoundryVTT document definitions.
 */
export class FoundrySchemaExtractor {
  /**
   * Returns a JSON schema for the specified document type.
   * @param {string} documentType - The document type string (dynamically discovered from current FoundryVTT system).
   * @returns {Promise<Object|null>} A JSON schema object representing the document structure, or null if extraction fails.
   */
  static async getDocumentSchema(documentType) {
    try {
      const engine = new DocumentDiscoveryEngine();
      const normalized = await engine.normalizeDocumentType(documentType);
      const collectionName = normalized.collection;
      const DocumentClass = CONFIG[collectionName]?.documentClass;
      if (!DocumentClass) {
        return null;
      }

      let schemaObj;
      if (typeof DocumentClass.defineSchema === 'function') {
        schemaObj = DocumentClass.defineSchema();
      } else if (DocumentClass.schema) {
        schemaObj = DocumentClass.schema;
      }
      if (!schemaObj) {
        return null;
      }

      return this.convertFoundrySchemaToJSONSchema(schemaObj);
    } catch (e) {
      game.simulacrum?.logger?.warn(
        `Schema extraction failed for ${documentType}:`,
        e
      );
      return null;
    }
  }

  /**
   * Just return the FoundryVTT schema as-is.
   * @param {Object} foundrySchema - The schema returned by defineSchema() or the schema property.
   * @returns {Object} The original FoundryVTT schema.
   */
  static convertFoundrySchemaToJSONSchema(foundrySchema) {
    return foundrySchema;
  }
}
