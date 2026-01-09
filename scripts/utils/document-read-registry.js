/**
 * Document Read Registry
 * Tracks which documents have been read by the AI to enforce "read before modify" rule.
 * Uses hash comparison to detect stale reads (document changed since last read).
 */

import { createLogger } from './logger.js';

const logger = createLogger('DocumentReadRegistry');

/**
 * Simple djb2 hash function for strings
 * @param {string} str - String to hash
 * @returns {string} Hex hash
 */
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  // Convert to unsigned 32-bit and then to hex
  return (hash >>> 0).toString(16);
}

/**
 * Registry that tracks document reads and validates modifications
 */
class DocumentReadRegistry {
  constructor() {
    /** @type {Map<string, {hash: string, timestamp: number}>} */
    this._registry = new Map();
  }

  /**
   * Generate a unique key for a document
   * @param {string} documentType - Document type (Actor, Item, etc.)
   * @param {string} documentId - Document ID
   * @returns {string} Composite key
   */
  _key(documentType, documentId) {
    return `${documentType}:${documentId}`;
  }

  /**
   * Compute hash from document data
   * @param {Object} documentData - Document data object
   * @returns {string} Hash of the document
   */
  _computeHash(documentData) {
    const json = JSON.stringify(documentData);
    return hashString(json);
  }

  /**
   * Register that a document has been read
   * @param {string} documentType - Document type
   * @param {string} documentId - Document ID
   * @param {Object} documentData - Document data at time of read
   * @returns {string} The computed hash
   */
  registerRead(documentType, documentId, documentData) {
    const key = this._key(documentType, documentId);
    const hash = this._computeHash(documentData);
    this._registry.set(key, { hash, timestamp: Date.now() });
    logger.debug(`Registered read: ${key} (hash: ${hash})`);
    return hash;
  }

  /**
   * Check if a document has been read
   * @param {string} documentType - Document type
   * @param {string} documentId - Document ID
   * @returns {boolean} True if document has been read
   */
  hasBeenRead(documentType, documentId) {
    return this._registry.has(this._key(documentType, documentId));
  }

  /**
   * Get the stored hash for a document
   * @param {string} documentType - Document type
   * @param {string} documentId - Document ID
   * @returns {string|null} Stored hash or null if not read
   */
  getStoredHash(documentType, documentId) {
    const entry = this._registry.get(this._key(documentType, documentId));
    return entry?.hash || null;
  }

  /**
   * Validate that a document can be modified
   * Throws an error if:
   * - Document has never been read
   * - Document has changed since it was read (stale read)
   *
   * @param {string} documentType - Document type
   * @param {string} documentId - Document ID
   * @param {Object} currentData - Current document data to compare against stored hash
   * @throws {Error} If modification should be rejected
   */
  requireReadForModification(documentType, documentId, currentData) {
    const key = this._key(documentType, documentId);
    const entry = this._registry.get(key);

    if (!entry) {
      const error = new Error(
        `REJECTED: Document ${key} has not been read. ` +
          `You MUST use document_read to inspect a document before modifying it.`
      );
      error.code = 'DOCUMENT_NOT_READ';
      error.documentType = documentType;
      error.documentId = documentId;
      logger.warn(`Modification rejected - not read: ${key}`);
      throw error;
    }

    // Check if document has changed since we read it
    if (currentData !== null && currentData !== undefined) {
      const currentHash = this._computeHash(currentData);
      if (currentHash !== entry.hash) {
        const error = new Error(
          `REJECTED: Document ${key} has changed since you last read it. ` +
            `Please use document_read to get the current state before modifying.`
        );
        error.code = 'DOCUMENT_STALE';
        error.documentType = documentType;
        error.documentId = documentId;
        error.storedHash = entry.hash;
        error.currentHash = currentHash;
        logger.warn(
          `Modification rejected - stale read: ${key} (stored: ${entry.hash}, current: ${currentHash})`
        );
        throw error;
      }
    }

    logger.debug(`Modification allowed: ${key}`);
  }

  /**
   * Clear all registered reads
   * Should be called when conversation is cleared
   */
  clear() {
    const count = this._registry.size;
    this._registry.clear();
    logger.debug(`Registry cleared (${count} entries removed)`);
  }

  /**
   * Get the number of registered reads
   * @returns {number} Number of documents in registry
   */
  get size() {
    return this._registry.size;
  }

  /**
   * Remove a specific document from the registry
   * Useful after deletion
   * @param {string} documentType - Document type
   * @param {string} documentId - Document ID
   */
  unregister(documentType, documentId) {
    const key = this._key(documentType, documentId);
    this._registry.delete(key);
    logger.debug(`Unregistered: ${key}`);
  }
}

// Export singleton instance
export const documentReadRegistry = new DocumentReadRegistry();

// Also export class for testing
export { DocumentReadRegistry };
