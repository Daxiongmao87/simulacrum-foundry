
/**
 * @file DocumentDiscoveryEngine
 * @module simulacrum/core/document-discovery-engine
 * @description Discovers available FoundryVTT document types.
 */

/**
 * A class to discover and normalize available FoundryVTT document types.
 * It inspects `game.collections` and `CONFIG` to find all creatable document types,
 * including main collections and their subtypes.
 */
export class DocumentDiscoveryEngine {

  /**
   * A list of FoundryVTT document collections that are typically user-creatable
   * and appear in the sidebar with a "Create" button.
   * System/internal document types (e.g., Combat, FogExploration, ChatMessage) are excluded.
   * @type {string[]}
   */
  static USER_CREATABLE_COLLECTIONS = [
    'Actor',
    'Item',
    'Scene',
    'JournalEntry',
    'Macro',
    'RollTable',
    'Playlist',
    'Cards',
    'Folder'
  ];

  /**
   * Discovers all available user-creatable document types in FoundryVTT.
   * This method inspects `game.collections` for direct document collections
   * and `CONFIG` for document types with `typeLabels` (subtypes),
   * filtering them based on `USER_CREATABLE_COLLECTIONS`.
   * @returns {Promise<Object.<string, {collection: string, subtype?: string, label?: string, isCollection?: boolean}>>} A map of document type keys to their normalized information.
   */
  async getAvailableTypes() {
    const types = {};

    // Check direct collections (e.g., Actor, Item, Scene, JournalEntry)
    for (const [name, collection] of game.collections.entries()) {
      if (DocumentDiscoveryEngine.USER_CREATABLE_COLLECTIONS.includes(name)) {
        types[name] = { collection: name, isCollection: true };
      }
    }

    // Check subtypes via CONFIG (e.g., Actor types like "character", "npc"; Item types like "weapon", "spell")
    for (const [docType, config] of Object.entries(window.CONFIG)) {
      if (config?.typeLabels && DocumentDiscoveryEngine.USER_CREATABLE_COLLECTIONS.includes(docType)) {
        for (const [subtype, label] of Object.entries(config.typeLabels)) {
          if (docType === 'Folder') {
            types[subtype] = { collection: subtype, label: label };
          } else {
            types[subtype] = { collection: docType, subtype: subtype, label: label };
          }
        }
      }
    }

    return types;
  }

  /**
   * Normalizes a given document type string to its full collection and subtype information.
   * This is useful for ensuring that operations are performed on the correct FoundryVTT document class.
   * @param {string} documentType The document type string (e.g., "Actor", "character", "Item", "weapon").
   * @returns {Promise<{collection: string, subtype?: string, label?: string}>} The normalized document type information.
   * @throws {Error} If the document type is not found or is ambiguous.
   */
  async normalizeDocumentType(documentType) {
    const availableTypes = await this.getAvailableTypes();
    const normalized = availableTypes[documentType];

    if (!normalized) {
      throw new Error(`Simulacrum | Document type "${documentType}" not found or is not creatable.`);
    }

    return normalized;
  }

  /**
   * Alias for getAvailableTypes for backward compatibility or alternative naming.
   * @returns {Promise<Object.<string, {collection: string, subtype?: string, label?: string, isCollection?: boolean}>>} A map of document type keys to their normalized information.
   */
  async discoverDocumentTypes() {
    return this.getAvailableTypes();
  }

  /**
   * Returns a filtered list of user-creatable document types suitable for AI creation.
   * This method is an alias for `getAvailableTypes` as it already applies the necessary filtering.
   * @returns {Promise<Object.<string, {collection: string, subtype?: string, label?: string, isCollection?: boolean}>>} A map of document type keys to their normalized information.
   */
  async getCreatableDocumentTypes() {
    return this.getAvailableTypes();
  }

  /**
   * Gets all user-creatable document collection names.
   * @returns {string[]} Array of document type names (e.g., ['Actor', 'Item', 'Scene'])
   */
  getAllDocumentTypes() {
    return DocumentDiscoveryEngine.USER_CREATABLE_COLLECTIONS.filter(collectionName => {
      return game.collections.has(collectionName);
    });
  }
}
