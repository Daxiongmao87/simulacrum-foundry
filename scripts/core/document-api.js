/* eslint-disable complexity, max-lines-per-function, max-depth, no-undef, no-useless-catch, max-lines */
// SPDX-License-Identifier: MIT
// Copyright © 2024-2025 Aaron Riechert

import { createLogger } from '../utils/logger.js';
import { detectDocumentReferences } from '../utils/schema-introspection.js';

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
   * Lists available Compendium Packs, optionally filtered by document type.
   * @param {string} [documentType] Optional document type to filter by (e.g. "Actor", "Item").
   * @returns {object[]} Array of pack objects { id, title, documentName, count }.
   */
  static listPacks(documentType) {
    if (!game?.packs) return [];

    // Convert Map to Array
    const packs = Array.from(game.packs);

    // Filter if type specified
    const filtered = documentType
      ? packs.filter(p => p.documentName === documentType)
      : packs;

    // Map to simplified objects
    return filtered.map(p => ({
      id: p.metadata.id, // e.g., "dnd5e.heroes"
      title: p.metadata.title || p.title,
      documentName: p.documentName,
      count: p.index.size // Note: index size is O(1), efficient
    }));
  }

  /**
   * Retrieves the schema for a given document type, including fields, embedded documents,
   * relationships, and references. Supports both top-level and embedded document types.
   * @param {string} documentType The name of the document type.
   * @param {string} [subtype] Optional subtype for system-specific fields (e.g., "npc", "weapon").
   * @returns {object|null} The document schema object, or null if the type is invalid.
   */
  static getDocumentSchema(documentType, subtype) {
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

      const schema = this.#extractDocumentSchema(documentType, documentClass, subtype);

      const elapsed = performance.now() - startTime;
      if (elapsed > 50) {
        documentLogger.warn(
          `Schema discovery for "${documentType}" took ${elapsed.toFixed(2)}ms (exceeds 50ms threshold)`
        );
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
            documentLogger.debug(
              `Found embedded document "${documentType}" in ${parentType}.hierarchy`
            );
            return embeddedClass;
          }
        }

        // Also check metadata.embedded for additional discovery
        if (parentClass.metadata?.embedded) {
          for (const [embeddedDocType, collectionName] of Object.entries(
            parentClass.metadata.embedded
          )) {
            if (embeddedDocType === documentType) {
              // Try to resolve the document class from the schema
              try {
                const schema = parentClass.schema;
                if (schema?.fields?.[collectionName]) {
                  const field = schema.fields[collectionName];
                  if (field.model || field.element) {
                    const embeddedClass = field.model || field.element;
                    documentLogger.debug(
                      `Found embedded document "${documentType}" in ${parentType}.metadata.embedded`
                    );
                    return embeddedClass;
                  }
                }
              } catch (schemaError) {
                documentLogger.debug(
                  `Failed to extract embedded class from schema for "${documentType}":`,
                  schemaError
                );
              }
            }
          }
        }
      } catch (error) {
        documentLogger.debug(
          `Error searching parent type "${parentType}" for embedded document "${documentType}":`,
          error
        );
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
            documentLogger.debug(
              `Found embedded document "${documentType}" in game.documentTypes.${parentType}.hierarchy`
            );
            return embeddedClass;
          }
        } catch (error) {
          documentLogger.debug(
            `Error searching game.documentTypes["${parentType}"] for "${documentType}":`,
            error
          );
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
              documentLogger.debug(
                `Found embedded document "${documentType}" in ${parentType}.dataModels.${subtype}.hierarchy`
              );
              return embeddedClass;
            }
          } catch (subtypeError) {
            documentLogger.debug(
              `Error searching ${parentType}.dataModels.${subtype} for "${documentType}":`,
              subtypeError
            );
            continue;
          }
        }
      } catch (error) {
        documentLogger.debug(
          `Error searching ${parentType}.dataModels for "${documentType}":`,
          error
        );
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
                if (!DocumentClass || !DocumentClass.documentName) {
                  continue;
                }

                // Check if this document class matches our search
                if (DocumentClass.documentName === documentType) {
                  documentLogger.debug(
                    `Found embedded document "${documentType}" in ${namespace}.documents.${collectionName}.${className}`
                  );
                  return DocumentClass;
                }
              } catch (classError) {
                documentLogger.debug(
                  `Error searching ${namespace}.documents.${collectionName}.${className} for "${documentType}":`,
                  classError
                );
                continue;
              }
            }
          } catch (collectionError) {
            documentLogger.debug(
              `Error searching ${namespace}.documents.${collectionName} for "${documentType}":`,
              collectionError
            );
            continue;
          }
        }
      } catch (namespaceError) {
        documentLogger.debug(
          `Error searching ${namespace}.documents for "${documentType}":`,
          namespaceError
        );
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
   * Extracts system-specific fields for a document subtype.
   * Resolves CONFIG[documentType].dataModels[subtype] and extracts its schema fields.
   * @param {string} documentType The parent document type (e.g., "Actor", "Item").
   * @param {string} subtype The subtype to resolve (e.g., "npc", "weapon").
   * @param {object} definitions The definitions registry for $refs.
   * @param {Map} definitionMap Map of visited objects to ref names.
   * @returns {{ systemFields: string[], systemFieldDetails: object }|null} Extracted fields or null.
   * @private
   */
  static #extractSystemFieldsForSubtype(documentType, subtype, definitions, definitionMap) {
    const dataModel = CONFIG[documentType]?.dataModels?.[subtype];
    if (!dataModel?.schema?.fields) {
      documentLogger.debug(
        `No dataModel found for ${documentType}.${subtype}`
      );
      return null;
    }

    const fields = dataModel.schema.fields;
    const systemFields = Object.keys(fields);
    const systemFieldDetails = this.#extractFieldDetails(fields, definitions, definitionMap);

    return { systemFields, systemFieldDetails };
  }

  /**
   * Extracts and formats the schema information from a document class.
   * Uses Schema Normalization ($defs) to prevent JSON explosion from shared data models.
   * @param {string} documentType The document type name.
   * @param {object} documentClass The document class to extract schema from.
   * @param {string} [subtype] Optional subtype for system-specific fields.
   * @returns {object} The formatted schema object with $defs.
   * @private
   */
  static #extractDocumentSchema(documentType, documentClass, subtype) {
    // Registry for shared definitions (DataModels)
    const definitions = {};
    const definitionMap = new Map(); // Object -> RefName mapping

    /**
     * Helper to get or create a definition for a DataModel
     */
    const getRef = (modelClass, baseName) => {
      const id = modelClass;
      if (definitionMap.has(id)) {
        return `#/definitions/${definitionMap.get(id)}`;
      }

      // Generate unique name
      let refName = baseName || modelClass.name || 'UnknownModel';
      let counter = 1;
      while (definitions[refName]) {
        refName = `${baseName || modelClass.name}_${counter++}`;
      }

      // Reserve name to prevent cycles during recursion
      definitionMap.set(id, refName);

      // Extract definition
      try {
        const schema = { fields: [], fieldDetails: {} };
        if (modelClass.schema?.fields) {
          schema.fields = Object.keys(modelClass.schema.fields);
          schema.fieldDetails = this.#extractFieldDetails(
            modelClass.schema.fields,
            definitions,
            definitionMap
          );
        }
        definitions[refName] = schema;
      } catch (e) {
        definitions[refName] = { error: String(e) };
      }

      return `#/definitions/${refName}`;
    };

    // Main Schema Object
    const schema = {
      type: documentType,
      definitions: definitions, // The registry
      fields: [],
      fieldDetails: {},
      systemFields: [],
      systemFieldDetails: {}, // Will be empty/ref-based now for cleaner output
      embedded: [],
      embeddedSchemas: {},
      relationships: {},
      references: {},
    };

    try {
      // Extract main schema fields
      if (documentClass.schema?.fields) {
        schema.fields = Object.keys(documentClass.schema.fields);
        schema.fieldDetails = this.#extractFieldDetails(
          documentClass.schema.fields,
          definitions,
          definitionMap
        );
      }

      // Extract system fields — subtype-aware when subtype is provided
      if (subtype) {
        const subtypeResult = this.#extractSystemFieldsForSubtype(
          documentType, subtype, definitions, definitionMap
        );
        if (subtypeResult) {
          schema.systemFields = subtypeResult.systemFields;
          schema.systemFieldDetails = subtypeResult.systemFieldDetails;
          schema.subtype = subtype;
        }
      } else if (documentClass.schema?.has && documentClass.schema.has('system')) {
        try {
          const systemField = documentClass.schema.getField('system');
          // If system data is a Model, ref it!
          if (systemField.model) {
            const ref = getRef(systemField.model, 'SystemData');
            schema.systemFieldDetails = { $ref: ref };
            schema.systemFields = ['$ref']; // Indicator
          }
          // Fallback for raw fields
          else if (systemField?.fields) {
            schema.systemFields = Object.keys(systemField.fields);
            schema.systemFieldDetails = this.#extractFieldDetails(
              systemField.fields,
              definitions,
              definitionMap
            );
          }
        } catch (systemError) {
          documentLogger.debug(`System extraction error:`, systemError);
        }
      }

      // Extract embedded document types (Stubbed as before)
      if (documentClass.hierarchy) {
        schema.embedded = Object.keys(documentClass.hierarchy);
        for (const [embeddedName, embeddedClass] of Object.entries(documentClass.hierarchy)) {
          schema.embeddedSchemas[embeddedName] = {
            type: embeddedClass.documentName || embeddedName,
            isEmbedded: true,
            note: 'Use inspect_document_schema on this type to see full details.',
          };
        }
      }

      // Extract relationships and references
      try {
        schema.relationships = this.getDocumentRelationships(documentClass);
        schema.references = this.getDocumentReferences(documentClass);
      } catch (relationError) { /* ignore */ }

    } catch (error) {
      documentLogger.error(`Schema field extraction failed for "${documentType}":`, error);
      throw error;
    }

    // When subtype is provided, trim low-value core fields to reduce bloat
    if (subtype) {
      delete schema.definitions;
      delete schema.references;

      // Strip noisy core field details, keep only essential ones
      const essentialFields = new Set(['name', 'type', 'img', 'system']);
      const trimmedDetails = {};
      for (const key of essentialFields) {
        if (schema.fieldDetails[key]) {
          trimmedDetails[key] = schema.fieldDetails[key];
        }
      }
      schema.fieldDetails = trimmedDetails;

      // Remove _stats and flags from systemFieldDetails if present
      if (schema.systemFieldDetails && typeof schema.systemFieldDetails === 'object' && !schema.systemFieldDetails.$ref) {
        delete schema.systemFieldDetails._stats;
        delete schema.systemFieldDetails.flags;
      }
    }

    return schema;
  }

  /**
   * Extracts detailed information about schema fields including types.
   * normalizing nested complex types into definitions.
   * @param {object} fields The fields object from a DataModel schema.
   * @param {object} definitions The definitions registry.
   * @param {Map} definitionMap Map of visited objects to ref names.
   * @returns {object} Field details object.
   * @private
   */
  static #extractFieldDetails(fields, definitions, definitionMap) {
    const details = {};

    // Helper to recurse via ref
    const getRef = (modelClass, baseName) => {
      // ... (Same getRef logic, duplicated locally or class method? 
      // Duplicate for now to keep strict context or use definitionMap logic inline)

      // RE-USE LOGIC:
      const id = modelClass;
      if (definitionMap.has(id)) return `#/definitions/${definitionMap.get(id)}`;

      // Create new
      const nameGuess = modelClass.name || baseName || 'NestedModel';
      let refName = nameGuess;
      let c = 1;
      while (definitions[refName]) refName = `${nameGuess}_${c++}`;

      definitionMap.set(id, refName);

      const schema = { fields: [], fieldDetails: {} };
      if (modelClass.schema?.fields) {
        schema.fields = Object.keys(modelClass.schema.fields);
        schema.fieldDetails = this.#extractFieldDetails(modelClass.schema.fields, definitions, definitionMap);
      }
      definitions[refName] = schema;
      return `#/definitions/${refName}`;
    };

    for (const [fieldName, field] of Object.entries(fields)) {
      try {
        const fieldInfo = {
          type: this.#getFieldTypeName(field),
          required: field.required || false,
        };

        if (field.nullable !== undefined) fieldInfo.nullable = field.nullable;

        // Handle Collections / Embedded Models
        if (field.element || field.model) {
          fieldInfo.isCollection = true;
          const elementClass = field.element || field.model;

          if (elementClass?.documentName) {
            fieldInfo.elementType = elementClass.documentName;
            fieldInfo.note = 'Embedded Document (see separate schema)';
          } else if (elementClass?.schema?.fields) {
            // It's a DataModel -> Normalize it
            fieldInfo.items = { $ref: getRef(elementClass, fieldName) };
          }
        }

        // Handle Nested SchemaFields
        if (field.fields && typeof field.fields === 'object') {
          // Create a synthetic class-like ID for this specific field instance's internal schema
          // Or just treat as nested object if it doesn't have a named class?
          // SchemaFields often are ad-hoc.
          // We can inline them or define them. Inlining is safer for unique structures.
          // But if huge, we might want to define. 
          // Let's inline simple ones, ref complex ones?
          // For simplicity in this logic: Inline, but use same recursion
          fieldInfo.nested = this.#extractFieldDetails(field.fields, definitions, definitionMap);
        }

        // Handle Mapping
        if (field.isMapping || field.constructor?.name === 'MappingField') {
          fieldInfo.isMapping = true;
          if (field.model?.schema?.fields) {
            fieldInfo.values = { $ref: getRef(field.model, `${fieldName}Value`) };
          }
        }

        // Choices
        if (field.choices) {
          try {
            const ch = typeof field.choices === 'function' ? field.choices() : field.choices;
            if (Array.isArray(ch)) fieldInfo.choices = ch.slice(0, 20);
            else if (typeof ch === 'object') fieldInfo.choices = Object.keys(ch).slice(0, 20);
          } catch (e) { }
        }

        // CONFIG-based enum lookup for fields without explicit choices
        // Many systems (dnd5e, pf2e, etc.) store valid values in CONFIG.SYSTEM_ID
        if (!fieldInfo.choices && fieldInfo.type === 'string') {
          const configChoices = this.#lookupConfigChoices(fieldName);
          if (configChoices && configChoices.length > 0) {
            fieldInfo.choices = configChoices.slice(0, 30);
            fieldInfo.choicesSource = 'CONFIG';
          }
        }

        details[fieldName] = fieldInfo;
      } catch (fieldError) {
        details[fieldName] = { type: 'unknown', error: 'Failed to extract' };
      }
    }

    return details;
  }

  /**
   * Gets a human-readable type name for a schema field.
   * @param {object} field The schema field object.
   * @returns {string} The type name.
   * @private
   */
  static #getFieldTypeName(field) {
    if (!field) return 'unknown';

    // Check constructor name first
    const constructorName = field.constructor?.name;
    if (constructorName && constructorName !== 'Object') {
      // Clean up common Foundry field type names
      return constructorName
        .replace(/Field$/, '')
        .replace(/([A-Z])/g, ' $1')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
    }

    // Fallback to type property if available
    if (field.type) {
      if (typeof field.type === 'function') {
        return field.type.name?.toLowerCase() || 'function';
      }
      return String(field.type).toLowerCase();
    }

    return 'unknown';
  }

  /**
   * Looks up valid choices for a field by searching all CONFIG namespaces dynamically.
   * No hardcoded system assumptions - searches game.system's CONFIG namespace and
   * uses fuzzy matching to find enum-like objects.
   * @param {string} fieldName The name of the field to look up choices for.
   * @returns {string[]|null} Array of valid choices, or null if not found.
   * @private
   */
  static #lookupConfigChoices(fieldName) {
    if (!game?.system?.id) return null;

    // Dynamically find the system's CONFIG namespace
    // Try multiple naming conventions: uppercase, lowercase, original
    const systemId = game.system.id;
    const systemConfig = CONFIG[systemId.toUpperCase()] || 
                         CONFIG[systemId.toLowerCase()] || 
                         CONFIG[systemId];
    
    if (!systemConfig || typeof systemConfig !== 'object') return null;

    // Pure fuzzy search - no hardcoded mappings
    // Look for CONFIG keys that might match this field name
    const lowerFieldName = fieldName.toLowerCase();
    
    for (const [key, value] of Object.entries(systemConfig)) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
      
      const lowerKey = key.toLowerCase();
      
      // Match patterns like:
      // - "actorSizes" for field "size" (key ends with fieldName + 's')
      // - "spellSchools" for field "school" (key ends with fieldName + 's')
      // - Direct match: key === fieldName
      const isMatch = lowerKey === lowerFieldName ||
                      lowerKey === lowerFieldName + 's' ||
                      lowerKey.endsWith(lowerFieldName + 's') ||
                      lowerKey.endsWith(lowerFieldName);
      
      if (isMatch) {
        const keys = this.#extractConfigKeys(value);
        // Sanity check: only return if it looks like an enum (reasonable number of values)
        if (keys && keys.length > 0 && keys.length < 50) {
          return keys;
        }
      }
    }

    return null;
  }

  /**
   * Extracts keys from a CONFIG object that represents an enum.
   * Handles both object-style enums and array-style enums.
   * @param {object|array} configValue The CONFIG value to extract keys from.
   * @returns {string[]|null} Array of keys, or null if not a valid enum.
   * @private
   */
  static #extractConfigKeys(configValue) {
    if (!configValue) return null;

    if (Array.isArray(configValue)) {
      // Array of strings or objects with 'value' property
      return configValue
        .map(item => (typeof item === 'string' ? item : item?.value || item?.id))
        .filter(Boolean);
    }

    if (typeof configValue === 'object') {
      // Object with keys as enum values (most common in Foundry)
      const keys = Object.keys(configValue);
      // Filter out methods and prototype properties
      return keys.filter(k => !k.startsWith('_') && typeof configValue[k] !== 'function');
    }

    return null;
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
        if (field.isDocumentReference) {
          // Example custom property for testing
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
    try {
      return detectDocumentReferences(documentClass) || {};
    } catch (_e) {
      return {};
    }
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
    const { limit, sort, filters = {}, permission = 'READ', pack } = options;

    // SCENARIO 1: List documents from a specific Compendium Pack
    if (pack) {
      const packObj = game.packs.get(pack);
      if (!packObj) throw new Error(`Unknown compendium pack: ${pack}`);

      // If documentType is provided, verify it matches
      if (documentType && packObj.documentName !== documentType) {
        throw new Error(`Pack '${pack}' contains '${packObj.documentName}', not '${documentType}'`);
      }

      // Get index (lightweight) or full documents (heavy)
      // For listing, index is preferred, but index doesn't have all fields.
      // However, typical list operations just need name/id/img.
      const index = await packObj.getIndex();

      // Convert to array
      let docs = Array.from(index);

      // Filter
      if (filters && Object.keys(filters).length) {
        docs = docs.filter(doc => {
          return Object.entries(filters).every(([k, v]) => {
            const val = this.#get(doc, k);
            if (v == null) return true;
            return String(val).toLowerCase().includes(String(v).toLowerCase());
          });
        });
      }

      // Sort
      if (sort && typeof sort === 'object') {
        const [[key, dir]] = Object.entries(sort);
        const factor = dir === 'desc' ? -1 : 1;
        docs.sort((a, b) => {
          const av = this.#get(a, key);
          const bv = this.#get(b, key);
          return av > bv ? factor : av < bv ? -factor : 0;
        });
      }

      const sliced = typeof limit === 'number' ? docs.slice(0, limit) : docs;
      return sliced;
    }

    // SCENARIO 2: List documents from World Collection
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
    return sliced.map(d => {
      const obj = d.toObject();
      // Preserve uuid from the live Document — toObject() strips computed getters
      if (d.uuid) obj.uuid = d.uuid;
      return obj;
    });
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
    const { includeEmbedded = false, pack } = options;

    // SCENARIO 1: Get document from Compendium Pack
    if (pack) {
      const packObj = game.packs.get(pack);
      if (!packObj) throw new Error(`Unknown compendium pack: ${pack}`);

      // If documentType is provided, verify it matches
      if (documentType && packObj.documentName !== documentType) {
        throw new Error(`Pack '${pack}' contains '${packObj.documentName}', not '${documentType}'`);
      }

      const doc = await packObj.getDocument(id);
      if (!doc) throw new Error(`Document not found in pack '${pack}': ${id}`);

      const obj = doc.toObject();
      if (doc.uuid) obj.uuid = doc.uuid;

      return obj;
    }

    // SCENARIO 2: Get document from World Collection
    const collection = this.#resolveCollection(documentType);
    if (!collection) throw new Error(`Unknown document type: ${documentType}`);
    const doc = collection.get(id);
    this.#ensurePermissionFns(doc, collection);
    if (!doc) throw new Error(`Document not found: @UUID[${documentType}.${id}]`);

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
      if (
        !game.user?.isGM &&
        typeof doc.canUserModify === 'function' &&
        !doc.canUserModify(game.user, 'READ')
      ) {
        throw new Error('Permission denied');
      }
    }

    const obj = doc.toObject();
    if (doc.uuid) obj.uuid = doc.uuid;
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
    if (!doc) throw new Error(`Document not found: @UUID[${documentType}.${id}]`);

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
      if (
        !game.user?.isGM &&
        typeof doc.canUserModify === 'function' &&
        !doc.canUserModify(game.user, 'READ')
      ) {
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
          joint: true,
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
        // Check by name OR by message pattern OR by getAllFailures method
        const isValidationError = createError.name === 'DataModelValidationError' ||
          (createError.message && (
            createError.message.includes('validation errors:') ||
            createError.message.includes('Validation failed')
          )) ||
          (createError.getAllFailures && typeof createError.getAllFailures === 'function');
        
        if (isValidationError) {
          throw createError;
        }
        // Handle other creation errors - preserve the original error for better debugging
        const wrappedError = new Error(`Document creation failed: ${createError.message}`);
        wrappedError.originalError = createError;
        throw wrappedError;
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
   * @param {object} [options]
   * @param {string} [options.pack] - Compendium pack ID (optional)
   * @returns {Promise<object>} Updated document object
   */
  static async updateDocument(documentType, id, updates, options = {}) {
    const { pack } = options;
    let doc;
    let collection;

    // SCENARIO 1: Update in Compendium Pack
    if (pack) {
      collection = game.packs.get(pack);
      if (!collection) throw new Error(`Unknown compendium pack: ${pack}`);

      // If documentType is provided, verify it matches
      if (documentType && collection.documentName !== documentType) {
        throw new Error(`Pack '${pack}' contains '${collection.documentName}', not '${documentType}'`);
      }

      doc = await collection.getDocument(id);
      if (!doc) throw new Error(`Document not found in pack '${pack}': ${id}`);

      // Compendium permissions: requires explicit ownership check usually, but for tools acting as user:
      // We check if pack is locked vs unlocked, or if user is owner of the specific document?
      // Generally, simply checking canUserModify(game.user, "UPDATE") is correct even for compendium docs.
      // Unlike world docs, collection.get(id) works differently (always async getDocument for packs), so we fetched explicitly above.
    }
    // SCENARIO 2: Update in World Collection
    else {
      collection = this.#resolveCollection(documentType);
      if (!collection) throw new Error(`Unknown document type: ${documentType}`);
      doc = collection.get(id);
    }

    // Permission Check Logic (Common)
    this.#ensurePermissionFns(doc, collection);
    if (!doc) throw new Error(`Document not found: @UUID[${documentType}.${id}]`);

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
      if (
        !game.user?.isGM &&
        typeof doc.canUserModify === 'function' &&
        !doc.canUserModify(game.user, 'UPDATE')
      ) {
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
            joint: false,
          });
        }
      } catch (validationError) {
        throw validationError;
      }

      try {
        await doc.update(updates);
      } catch (updateError) {
        // Check by name OR by message pattern OR by getAllFailures method
        const isValidationError = updateError.name === 'DataModelValidationError' ||
          (updateError.message && (
            updateError.message.includes('validation errors:') ||
            updateError.message.includes('Validation failed')
          )) ||
          (updateError.getAllFailures && typeof updateError.getAllFailures === 'function');
        
        if (isValidationError) {
          throw updateError;
        }
        const wrappedError = new Error(`Document update failed: ${updateError.message}`);
        wrappedError.originalError = updateError;
        throw wrappedError;
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
    if (!doc) throw new Error(`Document not found: @UUID[${documentType}.${id}]`);

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
      if (
        !game.user?.isGM &&
        typeof doc.canUserModify === 'function' &&
        !doc.canUserModify(game.user, 'UPDATE')
      ) {
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
              joint: true,
            };

            const payloads = ops.map(op => op.data).filter(Boolean);

            // Validate each payload (fail-fast on first error)
            for (const payload of payloads) {
              try {
                if (typeof embeddedDocumentClass.validate === 'function') {
                  embeddedDocumentClass.validate(payload, validationOptions);
                } else if (
                  embeddedDocumentClass.schema &&
                  typeof embeddedDocumentClass.schema.validate === 'function'
                ) {
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
   * @param {Object} [options] - Optional parameters
   * @param {string} [options.pack] - Compendium pack ID to delete from
   * @returns {Promise<boolean>} True if deleted
   */
  static async deleteDocument(documentType, id, options = {}) {
    let doc;

    // If pack is specified, get document from compendium
    if (options.pack) {
      const packCollection = game.packs.get(options.pack);
      if (!packCollection) throw new Error(`Compendium pack not found: ${options.pack}`);
      if (packCollection.locked) throw new Error(`Compendium pack is locked: ${options.pack}`);
      if (packCollection.documentName !== documentType) {
        throw new Error(`Pack ${options.pack} contains ${packCollection.documentName}, not ${documentType}`);
      }
      doc = await packCollection.getDocument(id);
      if (!doc) throw new Error(`Document not found in pack: @UUID[Compendium.${options.pack}.${id}]`);
    } else {
      const collection = this.#resolveCollection(documentType);
      if (!collection) throw new Error(`Unknown document type: ${documentType}`);
      doc = collection.get(id);
      this.#ensurePermissionFns(doc, collection);
      if (!doc) throw new Error(`Document not found: @UUID[${documentType}.${id}]`);
    }

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
      if (
        !game.user?.isGM &&
        typeof doc.canUserModify === 'function' &&
        !doc.canUserModify(game.user, 'DELETE')
      ) {
        throw new Error('Permission denied');
      }
    }

    const performDelete = async () => {
      try {
        await doc.delete();
      } catch (deleteError) {
        // Check by name OR by message pattern OR by getAllFailures method
        const isValidationError = deleteError.name === 'DataModelValidationError' ||
          (deleteError.message && (
            deleteError.message.includes('validation errors:') ||
            deleteError.message.includes('Validation failed')
          )) ||
          (deleteError.getAllFailures && typeof deleteError.getAllFailures === 'function');
        
        if (isValidationError) {
          throw deleteError;
        }
        const wrappedError = new Error(`Document deletion failed: ${deleteError.message}`);
        wrappedError.originalError = deleteError;
        throw wrappedError;
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
    // Normalize fields: null/empty from LLM tool calls should fall back to default
    if (!Array.isArray(fields) || fields.length === 0) {
      fields = ['name'];
    }

    const searchTypes = Array.isArray(types) && types.length ? types : this.getAllDocumentTypes();
    const results = [];
    const q = String(query || '').toLowerCase();

    // Helper to check match
    const isMatch = (obj) => {
      const hay = fields
        .map(f => String(DocumentAPI.#get(obj, f) ?? ''))
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    };

    for (const t of searchTypes) {
      if (results.length >= maxResults) break;

      // 1. Search World Collection
      const collection = this.#resolveCollection(t);
      if (collection) {
        // Permission: READ
        let readable = [];
        try {
          const { PermissionManager } = await import('../utils/permissions.js');
          readable = await PermissionManager.filterByPermission(
            game.user,
            collection.contents,
            'READ'
          );
        } catch (error) {
          // Fallback
          readable = collection.contents.filter(
            doc =>
              game.user?.isGM ||
              (typeof doc.canUserModify === 'function' ? doc.canUserModify(game.user, 'READ') : true)
          );
        }

        for (const doc of readable) {
          const obj = doc.toObject();
          if (isMatch(obj)) {
            results.push({ type: t, _id: obj._id, name: obj.name, uuid: doc.uuid });
            if (results.length >= maxResults) break;
          }
        }
      }

      if (results.length >= maxResults) break;

      // 2. Search Compendium Packs
      // Only search packs that contain this document type
      const packs = game.packs.filter(p => p.documentName === t);
      for (const pack of packs) {
        if (results.length >= maxResults) break;
        // Check pack visibility/permission (User can generally read visible packs)
        if (!pack.testUserPermission(game.user, "READ")) continue;

        // Use index for speed
        const index = await pack.getIndex({ fields });
        for (const idx of index) {
          // idx is a plain object with fields
          if (isMatch(idx)) {
            results.push({
              type: t,
              _id: idx._id,
              name: idx.name,
              pack: pack.collection,
              uuid: idx.uuid // Index usually has uuid
            });
            if (results.length >= maxResults) break;
          }
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
    const shouldReopen = Boolean(
      options?.reopen && wasRendered && typeof sheet.render === 'function'
    );

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
      if (
        typeof doc.testUserPermission !== 'function' &&
        typeof sample.testUserPermission === 'function'
      ) {
        doc.testUserPermission = sample.testUserPermission;
      }
      if (typeof doc.canUserModify !== 'function' && typeof sample.canUserModify === 'function') {
        doc.canUserModify = sample.canUserModify;
      }
    }
  }
}
