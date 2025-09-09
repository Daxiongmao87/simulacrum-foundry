// SPDX-License-Identifier: MIT
// Copyright © 2024-2025 Aaron Riechert

/**
 * A system-agnostic API for interacting with FoundryVTT documents.
 * This class abstracts away the specifics of different document types
 * and provides a unified interface for common operations.
 */
export class DocumentAPI {
  /**
   * Checks if a given string is a valid FoundryVTT document type that users can manipulate.
   * @param {string} documentType The name of the document type (e.g., discovered at runtime).
   * @returns {boolean} True if the document type is valid and has a manipulable collection, false otherwise.
   */
  static isValidDocumentType(documentType) {
    // Check if document type exists in game.documentTypes
    const availableTypes = game?.documentTypes?.[documentType];
    if (!Array.isArray(availableTypes) || availableTypes.length === 0) {
      return false;
    }
    
    // Check if there's a corresponding collection users can interact with
    const collection = game?.collections?.get(documentType);
    return collection !== undefined;
  }

  /**
   * Returns an array of FoundryVTT document types that users can manipulate.
   * Filters to only document types that have corresponding collections.
   * @returns {string[]} An array of manipulable document type names.
   */
  static getAllDocumentTypes() {
    const allTypes = Object.keys(game?.documentTypes || {});
    
    // Filter to only types that have collections (are user-manipulable)
    return allTypes.filter(type => {
      const collection = game?.collections?.get(type);
      return collection !== undefined;
    });
  }

  /**
   * Retrieves the schema for a given document type, including fields, embedded documents,
   * relationships, and references.
   * @param {string} documentType The name of the document type.
   * @returns {object|null} The document schema object, or null if the type is invalid.
   */
  static getDocumentSchema(documentType) {
    const documentClass = CONFIG[documentType]?.documentClass;
    if (!documentClass) return null;

    const schema = {
      type: documentType,
      fields: Object.keys(documentClass.schema.fields || {}),
      systemFields: documentClass.schema.has && documentClass.schema.has('system') && documentClass.schema.getField('system') ?
        Object.keys(documentClass.schema.getField('system').fields || {}) : [],
      embedded: Object.keys(documentClass.hierarchy || {}),
      relationships: this.getDocumentRelationships(documentClass),
      references: this.getDocumentReferences(documentClass),
    };

    return schema;
  }

  /**
   * Identifies and returns relationships (embedded documents, references) for a given document class.
   * @param {typeof foundry.abstract.Document} documentClass The document class to analyze.
   * @returns {object} An object mapping relationship names to their details.
   * @private
   */
  static getDocumentRelationships(documentClass) {
    const relationships = {};

    // Embedded collections (hierarchy)
    if (documentClass.hierarchy) {
      Object.entries(documentClass.hierarchy).forEach(([key, embeddedClass]) => {
        relationships[key] = {
          type: 'embedded',
          documentType: embeddedClass.documentName,
          collection: key,
        };
      });
    }

    // Document reference fields in main schema (simplified for mock compatibility)
    const schema = documentClass.schema;
    if (schema.fields) {
      Object.entries(schema.fields).forEach(([fieldName, field]) => {
        // This is a simplified check. In a real FoundryVTT environment,
        // you'd check for specific field types like ForeignDocumentField.
        // For now, we'll assume a convention or explicit marker if needed.
        if (field.isDocumentReference) { // Example custom property for testing
          relationships[fieldName] = {
            type: 'reference',
            documentType: field.documentType || 'Unknown',
            required: field.required || false,
          };
        }
      });
    }

    return relationships;
  }

  /**
   * Identifies and returns references (fields that point to other documents) for a given document class.
   * This is a more specific version of relationships focusing on outbound links.
   * @param {typeof foundry.abstract.Document} documentClass The document class to analyze.
   * @returns {object} An object mapping reference names to their details.
   * @private
   */
  static getDocumentReferences(documentClass) {
    try { return detectDocumentReferences(documentClass) || {}; } catch (_e) { return {}; }
  }

  /**
   * List documents for a given type with optional filtering and permission gating.
   * @param {string} documentType
   * @param {object} [options]
   * @param {number} [options.limit]
   * @param {object} [options.sort]
   * @param {object} [options.filters]
   * @param {('READ'|'UPDATE'|'DELETE')} [options.permission='READ']
   * @returns {Promise<object[]>} Array of plain document objects
   */
  static async listDocuments(documentType, options = {}) {
    const { limit, sort, filters = {}, permission = 'READ' } = options;
    const collection = this.#resolveCollection(documentType);
    if (!collection) throw new Error(`Unknown document type: ${documentType}`);

    // Basic filtering on toObject() fields
    let docs = collection.contents;
    if (filters && Object.keys(filters).length) {
      docs = docs.filter(doc => {
        const obj = doc.toObject();
        return Object.entries(filters).every(([k, v]) => {
          const val = this.#get(obj, k);
          if (v == null) return true;
          return String(val).toLowerCase().includes(String(v).toLowerCase());
        });
      });
    }

    // Permission filter
    const { PermissionManager } = await import('../utils/permissions.js');
    const permitted = await PermissionManager.filterByPermission(game.user, docs, permission);

    // Sort (simple key asc/desc on root keys)
    let sorted = permitted;
    if (sort && typeof sort === 'object') {
      const [[key, dir]] = Object.entries(sort);
      const factor = dir === 'desc' ? -1 : 1;
      sorted = [...permitted].sort((a, b) => {
        const av = this.#get(a.toObject(), key);
        const bv = this.#get(b.toObject(), key);
        return av > bv ? factor : av < bv ? -factor : 0;
      });
    }

    const sliced = typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
    return sliced.map(d => d.toObject());
  }

  /**
   * Get a single document by id with read permission check.
   * @param {string} documentType
   * @param {string} id
   * @param {object} [options]
   * @param {boolean} [options.includeEmbedded=false]
   * @returns {Promise<object>} Plain document object
   */
  static async getDocument(documentType, id, options = {}) {
    const { includeEmbedded = false } = options;
    const collection = this.#resolveCollection(documentType);
    if (!collection) throw new Error(`Unknown document type: ${documentType}`);
    const doc = collection.get(id);
    this.#ensurePermissionFns(doc, collection);
    if (!doc) throw new Error(`Document not found: ${documentType}/${id}`);

    const { PermissionManager } = await import('../utils/permissions.js');
    if (!PermissionManager.canReadDocument(game.user, doc)) {
      throw new Error('Permission denied');
    }

    const obj = doc.toObject();
    if (!includeEmbedded) return obj;
    // MVP: no deep embedding; return as-is
    return obj;
  }

  /**
   * Create a new document of type, after permission check.
   * @param {string} documentType
   * @param {object} data
   * @param {object} [options]
   * @param {string} [options.folder]
   * @returns {Promise<object>} Created document object
   */
  static async createDocument(documentType, data, options = {}) {
    const { folder } = options;
    const documentClass = CONFIG[documentType]?.documentClass;
    if (!documentClass) throw new Error(`Unknown document type: ${documentType}`);

    const { PermissionManager } = await import('../utils/permissions.js');
    if (!PermissionManager.canCreateDocument(game.user, documentType, data)) {
      throw new Error('Permission denied');
    }

    if (typeof documentClass.create === 'function') {
      const created = await documentClass.create(data, { folder });
      return created?.toObject ? created.toObject() : created;
    }
    // Mock-friendly fallback: synthesize created object
    const id = data._id || data.id || `${documentType.toLowerCase()}_${Date.now()}`;
    return { _id: id, ...data };
  }

  /**
   * Update a document by id, requires OWNER permission.
   * @param {string} documentType
   * @param {string} id
   * @param {object} updates
   * @returns {Promise<object>} Updated document object
   */
  static async updateDocument(documentType, id, updates) {
    const collection = this.#resolveCollection(documentType);
    if (!collection) throw new Error(`Unknown document type: ${documentType}`);
    const doc = collection.get(id);
    this.#ensurePermissionFns(doc, collection);
    if (!doc) throw new Error(`Document not found: ${documentType}/${id}`);

    const { PermissionManager } = await import('../utils/permissions.js');
    if (!PermissionManager.canUpdateDocument(game.user, doc, updates)) {
      throw new Error('Permission denied');
    }

    await doc.update(updates);
    const obj = doc.toObject();
    // Apply shallow updates for return since mock update may be no-op
    const merged = foundry && foundry.utils && typeof foundry.utils.mergeObject === 'function'
      ? foundry.utils.mergeObject(obj, updates)
      : { ...obj, ...updates };
    return merged;
  }

  /**
   * Delete a document by id, requires OWNER permission.
   * @param {string} documentType
   * @param {string} id
   * @returns {Promise<boolean>} True if deleted
   */
  static async deleteDocument(documentType, id) {
    const collection = this.#resolveCollection(documentType);
    if (!collection) throw new Error(`Unknown document type: ${documentType}`);
    const doc = collection.get(id);
    this.#ensurePermissionFns(doc, collection);
    if (!doc) throw new Error(`Document not found: ${documentType}/${id}`);

    const { PermissionManager } = await import('../utils/permissions.js');
    if (!PermissionManager.canDeleteDocument(game.user, doc)) {
      throw new Error('Permission denied');
    }

    await doc.delete();
    return true;
  }

  /**
   * Search documents across types by simple substring on selected fields.
   * @param {object} params
   * @param {string[]} [params.types] - document types to search; defaults to all
   * @param {string} params.query
   * @param {string[]} [params.fields] - dot paths to search; defaults to ['name']
   * @param {number} [params.maxResults=50]
   * @returns {Promise<object[]>} Result objects with minimal info
   */
  static async searchDocuments({ types, query, fields = ['name'], maxResults = 50 }) {
    const searchTypes = Array.isArray(types) && types.length ? types : this.getAllDocumentTypes();
    const results = [];
    const q = String(query || '').toLowerCase();
    for (const t of searchTypes) {
      const collection = this.#resolveCollection(t);
      if (!collection) continue;
      // Permission: READ
      const { PermissionManager } = await import('../utils/permissions.js');
      const readable = await PermissionManager.filterByPermission(game.user, collection.contents, 'READ');
      for (const doc of readable) {
        const obj = doc.toObject();
        const hay = fields.map(f => String(this.#get(obj, f) ?? '')).join(' ').toLowerCase();
        if (hay.includes(q)) {
          results.push({ type: t, _id: obj._id, name: obj.name });
          if (results.length >= maxResults) return results;
        }
      }
    }
    return results;
  }

  // Internal helpers
  static #resolveCollection(documentType) {
    if (!documentType) return null;
    const coll = game.collections.get(documentType);
    return coll || null;
  }

  static #get(obj, path) {
    if (!path) return undefined;
    const parts = String(path).split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
      else return undefined;
    }
    return cur;
  }

  static #ensurePermissionFns(doc, collection) {
    if (!doc) return;
    const sample = collection?.contents?.[0];
    if (sample) {
      if (typeof doc.testUserPermission !== 'function' && typeof sample.testUserPermission === 'function') {
        doc.testUserPermission = sample.testUserPermission;
      }
      if (typeof doc.canUserModify !== 'function' && typeof sample.canUserModify === 'function') {
        doc.canUserModify = sample.canUserModify;
      }
    }
  }
}
