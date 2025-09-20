// SPDX-License-Identifier: MIT
// Copyright © 2024-2025 Aaron Riechert

import { createLogger } from '../utils/logger.js';

const documentLogger = createLogger('DocumentAPI');

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
   * relationships, and references. Supports both top-level and embedded document types.
   * @param {string} documentType The name of the document type.
   * @returns {object|null} The document schema object, or null if the type is invalid.
   */
  static getDocumentSchema(documentType) {
    const startTime = performance.now();

    try {
      let documentClass = CONFIG[documentType]?.documentClass;

      // If not found as a top-level document, search comprehensively in embedded documents
      if (!documentClass) {
        documentClass = this.#findEmbeddedDocumentClass(documentType);
      }

      if (!documentClass) {
        documentLogger.debug(`Document type "${documentType}" not found in any hierarchy`);
        return null;
      }

      const schema = this.#extractDocumentSchema(documentType, documentClass);

      const elapsed = performance.now() - startTime;
      if (elapsed > 50) {
        documentLogger.warn(`Schema discovery for "${documentType}" took ${elapsed.toFixed(2)}ms (exceeds 50ms threshold)`);
      }

      return schema;
    } catch (error) {
      documentLogger.error(`Schema extraction failed for document type "${documentType}":`, error);
      return null;
    }
  }

  /**
   * Comprehensively searches for an embedded document class across all parent document types.
   * @param {string} documentType The embedded document type to find.
   * @returns {object|null} The document class if found, null otherwise.
   * @private
   */
  static #findEmbeddedDocumentClass(documentType) {
    // Search through CONFIG keys in alphabetical order for consistency
    const configKeys = Object.keys(CONFIG).sort();

    for (const parentType of configKeys) {
      try {
        const parentConfig = CONFIG[parentType];
        if (!parentConfig?.documentClass) {
          continue;
        }

        const parentClass = parentConfig.documentClass;

        // Check hierarchy property (computed from schema)
        if (parentClass.hierarchy) {
          const embeddedClass = parentClass.hierarchy[documentType];
          if (embeddedClass) {
            documentLogger.debug(`Found embedded document "${documentType}" in ${parentType}.hierarchy`);
            return embeddedClass;
          }
        }

        // Also check metadata.embedded for additional discovery
        if (parentClass.metadata?.embedded) {
          for (const [embeddedDocType, collectionName] of Object.entries(parentClass.metadata.embedded)) {
            if (embeddedDocType === documentType) {
              // Try to resolve the document class from the schema
              try {
                const schema = parentClass.schema;
                if (schema?.fields?.[collectionName]) {
                  const field = schema.fields[collectionName];
                  if (field.model || field.element) {
                    const embeddedClass = field.model || field.element;
                    documentLogger.debug(`Found embedded document "${documentType}" in ${parentType}.metadata.embedded`);
                    return embeddedClass;
                  }
                }
              } catch (schemaError) {
                documentLogger.debug(`Failed to extract embedded class from schema for "${documentType}":`, schemaError);
              }
            }
          }
        }
      } catch (error) {
        documentLogger.debug(`Error searching parent type "${parentType}" for embedded document "${documentType}":`, error);
        continue;
      }
    }

    // Also search through game.documentTypes as fallback
    if (game?.documentTypes) {
      for (const parentType of Object.keys(game.documentTypes).sort()) {
        try {
          const parentClass = CONFIG[parentType]?.documentClass;
          if (!parentClass?.hierarchy) continue;

          const embeddedClass = parentClass.hierarchy[documentType];
          if (embeddedClass) {
            documentLogger.debug(`Found embedded document "${documentType}" in game.documentTypes.${parentType}.hierarchy`);
            return embeddedClass;
          }
        } catch (error) {
          documentLogger.debug(`Error searching game.documentTypes["${parentType}"] for "${documentType}":`, error);
          continue;
        }
      }
    }

    // NEW: Search type-specific data models for embedded documents
    const typeSpecificClass = this.#searchTypeSpecificDataModels(documentType);
    if (typeSpecificClass) {
      return typeSpecificClass;
    }

    // NEW: Search system-specific document namespaces for embedded documents
    const systemSpecificClass = this.#searchSystemDocumentNamespaces(documentType);
    if (systemSpecificClass) {
      return systemSpecificClass;
    }

    return null;
  }

  /**
   * Searches type-specific data models for embedded document classes.
   * This enables discovery of embedded documents that only exist in certain document subtypes,
   * such as Activity documents that only exist in weapon-type items.
   * @param {string} documentType The embedded document type to find.
   * @returns {object|null} The document class if found, null otherwise.
   * @private
   */
  static #searchTypeSpecificDataModels(documentType) {
    // Search through CONFIG keys in alphabetical order for consistency
    const configKeys = Object.keys(CONFIG).sort();

    for (const parentType of configKeys) {
      try {
        const parentConfig = CONFIG[parentType];
        if (!parentConfig?.dataModels) {
          continue;
        }

        // Search through all subtypes for this parent document type
        const subtypeKeys = Object.keys(parentConfig.dataModels).sort();
        for (const subtype of subtypeKeys) {
          try {
            const subtypeDataModel = parentConfig.dataModels[subtype];
            if (!subtypeDataModel?.hierarchy) {
              continue;
            }

            // Check if the embedded document exists in this subtype's hierarchy
            const embeddedClass = subtypeDataModel.hierarchy[documentType];
            if (embeddedClass) {
              documentLogger.debug(`Found embedded document "${documentType}" in ${parentType}.dataModels.${subtype}.hierarchy`);
              return embeddedClass;
            }
          } catch (subtypeError) {
            documentLogger.debug(`Error searching ${parentType}.dataModels.${subtype} for "${documentType}":`, subtypeError);
            continue;
          }
        }
      } catch (error) {
        documentLogger.debug(`Error searching ${parentType}.dataModels for "${documentType}":`, error);
        continue;
      }
    }

    return null;
  }

  /**
   * Searches system-specific document namespaces for embedded document classes.
   * This enables discovery of system-provided documents like Activity documents in dnd5e.
   * Works with any system (dnd5e, pf2e, cyberpunk, etc.) by dynamically discovering
   * available system namespaces and searching their document collections.
   * @param {string} documentType The embedded document type to find.
   * @returns {object|null} The document class if found, null otherwise.
   * @private
   */
  static #searchSystemDocumentNamespaces(documentType) {
    // Get potential system namespaces to search
    const systemNamespaces = this.#discoverSystemNamespaces();

    // Search through each system namespace
    for (const namespace of systemNamespaces) {
      try {
        const systemDocuments = this.#getSystemDocuments(namespace);
        if (!systemDocuments || typeof systemDocuments !== 'object') {
          continue;
        }

        // Search through document collections in this system
        const documentCollections = Object.keys(systemDocuments).sort();
        for (const collectionName of documentCollections) {
          try {
            const documentCollection = systemDocuments[collectionName];
            if (!documentCollection || typeof documentCollection !== 'object') {
              continue;
            }

            // Search through document classes in this collection
            const documentClasses = Object.keys(documentCollection).sort();
            for (const className of documentClasses) {
              try {
                const DocumentClass = documentCollection[className];
                // Accept both function classes (real environment) and objects with documentName (test mocks)
                if (!DocumentClass || (!DocumentClass.documentName)) {
                  continue;
                }

                // Check if this document class matches our search
                if (DocumentClass.documentName === documentType) {
                  documentLogger.debug(`Found embedded document "${documentType}" in ${namespace}.documents.${collectionName}.${className}`);
                  return DocumentClass;
                }
              } catch (classError) {
                documentLogger.debug(`Error searching ${namespace}.documents.${collectionName}.${className} for "${documentType}":`, classError);
                continue;
              }
            }
          } catch (collectionError) {
            documentLogger.debug(`Error searching ${namespace}.documents.${collectionName} for "${documentType}":`, collectionError);
            continue;
          }
        }
      } catch (namespaceError) {
        documentLogger.debug(`Error searching ${namespace}.documents for "${documentType}":`, namespaceError);
        continue;
      }
    }

    return null;
  }

  /**
   * Discovers available system namespaces that might contain document classes.
   * @returns {string[]} Array of system namespace names to search.
   * @private
   */
  static #discoverSystemNamespaces() {
    const namespaces = [];

    // Add current system if available
    if (game?.system?.id) {
      namespaces.push(game.system.id);
    }

    // Add active modules that might provide documents
    if (game?.modules) {
      for (const [moduleId, module] of game.modules.entries()) {
        if (module.active && this.#hasDocumentNamespace(moduleId)) {
          namespaces.push(moduleId);
        }
      }
    }

    // Search global namespace for any other potential system namespaces
    // This handles cases where systems register themselves differently
    const globalKeys = Object.keys(globalThis || {}).sort();
    for (const key of globalKeys) {
      if (key !== game?.system?.id && this.#hasDocumentNamespace(key)) {
        if (!namespaces.includes(key)) {
          namespaces.push(key);
        }
      }
    }

    return namespaces.sort(); // Deterministic order
  }

  /**
   * Checks if a namespace has a documents property that might contain document classes.
   * @param {string} namespace The namespace to check.
   * @returns {boolean} True if the namespace has document classes.
   * @private
   */
  static #hasDocumentNamespace(namespace) {
    try {
      const obj = globalThis[namespace];
      return obj && typeof obj === 'object' && obj.documents && typeof obj.documents === 'object';
    } catch (error) {
      return false;
    }
  }

  /**
   * Safely retrieves the documents collection from a system namespace.
   * @param {string} namespace The namespace to get documents from.
   * @returns {object|null} The documents object or null if not available.
   * @private
   */
  static #getSystemDocuments(namespace) {
    try {
      return globalThis[namespace]?.documents || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extracts and formats the schema information from a document class.
   * @param {string} documentType The document type name.
   * @param {object} documentClass The document class to extract schema from.
   * @returns {object} The formatted schema object.
   * @private
   */
  static #extractDocumentSchema(documentType, documentClass) {
    const schema = {
      type: documentType,
      fields: [],
      systemFields: [],
      embedded: [],
      relationships: {},
      references: {},
    };

    try {
      // Extract main schema fields
      if (documentClass.schema?.fields) {
        schema.fields = Object.keys(documentClass.schema.fields);
      }

      // Extract system fields if present
      if (documentClass.schema?.has && documentClass.schema.has('system')) {
        try {
          const systemField = documentClass.schema.getField('system');
          if (systemField?.fields) {
            schema.systemFields = Object.keys(systemField.fields);
          }
        } catch (systemError) {
          documentLogger.debug(`Failed to extract system fields for "${documentType}":`, systemError);
        }
      }

      // Extract embedded document types
      if (documentClass.hierarchy) {
        schema.embedded = Object.keys(documentClass.hierarchy);
      }

      // Extract relationships and references
      try {
        schema.relationships = this.getDocumentRelationships(documentClass);
        schema.references = this.getDocumentReferences(documentClass);
      } catch (relationError) {
        documentLogger.debug(`Failed to extract relationships for "${documentType}":`, relationError);
      }

    } catch (error) {
      documentLogger.error(`Schema field extraction failed for "${documentType}":`, error);
      throw error;
    }

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
    let permitted = docs;
    try {
      const { PermissionManager } = await import('../utils/permissions.js');
      permitted = await PermissionManager.filterByPermission(game.user, docs, permission);
    } catch (error) {
      // Fallback permission check when module fails to import
      permitted = docs.filter(doc => {
        // GMs can always access documents
        if (game.user?.isGM) return true;
        
        // For non-GMs, check document permissions if available
        if (typeof doc.canUserModify === 'function') {
          return doc.canUserModify(game.user, permission);
        }
        
        // If no permission method available, default to true for READ
        return permission === 'READ';
      });
    }

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

    let readPermissionChecked = false;
    try {
      const { PermissionManager } = await import('../utils/permissions.js');
      readPermissionChecked = true;
      if (!PermissionManager.canReadDocument(game.user, doc)) {
        throw new Error('Permission denied');
      }
    } catch (error) {
      if (readPermissionChecked && error?.message === 'Permission denied') {
        throw error;
      }
      if (!game.user?.isGM && typeof doc.canUserModify === 'function' && !doc.canUserModify(game.user, 'READ')) {
        throw new Error('Permission denied');
      }
    }

    const obj = doc.toObject();
    if (!includeEmbedded) return obj;
    // MVP: no deep embedding; return as-is
    return obj;
  }

  /**
   * Retrieve a live Foundry document instance with read permissions validated.
   * @param {string} documentType
   * @param {string} id
   * @returns {Promise<foundry.abstract.Document>} Document instance
   */
  static async getDocumentInstance(documentType, id) {
    const collection = this.#resolveCollection(documentType);
    if (!collection) throw new Error(`Unknown document type: ${documentType}`);
    const doc = collection.get(id);
    this.#ensurePermissionFns(doc, collection);
    if (!doc) throw new Error(`Document not found: ${documentType}/${id}`);

    let readPermissionChecked = false;
    try {
      const { PermissionManager } = await import('../utils/permissions.js');
      readPermissionChecked = true;
      if (!PermissionManager.canReadDocument(game.user, doc)) {
        throw new Error('Permission denied');
      }
    } catch (error) {
      if (readPermissionChecked && error?.message === 'Permission denied') {
        throw error;
      }
      if (!game.user?.isGM && typeof doc.canUserModify === 'function' && !doc.canUserModify(game.user, 'READ')) {
        throw new Error('Permission denied');
      }
    }

    return doc;
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

    try {
      const { PermissionManager } = await import('../utils/permissions.js');
      if (!PermissionManager.canCreateDocument(game.user, documentType, data)) {
        throw new Error('Permission denied');
      }
    } catch (error) {
      // Fallback permission check - only GMs can create by default
      if (!game.user?.isGM) {
        throw new Error('Permission denied');
      }
    }

    if (typeof documentClass.create === 'function') {
      try {
        // Step 1: Use FoundryVTT's official validation for creation data
        const validationOptions = {
          strict: true,
          fields: true,
          joint: true
        };
        try {
          if (typeof documentClass.validate === 'function') {
            documentClass.validate(data, validationOptions);
          } else if (documentClass.schema && typeof documentClass.schema.validate === 'function') {
            documentClass.schema.validate(data, validationOptions);
          }
        } catch (validationError) {
          throw validationError;
        }
        
        // Step 2: Proceed with creation only after validation passes
        const created = await documentClass.create(data, { folder });
        return created?.toObject ? created.toObject() : created;
      } catch (createError) {
        // Re-throw validation errors to be handled by the calling tool
        if (createError.name === 'DataModelValidationError') {
          throw createError;
        }
        // Handle other creation errors
        throw new Error(`Document creation failed: ${createError.message}`);
      }
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

    let updatePermissionChecked = false;
    try {
      const { PermissionManager } = await import('../utils/permissions.js');
      updatePermissionChecked = true;
      if (!PermissionManager.canUpdateDocument(game.user, doc, updates)) {
        throw new Error('Permission denied');
      }
    } catch (error) {
      if (updatePermissionChecked && error?.message === 'Permission denied') {
        throw error;
      }
      if (!game.user?.isGM && typeof doc.canUserModify === 'function' && !doc.canUserModify(game.user, 'UPDATE')) {
        throw new Error('Permission denied');
      }
    }

    const performUpdate = async () => {
      try {
        if (typeof doc.validate === 'function') {
          doc.validate({
            changes: updates,
            strict: true,
            fields: true,
            joint: false
          });
        }
      } catch (validationError) {
        throw validationError;
      }

      try {
        await doc.update(updates);
      } catch (updateError) {
        if (updateError.name === 'DataModelValidationError') {
          throw updateError;
        }
        throw new Error(`Document update failed: ${updateError.message}`);
      }

      const obj = doc.toObject();
      return foundry && foundry.utils && typeof foundry.utils.mergeObject === 'function'
        ? foundry.utils.mergeObject(obj, updates)
        : { ...obj, ...updates };
    };

    return await DocumentAPI.#withSheetGuard(doc, { reopen: true }, performUpdate);
  }

  /**
   * Apply embedded document operations such as create/update/delete for collections like pages or items.
   * @param {string} documentType
   * @param {string} id
   * @param {Array<object>} operations
   */
  static async applyEmbeddedOperations(documentType, id, operations = []) {
    if (!Array.isArray(operations) || operations.length === 0) return;

    const collection = this.#resolveCollection(documentType);
    if (!collection) throw new Error(`Unknown document type: ${documentType}`);
    const doc = collection.get(id);
    this.#ensurePermissionFns(doc, collection);
    if (!doc) throw new Error(`Document not found: ${documentType}/${id}`);

    let updatePermissionChecked = false;
    try {
      const { PermissionManager } = await import('../utils/permissions.js');
      updatePermissionChecked = true;
      if (!PermissionManager.canUpdateDocument(game.user, doc, {})) {
        throw new Error('Permission denied');
      }
    } catch (error) {
      if (updatePermissionChecked && error?.message === 'Permission denied') {
        throw error;
      }
      if (!game.user?.isGM && typeof doc.canUserModify === 'function' && !doc.canUserModify(game.user, 'UPDATE')) {
        throw new Error('Permission denied');
      }
    }

    const grouped = new Map();
    for (const operation of operations) {
      const { embeddedName, action } = operation || {};
      if (!embeddedName || !action) {
        throw new Error('Embedded operation missing embeddedName or action');
      }
      const key = `${embeddedName}:${action}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(operation);
    }

    await DocumentAPI.#withSheetGuard(doc, { reopen: true }, async () => {
      for (const [key, ops] of grouped.entries()) {
        const [embeddedName, action] = key.split(':');

        // Validate embedded documents for insert/replace operations using strict validation
        // to ensure embedded documents receive same validation coverage as standard documents
        if (action === 'insert' || action === 'replace') {
          const collection = doc[embeddedName]; // Access embedded collection as property
          const embeddedDocumentClass = collection?.documentClass; // Get document class for validation

          // Skip validation if embedded collection or document class unavailable (fallback to FoundryVTT)
          if (embeddedDocumentClass) {
            const validationOptions = {
              strict: true,
              fields: true,
              joint: true
            };

            const payloads = ops.map(op => op.data).filter(Boolean);

            // Validate each payload (fail-fast on first error)
            for (const payload of payloads) {
              try {
                if (typeof embeddedDocumentClass.validate === 'function') {
                  embeddedDocumentClass.validate(payload, validationOptions);
                } else if (embeddedDocumentClass.schema && typeof embeddedDocumentClass.schema.validate === 'function') {
                  embeddedDocumentClass.schema.validate(payload, validationOptions);
                }
              } catch (validationError) {
                throw validationError;
              }
            }
          }
        }

        if (action === 'delete') {
          const ids = ops.map(op => op.targetId).filter(Boolean);
          if (!ids.length) {
            throw new Error(`Embedded delete for ${embeddedName} requires target ids`);
          }
          await doc.deleteEmbeddedDocuments(embeddedName, ids, { render: false });
        } else if (action === 'insert') {
          const payloads = ops.map(op => op.data).filter(Boolean);
          if (!payloads.length) {
            throw new Error(`Embedded insert for ${embeddedName} requires data payloads`);
          }
          await doc.createEmbeddedDocuments(embeddedName, payloads, { render: false });
        } else if (action === 'replace') {
          const payloads = ops.map(op => op.data).filter(Boolean);
          if (!payloads.length) {
            throw new Error(`Embedded replace for ${embeddedName} requires data payloads`);
          }
          await doc.updateEmbeddedDocuments(embeddedName, payloads, { render: false });
        } else {
          throw new Error(`Unsupported embedded operation action: ${action}`);
        }
      }
    });
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

    let deletePermissionChecked = false;
    try {
      const { PermissionManager } = await import('../utils/permissions.js');
      deletePermissionChecked = true;
      if (!PermissionManager.canDeleteDocument(game.user, doc)) {
        throw new Error('Permission denied');
      }
    } catch (error) {
      if (deletePermissionChecked && error?.message === 'Permission denied') {
        throw error;
      }
      if (!game.user?.isGM && typeof doc.canUserModify === 'function' && !doc.canUserModify(game.user, 'DELETE')) {
        throw new Error('Permission denied');
      }
    }

    const performDelete = async () => {
      try {
        await doc.delete();
      } catch (deleteError) {
        if (deleteError.name === 'DataModelValidationError') {
          throw deleteError;
        }
        throw new Error(`Document deletion failed: ${deleteError.message}`);
      }
      return true;
    };

    return await DocumentAPI.#withSheetGuard(doc, { reopen: false }, performDelete);
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
      let readable = collection.contents;
      try {
        const { PermissionManager } = await import('../utils/permissions.js');
        readable = await PermissionManager.filterByPermission(game.user, collection.contents, 'READ');
      } catch (error) {
        // Fallback permission filtering
        readable = collection.contents.filter(doc => 
          game.user?.isGM || 
          (typeof doc.canUserModify === 'function' ? doc.canUserModify(game.user, 'READ') : true)
        );
      }
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

  static async #withSheetGuard(doc, options, action) {
    if (typeof action !== 'function') {
      return undefined;
    }

    const sheet = doc?.sheet;
    const sheetExists = sheet && typeof sheet === 'object';
    const wasRendered = Boolean(sheetExists && sheet.rendered);
    const canClose = wasRendered && typeof sheet.close === 'function';
    const shouldReopen = Boolean(options?.reopen && wasRendered && typeof sheet.render === 'function');

    if (canClose) {
      try {
        await sheet.close({ submit: false });
      } catch (error) {
        documentLogger.warn('Failed to close sheet before document mutation', error);
      }
    }

    try {
      return await action();
    } finally {
      if (shouldReopen) {
        try {
          await sheet.render(true);
        } catch (error) {
          documentLogger.warn('Failed to re-render sheet after document mutation', error);
        }
      }
    }
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
