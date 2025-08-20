/**
 * DocumentDiscovery
 *
 * Provides dynamic discovery of FoundryVTT document types and collections.
 * Works across all game systems without hardcoding document types.
 *
 * @module scripts/document-discovery
 */

/**
 * Normalizes a document type string to the format used by FoundryVTT.
 *
 * Examples:
 *   'weapon' -> 'Weapon'
 *   'journalentry' -> 'JournalEntry'
 *   'roll-table' -> 'RollTable'
 *
 * @param {string} type - The user supplied document type.
 * @returns {string} Normalized type.
 */
export function normalizeDocumentType(type) {
  if (!type) {
    return '';
  }
  // Split on hyphen or underscore, capitalize each part, join
  return type
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Finds the collection that holds documents of the given type.
 * If the type is a direct collection name (e.g., 'Actor', 'Item'),
 * the corresponding collection is returned.
 * If the type is a subtype (e.g., 'weapon'), the Item or Actor
 * collection is returned along with the subtype to filter on.
 *
 * @param {string} type - The document type or subtype.
 * @returns {{collection: Collection, filterByType: string|null}} The collection and optional subtype filter.
 * @throws {Error} If no matching collection can be found.
 */
export function findCollection(type) {
  const normalized = normalizeDocumentType(type);
  const gameCollections = game?.collections;
  if (!gameCollections) {
    throw new Error('Foundry game collections are not available.');
  }

  let collection = gameCollections.get(normalized);
  let filterByType = null;

  if (!collection) {
    // Check if type is an Item subtype
    if (window?.CONFIG?.Item?.typeLabels?.[type]) {
      collection = gameCollections.get('Item');
      filterByType = type;
    } else if (window?.CONFIG?.Actor?.typeLabels?.[type]) {
      // Check if type is an Actor subtype
      collection = gameCollections.get('Actor');
      filterByType = type;
    } else {
      // Check other document types for subtypes
      for (const [docType, cfg] of Object.entries(window?.CONFIG || {})) {
        if (cfg?.typeLabels?.[type]) {
          collection = gameCollections.get(docType);
          filterByType = type;
          break;
        }
      }
    }
  }

  if (!collection) {
    throw new Error(
      `No collection found for document type "${type}" (normalized: ${normalized})`
    );
  }

  return { collection, filterByType };
}

/**
 * Validates that a document type exists in the current system.
 *
 * @param {string} type - The document type or subtype.
 * @returns {boolean} True if the type is valid.
 * @throws {Error} If the type is invalid.
 */
export function validateDocumentType(type) {
  try {
    findCollection(type);
    return true;
  } catch (e) {
    throw new Error(`Invalid document type: ${type}. ${e.message}`);
  }
}

/**
 * Lists all document types available in the current system.
 * Includes top‑level collections and all subtypes defined in CONFIG.
 *
 * @returns {string[]} Array of document type strings.
 */
export function listAvailableTypes() {
  const types = [];
  const gameCollections = game?.collections;
  if (!gameCollections) {
    return types;
  }

  // Top‑level collections
  for (const key of gameCollections.keys()) {
    types.push(key);
  }

  // Subtypes from CONFIG
  for (const [, cfg] of Object.entries(window?.CONFIG || {})) {
    if (cfg?.typeLabels) {
      for (const subtype of Object.keys(cfg.typeLabels)) {
        types.push(subtype);
      }
    }
  }

  // Remove duplicates and sort
  return Array.from(new Set(types)).sort();
}

// Export as default for convenience
export default {
  normalizeDocumentType,
  findCollection,
  validateDocumentType,
  listAvailableTypes,
};
