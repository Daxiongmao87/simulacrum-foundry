/**
 * Validation utilities for the Simulacrum System
 * Provides comprehensive validation for all inputs and configurations
 */

// ValidationError currently unused but reserved for future validation enhancements

/**
 * Base validation configuration
 */
export const VALIDATION_CONFIG = {
  STRING_MAX_LENGTH: 10000,
  NAME_MAX_LENGTH: 255,
  ID_LENGTH: 16,
  FOLDER_MAX_DEPTH: 3,
};

/**
 * Validation contexts for different operations
 */
export const VALIDATION_CONTEXTS = {
  DOCUMENT: 'document',
  TOOL: 'tool',
  SYSTEM: 'system',
  NETWORK: 'network',
  UI: 'ui',
};

/**
 * Validation result object
 */
export class ValidationResult {
  constructor() {
    this.isValid = true;
    this.errors = [];
    this.warnings = [];
    this.data = {};
  }

  addError(field, message, value = null) {
    this.isValid = false;
    this.errors.push({ field, message, value });
  }

  addWarning(field, message, warning = null) {
    this.warnings.push({ field, message, warning });
  }

  toJSON() {
    return {
      isValid: this.isValid,
      errorCount: this.errors.length,
      warningCount: this.warnings.length,
      errors: this.errors,
      warnings: this.warnings,
    };
  }
}

/**
 * Generic validation functions
 */
export const validators = {
  /**
   * Validate string input
   * @param {*} value - Value to validate
   * @param {object} options - Validation options
   * @returns {ValidationResult}
   */
  string(value, options = {}) {
    const result = new ValidationResult();

    if (!this._checkStringRequired(value, options.required, result)) {
      return result;
    }

    if (value === null || value === undefined) {
      return result;
    }

    const strValue = String(value);
    this._validateStringLength(strValue, options, result);
    this._validateStringPattern(strValue, options.pattern, result);

    if (result.isValid) {
      result.data.value = strValue.trim();
    }

    return result;
  },

  _checkStringRequired(value, required, result) {
    if (required && (value === null || value === undefined || value === '')) {
      result.addError('value', 'Field is required');
      return false;
    }
    return true;
  },

  _validateStringLength(strValue, options, result) {
    const minLength = options.minLength || 0;
    const maxLength = options.maxLength || VALIDATION_CONFIG.STRING_MAX_LENGTH;

    if (strValue.length < minLength) {
      result.addError('value', `Minimum length is ${minLength}`, strValue);
    }
    if (strValue.length > maxLength) {
      result.addError('value', `Maximum length is ${maxLength}`, strValue);
    }
  },

  _validateStringPattern(strValue, pattern, result) {
    if (pattern && !pattern.test(strValue)) {
      result.addError('value', 'Value does not match required pattern', strValue);
    }
  },

  /**
   * Validate integer input
   * @param {*} value - Value to validate
   * @param {object} options - Validation options
   * @returns {ValidationResult}
   */
  integer(value, options = {}) {
    const {
      min = Number.MIN_SAFE_INTEGER,
      max = Number.MAX_SAFE_INTEGER,
      required = false,
    } = options;
    const result = new ValidationResult();

    if (required && value === null) {
      result.addError('value', 'Field is required');
      return result;
    }

    if (value === null || value === undefined) {
      return result;
    }

    const numValue = Number(value);

    if (!Number.isInteger(numValue)) {
      result.addError('value', 'Value must be an integer', value);
      return result;
    }

    if (numValue < min) {
      result.addError('value', `Minimum value is ${min}`, value);
    }

    if (numValue > max) {
      result.addError('value', `Maximum value is ${max}`, value);
    }

    if (result.isValid) {
      result.data.value = numValue;
    }

    return result;
  },

  /**
   * Validate number input (including floats)
   * @param {*} value - Value to validate
   * @param {object} options - Validation options
   * @returns {ValidationResult}
   */
  number(value, options = {}) {
    const { min = -Infinity, max = Infinity, required = false, precision = null } = options;
    const result = new ValidationResult();

    if (required && value === null) {
      result.addError('value', 'Field is required');
      return result;
    }

    if (value === null || value === undefined) {
      return result;
    }

    const numValue = Number(value);

    if (!Number.isFinite(numValue)) {
      result.addError('value', 'Value must be a valid number', value);
      return result;
    }

    if (numValue < min) {
      result.addError('value', `Minimum value is ${min}`, value);
    }

    if (numValue > max) {
      result.addError('value', `Maximum value is ${max}`, value);
    }

    if (precision !== null) {
      const factor = Math.pow(10, precision);
      const roundedValue = Math.round(numValue * factor) / factor;
      if (Math.abs(numValue - roundedValue) > 0.00001) {
        result.addWarning('value', `Value will be rounded to ${precision} decimal places`);
      }
      result.data.value = roundedValue;
    } else {
      result.data.value = numValue;
    }

    return result;
  },

  /**
   * Validate boolean input
   * @param {*} value - Value to validate
   * @param {object} options - Validation options
   * @returns {ValidationResult}
   */
  boolean(value, options = {}) {
    const { required = false } = options;
    const result = new ValidationResult();

    if (required && (value === null || value === undefined)) {
      result.addError('value', 'Field is required');
      return result;
    }

    if (value === null || value === undefined) {
      return result;
    }

    const boolValue = Boolean(value);
    result.data.value = boolValue;

    return result;
  },

  /**
   * Validate array input
   * @param {*} value - Value to validate
   * @param {object} options - Validation options
   * @returns {ValidationResult}
   */
  array(value, options = {}) {
    const { minLength = 0, maxLength = Infinity, itemValidator = null, required = false } = options;
    const result = new ValidationResult();

    if (required && !Array.isArray(value)) {
      result.addError('value', 'Field is required and must be an array');
      return result;
    }

    if (!Array.isArray(value)) {
      return result;
    }

    if (value.length < minLength) {
      result.addError('value', `Minimum array length is ${minLength}`, value);
    }

    if (value.length > maxLength) {
      result.addError('value', `Maximum array length is ${maxLength}`, value);
    }

    if (itemValidator && result.isValid) {
      value.forEach((item, index) => {
        const itemResult = itemValidator(item);
        if (!itemResult.isValid) {
          itemResult.errors.forEach(error => {
            result.addError(`[${index}].${error.field}`, error.message, error.value);
          });
        }
      });
    }

    if (result.isValid) {
      result.data.value = value;
    }

    return result;
  },

  /**
   * Validate object input
   * @param {*} value - Value to validate
   * @param {object} options - Validation options
   * @returns {ValidationResult}
   */
  object(value, options = {}) {
    const { required = false, schema = null } = options;
    const result = new ValidationResult();

    if (required && (typeof value !== 'object' || value === null || Array.isArray(value))) {
      result.addError('value', 'Field is required and must be an object');
      return result;
    }

    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return result;
    }

    if (schema) {
      Object.keys(schema).forEach(field => {
        const fieldSchema = schema[field];
        const fieldResult = this.validateField(value[field], fieldSchema);
        if (!fieldResult.isValid) {
          fieldResult.errors.forEach(error => {
            result.addError(field, error.message, value[field]);
          });
        }
      });
    }

    if (result.isValid) {
      result.data.value = value;
    }

    return result;
  },

  /**
   * Validate ObjectId/FID format
   * @param {*} value - Value to validate
   * @param {object} options - Validation options
   * @returns {ValidationResult}
   */
  objectId(value, options = {}) {
    const { required = false } = options;
    const result = new ValidationResult();

    const stringResult = this.string(value, { required, maxLength: 20 });
    if (!stringResult.isValid) {
      result.errors.push(...stringResult.errors);
      return result;
    }

    if (value !== null && value !== undefined) {
      // FoundryVTT uses random IDs of length 16
      const idPattern = /^[a-zA-Z0-9]{16}$/;
      if (!idPattern.test(value)) {
        result.addError('value', 'Invalid ObjectId format', value);
      } else {
        result.data.value = value;
      }
    }

    return result;
  },

  /**
   * Validate date input
   * @param {*} value - Value to validate
   * @param {object} options - Validation options
   * @returns {ValidationResult}
   */
  date(value, options = {}) {
    const { required = false, min = null, max = null } = options;
    const result = new ValidationResult();

    if (required && !value) {
      result.addError('value', 'Field is required');
      return result;
    }

    if (!value) {
      return result;
    }

    const dateValue = new Date(value);
    if (isNaN(dateValue.getTime())) {
      result.addError('value', 'Invalid date format', value);
      return result;
    }

    if (min && dateValue < new Date(min)) {
      result.addError('value', `Date must be after ${new Date(min)}`, value);
    }

    if (max && dateValue > new Date(max)) {
      result.addError('value', `Date must be before ${new Date(max)}`, value);
    }

    if (result.isValid) {
      result.data.value = dateValue.toISOString();
    }

    return result;
  },
};

/**
 * Advanced validation utilities
 */
export class ValidationEngine {
  /**
   * Validate multiple fields at once
   * @param {object} data - Data to validate
   * @param {object} schema - Validation schema
   * @returns {ValidationResult}
   */
  validateFields(data, schema) {
    const result = new ValidationResult();

    Object.keys(schema).forEach(field => {
      const fieldSchema = schema[field];
      const fieldName = fieldSchema.name || field;
      const value = data[field];

      if (fieldSchema.required && (value === undefined || value === null)) {
        result.addError(fieldName, `${fieldName} is required`, value);
        return;
      }

      if (value === undefined || value === null) {
        return;
      }

      const validator = validators[fieldSchema.type];
      if (!validator) {
        result.addError(fieldName, `Unknown validator type: ${fieldSchema.type}`);
        return;
      }

      const fieldResult = validator(value, fieldSchema);
      if (!fieldResult.isValid) {
        fieldResult.errors.forEach(error => {
          result.addError(`${fieldName}(${error.field})`, error.message, error.value);
        });
      } else {
        result.data[field] = fieldResult.data.value;
      }
    });

    return result;
  }

  /**
   * Sanitize input data
   * @param {*} value - Value to sanitize
   * @param {string} type - Type of sanitization
   * @returns {Promise<*>}
   */
  async sanitize(value, type) {
    switch (type) {
      case 'string':
        return String(value).trim();
      case 'html':
        return this.sanitizeHTML(String(value));
      case 'filename':
        return this.sanitizeFilename(String(value));
      case 'path':
        return this.sanitizePath(String(value));
      default:
        return value;
    }
  }

  /**
   * Sanitize HTML content
   * @param {string} html - HTML to sanitize
   * @returns {string}
   */
  sanitizeHTML(html) {
    // Basic HTML sanitization - can be enhanced based on FoundryVTT's DOMPurify
    let sanitized = html;

    // Remove script tags and event handlers
    sanitized = sanitized.replace(/<(script|style)[^>]*>(.|\n)*?<(\/\1|)>/gi, '');
    sanitized = sanitized.replace(/on\w+\s*=/gi, 'data-invalid=');

    return sanitized;
  }

  /**
   * Sanitize filename
   * @param {string} filename - Filename to sanitize
   * @returns {string}
   */
  sanitizeFilename(filename) {
    return filename
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/[\t\n]/g, '')
      .trim()
      .substring(0, VALIDATION_CONFIG.NAME_MAX_LENGTH);
  }

  /**
   * Sanitize path
   * @param {string} path - Path to sanitize
   * @returns {string}
   */
  sanitizePath(path) {
    return path
      .replace(/\.\//g, '')
      .replace(/\.\.\//g, '')
      .replace(/\/+/g, '/')
      .replace(/\/$/, '');
  }

  /**
   * Validate configuration object
   * @param {object} config - Configuration to validate
   * @param {object} schema - Configuration schema
   * @returns {ValidationResult}
   */
  validateConfiguration(config, schema) {
    return this.validateFields(config, schema);
  }

  /**
   * Validate API parameters
   * @param {object} params - API parameters to validate
   * @param {object} schema - API schema
   * @returns {ValidationResult}
   */
  validateAPIParams(params, schema) {
    return this.validateFields(params, schema);
  }
}

// Export singleton validator engine
export const validator = new ValidationEngine();

// Predefined schemas for common operations
export const PREDEFINED_SCHEMAS = {
  document: {
    name: { type: 'string', required: true, minLength: 1, maxLength: 100 },
    type: { type: 'string', required: true, minLength: 1, maxLength: 50 },
    id: { type: 'objectId', required: false },
  },

  pagination: {
    page: { type: 'integer', required: false, min: 1, default: 1 },
    limit: { type: 'integer', required: false, min: 1, max: 100, default: 50 },
    sort: { type: 'string', required: false, default: 'name' },
  },

  search: {
    query: { type: 'string', required: true, minLength: 1, maxLength: 1000 },
    types: { type: 'array', required: false, itemValidator: validators.string },
    includeContent: { type: 'boolean', required: false, default: false },
  },
};

/**
 * ValidationUtils - Compatible interface for tests
 */
export class ValidationUtils {
  /**
   * Validate parameters against JSON Schema
   * @param {object} params - Parameters to validate
   * @param {object} schema - JSON Schema format
   * @returns {object} - Result with valid boolean and errors array
   */
  // eslint-disable-next-line complexity
  static validateParams(params, schema) {
    const result = new ValidationResult();

    if (!schema || typeof schema !== 'object') {
      result.addError('schema', 'Invalid schema provided');
      return {
        valid: result.isValid,
        errors: result.errors.map(error => error.message),
      };
    }

    // Handle JSON Schema format
    if (schema.type === 'object') {
      if (schema.required) {
        // Check required fields
        schema.required.forEach(field => {
          if (
            !Object.prototype.hasOwnProperty.call(params, field) ||
            params[field] === undefined ||
            params[field] === null
          ) {
            result.addError(field, `Missing required parameter: ${field}`);
          }
        });
      }

      if (schema.properties) {
        // Validate property types
        // eslint-disable-next-line complexity
        Object.keys(schema.properties).forEach(field => {
          const fieldSchema = schema.properties[field];
          const value = params[field];

          // Only validate type if the field exists (null/undefined are handled by required check above)
          if (Object.prototype.hasOwnProperty.call(params, field)) {
            if (fieldSchema.type === 'string' && typeof value !== 'string') {
              result.addError(field, `Parameter ${field} must be a string`);
            } else if (fieldSchema.type === 'number' && typeof value !== 'number') {
              result.addError(field, `Parameter ${field} must be a number`);
            } else if (fieldSchema.type === 'boolean' && typeof value !== 'boolean') {
              result.addError(field, `Parameter ${field} must be a boolean`);
            } else if (
              fieldSchema.type === 'object' &&
              (typeof value !== 'object' || value === null || Array.isArray(value))
            ) {
              result.addError(field, `Parameter ${field} must be an object`);
            }
          }
        });
      }
    }

    return {
      valid: result.isValid,
      errors: result.errors.map(error => error.message),
    };
  }

  /**
   * Validate document data
   * @param {object} data - Document data to validate
   * @param {string} documentType - Type of document
   * @returns {object} - Result with valid boolean and errors array
   */
  static validateDocumentData(data) {
    const result = new ValidationResult();

    if (data === null || data === undefined) {
      result.addError('data', 'Document data must be an object');
    } else if (typeof data !== 'object' || Array.isArray(data)) {
      result.addError('data', 'Document data must be an object');
    }

    return {
      valid: result.isValid,
      errors: result.errors.map(error => error.message),
    };
  }
}

// Export all utilities
export default {
  validators,
  validator,
  ValidationResult,
  ValidationEngine,
  ValidationUtils,
  PREDEFINED_SCHEMAS,
  VALIDATION_CONFIG,
  VALIDATION_CONTEXTS,
};
