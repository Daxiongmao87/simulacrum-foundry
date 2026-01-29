/* eslint-disable complexity, max-lines-per-function */
import { createLogger } from './logger.js';

const logger = createLogger('SchemaValidator');
/**
 * Schema-Aware Validation Helper
 * Provides intelligent validation assistance based on FoundryVTT document schemas
 */

export class SchemaValidator {
  /**
   * Get schema information for a document type
   * @param {string} documentType - The document type (e.g., "JournalEntry")
   * @returns {Object|null} Schema information or null if not available
   */
  static getDocumentSchema(documentType) {
    try {
      // Get the document class from the global game object
      const documentClass = CONFIG[documentType]?.documentClass;
      if (!documentClass) {
        logger.warn(`Document class not found for type: ${documentType}`);
        return null;
      }

      // Access the schema through the class
      const schema = documentClass.schema;
      if (!schema) {
        logger.warn(`Schema not found for document type: ${documentType}`);
        return null;
      }

      return {
        documentType,
        documentClass,
        schema,
        fields: this.extractFieldInfo(schema),
      };
    } catch (error) {
      logger.warn(`Error getting schema for ${documentType}:`, error);
      return null;
    }
  }

  /**
   * Extract field information from a schema
   * @param {Object} schema - The FoundryVTT schema object
   * @returns {Object} Field information keyed by field name
   */
  static extractFieldInfo(schema) {
    const fields = {};

    try {
      // Iterate through schema fields
      for (const [fieldName, field] of Object.entries(schema.fields || {})) {
        fields[fieldName] = this.analyzeField(fieldName, field);
      }
    } catch (error) {
      logger.warn('Error extracting field info:', error);
    }

    return fields;
  }

  /**
   * Analyze a specific field to extract validation information
   * @param {string} fieldName - The field name
   * @param {Object} field - The field definition
   * @returns {Object} Field analysis
   */
  static analyzeField(fieldName, field) {
    const analysis = {
      name: fieldName,
      type: field.constructor?.name || 'Unknown',
      required: field.required || false,
      nullable: field.nullable !== false,
      initial: field.initial,
      choices: null,
      validation: {},
      suggestions: [],
    };

    // Extract field-specific validation rules
    try {
      if (field.choices) {
        analysis.choices = Array.isArray(field.choices)
          ? field.choices
          : Object.values(field.choices);
        analysis.suggestions.push(`Valid choices: ${analysis.choices.join(', ')}`);
      }

      // CONFIG-based enum lookup for fields without explicit choices
      // Mirrors the logic in DocumentAPI.#lookupConfigChoices for consistency
      if (!analysis.choices && analysis.type === 'StringField') {
        const configChoices = this.#lookupConfigChoices(fieldName);
        if (configChoices && configChoices.length > 0) {
          analysis.choices = configChoices;
          analysis.choicesSource = 'CONFIG';
          analysis.suggestions.push(`Valid values: ${configChoices.slice(0, 10).join(', ')}${configChoices.length > 10 ? '...' : ''}`);
        }
      }

      if (field.min !== undefined) {
        analysis.validation.min = field.min;
        analysis.suggestions.push(`Minimum value: ${field.min}`);
      }

      if (field.max !== undefined) {
        analysis.validation.max = field.max;
        analysis.suggestions.push(`Maximum value: ${field.max}`);
      }

      if (field.integer) {
        analysis.validation.integer = true;
        analysis.suggestions.push('Must be an integer');
      }

      if (field.positive) {
        analysis.validation.positive = true;
        analysis.suggestions.push('Must be positive');
      }

      if (field.blank === false) {
        analysis.validation.notBlank = true;
        analysis.suggestions.push('Cannot be blank');
      }

      // Type-specific suggestions
      switch (analysis.type) {
        case 'DocumentIdField':
          analysis.suggestions.push('Use foundry.utils.randomID() for new documents');
          break;
        case 'StringField':
          if (analysis.required) {
            analysis.suggestions.push('Required string field - provide a non-empty value');
          }
          break;
        case 'NumberField':
          analysis.suggestions.push('Must be a numeric value');
          break;
        case 'BooleanField':
          analysis.suggestions.push('Must be true or false');
          break;
        case 'EmbeddedCollectionField':
          analysis.suggestions.push('Array of embedded documents');
          break;
      }
    } catch (error) {
      logger.warn(`Error analyzing field ${fieldName}:`, error);
    }

    return analysis;
  }

  /**
   * Get validation suggestions for a specific field path and error
   * @param {string} documentType - The document type
   * @param {string} fieldPath - The field path (e.g., "pages.0.name")
   * @param {string} error - The validation error message
   * @param {any} invalidValue - The invalid value
   * @returns {Object} Enhanced validation suggestion
   */
  static getFieldSuggestion(documentType, fieldPath, error, invalidValue) {
    const schemaInfo = this.getDocumentSchema(documentType);
    const suggestion = {
      field: fieldPath,
      error,
      invalidValue,
      schemaAvailable: !!schemaInfo,
      suggestions: [],
      example: null,
      correctionMethod: null,
    };

    if (!schemaInfo) {
      // Fallback to basic suggestions without schema
      return this.getBasicSuggestion(fieldPath, error, invalidValue);
    }

    // Parse field path to get base field name
    const baseField = fieldPath.split('.')[0];
    const fieldInfo = schemaInfo.fields[baseField];

    if (fieldInfo) {
      suggestion.fieldType = fieldInfo.type;
      suggestion.suggestions = [...fieldInfo.suggestions];

      // Add error-specific suggestions
      if (error.includes('may not be undefined') && fieldInfo.required) {
        suggestion.correctionMethod = `Provide a value for required ${fieldInfo.type}`;
        suggestion.example = this.generateFieldExample(fieldInfo);
      } else if (
        error.includes('16-character alphanumeric') &&
        fieldInfo.type === 'DocumentIdField'
      ) {
        suggestion.correctionMethod = 'Use foundry.utils.randomID()';
        suggestion.example = 'foundry.utils.randomID()';
      } else if (error.includes('not a valid choice') && fieldInfo.choices) {
        suggestion.correctionMethod = `Use one of: ${fieldInfo.choices.join(', ')}`;
        suggestion.example = fieldInfo.choices[0];
      }
    }

    return suggestion;
  }

  /**
   * Generate an example value for a field based on its schema info
   * @param {Object} fieldInfo - Field information from schema analysis
   * @returns {any} Example value
   */
  static generateFieldExample(fieldInfo) {
    if (fieldInfo.initial !== undefined) {
      return fieldInfo.initial;
    }

    if (fieldInfo.choices && fieldInfo.choices.length > 0) {
      return fieldInfo.choices[0];
    }

    switch (fieldInfo.type) {
      case 'DocumentIdField':
        return 'foundry.utils.randomID()';
      case 'StringField':
        return fieldInfo.required ? `"Example ${fieldInfo.name}"` : '';
      case 'NumberField':
        return fieldInfo.validation.min || 0;
      case 'BooleanField':
        return true;
      case 'EmbeddedCollectionField':
        return [];
      default:
        return null;
    }
  }

  /**
   * Get basic suggestions without schema information
   * @param {string} fieldPath - The field path
   * @param {string} error - The validation error
   * @param {any} invalidValue - The invalid value
   * @returns {Object} Basic suggestion
   */
  static getBasicSuggestion(fieldPath, error, invalidValue) {
    const suggestion = {
      field: fieldPath,
      error,
      invalidValue,
      schemaAvailable: false,
      suggestions: [],
      example: null,
      correctionMethod: null,
    };

    // Basic pattern matching for common errors
    if (error.includes('16-character alphanumeric')) {
      suggestion.correctionMethod = 'Use foundry.utils.randomID()';
      suggestion.example = 'foundry.utils.randomID()';
    } else if (error.includes('may not be undefined')) {
      suggestion.correctionMethod = `Provide a value for field "${fieldPath}"`;
    } else if (error.includes('not a valid choice')) {
      suggestion.correctionMethod = `Check valid choices for field "${fieldPath}"`;
    }

    return suggestion;
  }

  /**
   * Validate a document data structure against its schema
   * @param {string} documentType - The document type
   * @param {Object} data - The document data to validate
   * @returns {Object} Validation result with suggestions
   */
  static validateDocumentData(documentType, data) {
    const schemaInfo = this.getDocumentSchema(documentType);
    const result = {
      valid: true,
      errors: [],
      suggestions: [],
      schemaAvailable: !!schemaInfo,
    };

    if (!schemaInfo) {
      result.suggestions.push('Schema information not available - using basic validation');
      return result;
    }

    // Basic field presence validation
    for (const [fieldName, fieldInfo] of Object.entries(schemaInfo.fields)) {
      if (fieldInfo.required && (data[fieldName] === undefined || data[fieldName] === null)) {
        result.valid = false;
        result.errors.push(`Required field "${fieldName}" is missing`);
        result.suggestions.push(`Add ${fieldName}: ${this.generateFieldExample(fieldInfo)}`);
      }
    }

    return result;
  }

  /**
   * Validate that provided data fields exist in the document schema.
   * Detects unknown/extraneous fields that would be silently ignored by Foundry.
   * @param {string} documentType - The document type
   * @param {Object} data - The document data to validate
   * @returns {Object} Validation result with unknown fields and suggestions
   */
  static validateUnknownFields(documentType, data) {
    const schemaInfo = this.getDocumentSchema(documentType);
    const result = {
      valid: true,
      unknownFields: [],
      validFields: [],
      suggestions: [],
      schemaAvailable: !!schemaInfo,
    };

    if (!schemaInfo || !data || typeof data !== 'object') {
      return result;
    }

    const schemaFields = new Set(Object.keys(schemaInfo.fields));
    
    // Common meta-fields that Foundry accepts but may not be in schema.fields
    const metaFields = new Set(['_id', 'type', 'sort', 'ownership', 'flags', '_stats']);

    for (const fieldName of Object.keys(data)) {
      if (schemaFields.has(fieldName) || metaFields.has(fieldName)) {
        result.validFields.push(fieldName);
      } else {
        result.unknownFields.push(fieldName);
      }
    }

    if (result.unknownFields.length > 0) {
      result.valid = false;
      
      // Build helpful suggestions
      const availableFieldsList = Array.from(schemaFields).sort().join(', ');
      result.suggestions.push(
        `Unknown fields will be ignored: ${result.unknownFields.join(', ')}`
      );
      result.suggestions.push(
        `Valid top-level fields for ${documentType}: ${availableFieldsList}`
      );

      // Check for common mistakes and provide specific guidance
      for (const unknownField of result.unknownFields) {
        const hint = this.#getFieldMigrationHint(documentType, unknownField, schemaInfo);
        if (hint) {
          result.suggestions.push(hint);
        }
      }
    }

    return result;
  }

  /**
   * Get migration hints for commonly misplaced fields
   * @param {string} documentType - The document type
   * @param {string} fieldName - The unknown field name
   * @param {Object} schemaInfo - The schema info object
   * @returns {string|null} Migration hint or null
   * @private
   */
  static #getFieldMigrationHint(documentType, fieldName, schemaInfo) {
    // Check if the field exists in system schema instead
    const systemFields = schemaInfo.fields?.system;
    if (systemFields) {
      // Try to access nested system field info
      try {
        const systemSchema = systemFields.model?.schema?.fields || 
                            systemFields.fields || 
                            {};
        if (Object.keys(systemSchema).includes(fieldName)) {
          return `Field "${fieldName}" should be inside "system": { "${fieldName}": ... }`;
        }
      } catch (e) {
        // Ignore schema traversal errors
      }
    }

    // Check for embedded collection fields that need special handling
    // Dynamically detect if a field should be in an embedded collection
    const embeddedCollections = Object.entries(schemaInfo.fields || {}).filter(
      ([, field]) => field.isCollection || field.elementType
    ).map(([name]) => name);
    
    if (embeddedCollections.length > 0 && fieldName === 'content') {
      return `Field "content" is not valid at the top level for ${documentType}. This document uses embedded collections: ${embeddedCollections.join(', ')}. Use inspect_document_schema to see the correct structure.`;
    }

    // Check for common field name variations
    const similarFields = Array.from(Object.keys(schemaInfo.fields)).filter(f => 
      f.toLowerCase().includes(fieldName.toLowerCase()) ||
      fieldName.toLowerCase().includes(f.toLowerCase())
    );
    if (similarFields.length > 0) {
      return `Did you mean one of these fields? ${similarFields.join(', ')}`;
    }

    return null;
  }

  /**
   * Looks up valid choices for a field by searching system CONFIG namespace dynamically.
   * @param {string} fieldName The name of the field to look up choices for.
   * @returns {string[]|null} Array of valid choices, or null if not found.
   * @private
   */
  static #lookupConfigChoices(fieldName) {
    if (!game?.system?.id) return null;

    // Dynamically find the system's CONFIG namespace
    const systemId = game.system.id;
    const systemConfig = CONFIG[systemId.toUpperCase()] || 
                         CONFIG[systemId.toLowerCase()] || 
                         CONFIG[systemId];
    
    if (!systemConfig || typeof systemConfig !== 'object') return null;

    // Pure fuzzy search - no hardcoded mappings
    const lowerFieldName = fieldName.toLowerCase();
    
    for (const [key, value] of Object.entries(systemConfig)) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
      
      const lowerKey = key.toLowerCase();
      
      // Match patterns like "actorSizes" for field "size"
      const isMatch = lowerKey === lowerFieldName ||
                      lowerKey === lowerFieldName + 's' ||
                      lowerKey.endsWith(lowerFieldName + 's') ||
                      lowerKey.endsWith(lowerFieldName);
      
      if (isMatch) {
        const keys = this.#extractConfigKeys(value);
        if (keys && keys.length > 0 && keys.length < 50) {
          return keys;
        }
      }
    }

    return null;
  }

  /**
   * Extracts keys from a CONFIG object that represents an enum.
   * @param {object|array} configValue The CONFIG value to extract keys from.
   * @returns {string[]|null} Array of keys, or null if not a valid enum.
   * @private
   */
  static #extractConfigKeys(configValue) {
    if (!configValue) return null;

    if (Array.isArray(configValue)) {
      return configValue
        .map(item => (typeof item === 'string' ? item : item?.value || item?.id))
        .filter(Boolean);
    }

    if (typeof configValue === 'object') {
      const keys = Object.keys(configValue);
      return keys.filter(k => !k.startsWith('_') && typeof configValue[k] !== 'function');
    }

    return null;
  }
}
