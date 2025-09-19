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
        console.warn(`[SchemaValidator] Document class not found for type: ${documentType}`);
        return null;
      }

      // Access the schema through the class
      const schema = documentClass.schema;
      if (!schema) {
        console.warn(`[SchemaValidator] Schema not found for document type: ${documentType}`);
        return null;
      }

      return {
        documentType,
        documentClass,
        schema,
        fields: this.extractFieldInfo(schema)
      };
    } catch (error) {
      console.warn(`[SchemaValidator] Error getting schema for ${documentType}:`, error);
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
      console.warn('[SchemaValidator] Error extracting field info:', error);
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
      suggestions: []
    };

    // Extract field-specific validation rules
    try {
      if (field.choices) {
        analysis.choices = Array.isArray(field.choices) ? field.choices : Object.values(field.choices);
        analysis.suggestions.push(`Valid choices: ${analysis.choices.join(', ')}`);
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
      console.warn(`[SchemaValidator] Error analyzing field ${fieldName}:`, error);
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
      correctionMethod: null
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
      } else if (error.includes('16-character alphanumeric') && fieldInfo.type === 'DocumentIdField') {
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
      correctionMethod: null
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
      schemaAvailable: !!schemaInfo
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
}