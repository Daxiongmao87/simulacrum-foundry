import { SchemaValidator } from './schema-validator.js';
import { createLogger } from './logger.js';

const logger = createLogger('ValidationErrorHandler');

/**
 * Validation Error Handler - Unified handling for Foundry validation errors
 * Converts Foundry's DataModelValidationError into AI-friendly structured feedback
 */

export class ValidationErrorHandler {
  /**
   * Parse a Foundry DataModelValidationError into structured feedback
   * @param {Error} error - The error to parse
   * @returns {Object|null} Structured validation error details or null if not a validation error
   */
  static parseFoundryValidationError(error) {
    if (error.name !== 'DataModelValidationError') {
      return null;
    }

    // Use FoundryVTT's official getAllFailures() method if available
    let validationDetails = {};
    if (error.getAllFailures && typeof error.getAllFailures === 'function') {
      try {
        const allFailures = error.getAllFailures();
        validationDetails = this.processFoundryFailures(allFailures);
      } catch (e) {
        logger.warn('Failed to use getAllFailures(), falling back to message parsing');
        validationDetails = this.extractValidationDetails(error);
      }
    } else {
      // Fallback to message parsing for older versions or edge cases
      validationDetails = this.extractValidationDetails(error);
    }

    const suggestions = this.generateSuggestions(validationDetails);

    return {
      type: 'VALIDATION_ERROR',
      message: error.message,
      originalError: error,
      details: validationDetails,
      suggestions,
      aiContext: this.createAIContext(validationDetails, suggestions),
    };
  }

  /**
   * Process validation failures using FoundryVTT's official getAllFailures() method
   * @param {Object} allFailures - Result from error.getAllFailures()
   * @returns {Object} Structured validation details
   */
  static processFoundryFailures(allFailures) {
    const details = {};

    for (const [fieldPath, failure] of Object.entries(allFailures)) {
      details[fieldPath] = {
        field: fieldPath,
        error: failure.message || 'Validation failed',
        invalidValue: failure.invalidValue,
        fallback: failure.fallback,
        dropped: failure.dropped || false,
      };
    }

    return details;
  }

  /**
   * Extract structured validation details from Foundry error (fallback method)
   * @param {Error} error - DataModelValidationError
   * @returns {Object} Structured validation details
   */
  static extractValidationDetails(error) {
    const details = {};

    // Parse error message to extract field-specific validation failures
    // Foundry format: "Document [id] validation errors:\n  field: error message"
    const errorMessage = error.message || '';
    const lines = errorMessage.split('\n');

    let currentPath = '';
    for (const line of lines) {
      const trimmed = line.trim();

      // Skip header lines
      if (trimmed.includes('validation errors:') || trimmed === '') {
        continue;
      }

      // Handle nested field paths (indented lines)
      const indentLevel = line.length - line.trimStart().length;

      if (trimmed.includes(':')) {
        const [fieldPart, ...messageParts] = trimmed.split(':');
        const field = fieldPart.trim();
        const message = messageParts.join(':').trim();

        // Build full field path
        if (indentLevel === 0) {
          currentPath = field;
        } else {
          currentPath = currentPath ? `${currentPath}.${field}` : field;
        }

        details[currentPath] = {
          field: currentPath,
          error: message,
          indentLevel,
        };
      }
    }

    return details;
  }

  /**
   * Generate AI-friendly suggestions based on validation errors
   * @param {Object} validationDetails - Structured validation details
   * @returns {Array} Array of suggestion objects
   */
  static generateSuggestions(validationDetails) {
    const suggestions = [];

    for (const [fieldPath, detail] of Object.entries(validationDetails)) {
      const suggestion = this.createFieldSuggestion(fieldPath, detail);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }

    return suggestions;
  }

  /**
   * Create a suggestion for a specific field validation error
   * @param {string} fieldPath - The field path (e.g., "pages.oEiIxE7ZVA1HTl0X.name")
   * @param {Object} detail - The validation detail
   * @returns {Object} Suggestion object
   */
  // eslint-disable-next-line complexity
  static createFieldSuggestion(fieldPath, detail) {
    const { error, invalidValue, fallback } = detail;
    const suggestion = {
      field: fieldPath,
      issue: error,
      action: null,
      example: null,
      invalidValue: invalidValue,
      suggestedValue: fallback,
    };

    // Enhanced validation error patterns and suggestions
    if (error.includes('may not be undefined') || error.includes('is required')) {
      suggestion.action = `Provide a value for required field "${fieldPath}"`;
      suggestion.example = fallback || this.getFieldExample(fieldPath);
    } else if (error.includes('must be a valid 16-character alphanumeric ID')) {
      suggestion.action = `Use foundry.utils.randomID() to generate a valid ID for "${fieldPath}"`;
      suggestion.example = 'foundry.utils.randomID()';
    } else if (error.includes('must be') && error.includes('type')) {
      suggestion.action = `Ensure field "${fieldPath}" has the correct data type`;
      suggestion.example = fallback || this.getTypeExample(error);
    } else if (error.includes('is not a valid choice')) {
      suggestion.action = `Use a valid choice for field "${fieldPath}"`;
      if (fallback !== undefined) {
        suggestion.example = fallback;
      }
    } else if (error.includes('invalid')) {
      suggestion.action = `Check that the value for "${fieldPath}" is valid`;
      if (invalidValue !== undefined) {
        suggestion.action += ` (received: ${JSON.stringify(invalidValue)})`;
      }
    } else {
      suggestion.action = `Fix validation error for field "${fieldPath}": ${error}`;
    }

    return suggestion;
  }

  /**
   * Get example value for a field based on its path
   * @param {string} fieldPath - The field path
   * @returns {string} Example value
   */
  static getFieldExample(fieldPath) {
    const lowerPath = fieldPath.toLowerCase();

    if (lowerPath.includes('name')) {
      return '"Example Name"';
    } else if (lowerPath.includes('type')) {
      return '"text"';
    } else if (lowerPath.includes('content')) {
      return '"<p>Example content</p>"';
    } else if (lowerPath.includes('title')) {
      return '"Example Title"';
    } else if (lowerPath.includes('img') || lowerPath.includes('image')) {
      return '"icons/example.png"';
    } else {
      return '"example_value"';
    }
  }

  /**
   * Get example for a specific type error
   * @param {string} error - The type error message
   * @returns {string} Type example
   */
  static getTypeExample(error) {
    if (error.includes('string')) {
      return '"string_value"';
    } else if (error.includes('number')) {
      return '42';
    } else if (error.includes('boolean')) {
      return 'true';
    } else if (error.includes('array')) {
      return '[]';
    } else if (error.includes('object')) {
      return '{}';
    } else {
      return '"example_value"';
    }
  }

  /**
   * Create AI-friendly context message for validation errors
   * @param {Object} validationDetails - Structured validation details
   * @param {Array} suggestions - Generated suggestions
   * @returns {string} AI context message
   */
  static createAIContext(validationDetails, suggestions) {
    const fieldCount = Object.keys(validationDetails).length;

    // Create detailed field-by-field guidance
    const fieldGuidance = suggestions
      .map(s => {
        let guidance = `- ${s.field}: ${s.action}`;
        if (s.example) {
          guidance += ` (example: ${s.example})`;
        }
        if (s.suggestedValue !== undefined) {
          guidance += ` (suggested: ${JSON.stringify(s.suggestedValue)})`;
        }
        return guidance;
      })
      .join('\n');

    // Add specific instructions for common FoundryVTT patterns
    let instructions = '';
    const hasIdErrors = suggestions.some(s => s.issue.includes('16-character alphanumeric'));
    const hasRequiredErrors = suggestions.some(
      s => s.issue.includes('required') || s.issue.includes('undefined')
    );
    const hasChoiceErrors = suggestions.some(s => s.issue.includes('not a valid choice'));

    if (hasIdErrors) {
      instructions +=
        '\nFor ID fields: Use foundry.utils.randomID() to generate valid 16-character alphanumeric IDs.';
    }
    if (hasRequiredErrors) {
      instructions += '\nFor required fields: Ensure all mandatory fields have non-empty values.';
    }
    if (hasChoiceErrors) {
      instructions += '\nFor choice fields: Check field schema for valid enum values.';
    }

    return `FoundryVTT validation failed on ${fieldCount} field(s). Required fixes:\n${fieldGuidance}${instructions}\n\nPlease retry with corrected field values.`;
  }

  /**
   * Create a comprehensive error response for tools
   * @param {Error} error - The original error
   * @param {string} operation - The operation that failed (e.g., "create", "update")
   * @param {string} documentType - The document type
   * @param {string} documentId - The document ID (for updates)
   * @returns {Object} Tool error response
   */
  static createToolErrorResponse(error, operation, documentType, documentId = null) {
    const validationError = this.parseFoundryValidationError(error);

    if (validationError) {
      const docRef = documentId ? `@UUID[${documentType}.${documentId}]` : documentType;

      // Enhance suggestions with schema-aware analysis
      const enhancedSuggestions = this.enhanceWithSchemaAnalysis(
        validationError.suggestions,
        documentType
      );

      // Create enhanced AI context with schema information
      const enhancedContext = this.createEnhancedAIContext(
        validationError.details,
        enhancedSuggestions,
        documentType
      );

      return {
        content: `Validation failed for ${operation} ${docRef}: ${enhancedContext}`,
        display: `❌ Validation Error: ${validationError.message}`,
        error: {
          message: validationError.message,
          type: 'VALIDATION_ERROR',
          details: validationError.details,
          suggestions: enhancedSuggestions,
          aiContext: enhancedContext,
          documentType: documentType,
          operation: operation,
        },
      };
    }

    // Fallback for non-validation errors
    const docRef = documentId ? `@UUID[${documentType}.${documentId}]` : documentType;
    return {
      content: `Failed to ${operation} ${docRef}: ${error.message}`,
      display: `❌ Failed to ${operation} ${docRef}: ${error.message}`,
      error: {
        message: error.message,
        type: `${operation.toUpperCase()}_FAILED`,
      },
    };
  }

  /**
   * Enhance suggestions with schema-aware analysis
   * @param {Array} suggestions - Original suggestions
   * @param {string} documentType - The document type
   * @returns {Array} Enhanced suggestions
   */
  static enhanceWithSchemaAnalysis(suggestions, documentType) {
    return suggestions.map(suggestion => {
      const schemaSuggestion = SchemaValidator.getFieldSuggestion(
        documentType,
        suggestion.field,
        suggestion.issue,
        suggestion.invalidValue
      );

      return {
        ...suggestion,
        schemaAnalysis: schemaSuggestion,
        correctionMethod: schemaSuggestion.correctionMethod || suggestion.action,
        schemaExample: schemaSuggestion.example || suggestion.example,
      };
    });
  }

  /**
   * Create enhanced AI context with schema information
   * @param {Object} validationDetails - Validation details
   * @param {Array} enhancedSuggestions - Schema-enhanced suggestions
   * @param {string} documentType - The document type
   * @returns {string} Enhanced AI context
   */
  static createEnhancedAIContext(validationDetails, enhancedSuggestions, documentType) {
    const fieldCount = Object.keys(validationDetails).length;

    // Create detailed field-by-field guidance with schema information
    const fieldGuidance = enhancedSuggestions
      .map(s => {
        let guidance = `- ${s.field}: ${s.correctionMethod || s.action}`;

        if (s.schemaExample) {
          guidance += ` (use: ${s.schemaExample})`;
        } else if (s.example) {
          guidance += ` (example: ${s.example})`;
        }

        if (s.schemaAnalysis?.fieldType) {
          guidance += ` [${s.schemaAnalysis.fieldType}]`;
        }

        return guidance;
      })
      .join('\n');

    // Add document-type specific instructions
    const instructions = this.getDocumentTypeInstructions(documentType, enhancedSuggestions);
    
    // Include schema reference to help AI self-correct
    const schemaRef = this.getSchemaReference(documentType);

    return `FoundryVTT ${documentType} validation failed on ${fieldCount} field(s). Required fixes:\n${fieldGuidance}${instructions}${schemaRef}\n\nPlease retry with corrected field values.`;
  }

  /**
   * Get a compact schema reference for error context
   * @param {string} documentType - The document type
   * @returns {string} Schema reference string
   */
  static getSchemaReference(documentType) {
    try {
      const schemaInfo = SchemaValidator.getDocumentSchema(documentType);
      if (!schemaInfo || !schemaInfo.fields) return '';

      const fields = Object.keys(schemaInfo.fields);
      const topLevelFields = fields.slice(0, 15); // Limit to avoid huge output
      const hasMore = fields.length > 15;

      let ref = `\n\n--- ${documentType} Schema Reference ---\n`;
      ref += `Top-level fields: ${topLevelFields.join(', ')}${hasMore ? '...' : ''}\n`;

      // Include embedded document hints
      const embeddedFields = fields.filter(f => {
        const fieldInfo = schemaInfo.fields[f];
        return fieldInfo?.type === 'EmbeddedCollectionField';
      });
      if (embeddedFields.length > 0) {
        ref += `Embedded collections: ${embeddedFields.join(', ')}\n`;
      }

      return ref;
    } catch (e) {
      return '';
    }
  }

  /**
   * Get document-type specific instructions
   * @param {string} documentType - The document type
   * @param {Array} suggestions - Enhanced suggestions
   * @returns {string} Type-specific instructions
   */
  static getDocumentTypeInstructions(documentType, suggestions) {
    let instructions = '';

    // Common FoundryVTT patterns
    const hasIdErrors = suggestions.some(s => s.issue.includes('16-character alphanumeric'));
    const hasRequiredErrors = suggestions.some(
      s => s.issue.includes('required') || s.issue.includes('undefined')
    );
    const hasChoiceErrors = suggestions.some(s => s.issue.includes('not a valid choice'));

    if (hasIdErrors) {
      instructions +=
        '\n• For ID fields: Use foundry.utils.randomID() to generate valid 16-character alphanumeric IDs.';
    }
    if (hasRequiredErrors) {
      instructions += '\n• For required fields: Ensure all mandatory fields have non-empty values.';
    }
    if (hasChoiceErrors) {
      instructions += '\n• For choice fields: Check field schema for valid enum values.';
    }

    // Document-specific instructions
    switch (documentType) {
      case 'JournalEntry':
        if (suggestions.some(s => s.field.includes('pages'))) {
          instructions +=
            '\n• For JournalEntry pages: Each page needs name, type, and appropriate content fields.';
        }
        break;
      case 'Actor':
        instructions += '\n• For Actors: Ensure type field matches system actor types.';
        break;
      case 'Item':
        instructions += '\n• For Items: Ensure type field matches system item types.';
        break;
    }

    return instructions;
  }
}
