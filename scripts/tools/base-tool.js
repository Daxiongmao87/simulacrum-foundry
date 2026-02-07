/* eslint-disable complexity, no-console */
/**
 * Base tool class for simulacrum system
 * Provides common functionality for all document manipulation tools
 */

import { SimulacrumError } from '../utils/errors.js';
import { ValidationUtils } from '../utils/validation.js';
import { createLogger } from '../utils/logger.js';

/**
 * Base tool that all other tools extend from
 */
export class BaseTool {
  /**
   * @param {string} name - Tool name
   * @param {string} description - Tool description
   * @param {Object} schema - Parameter schema (deprecated, use getParameterSchema)
   * @param {boolean} requiresConfirmation - Whether tool requires user confirmation
   * @param {boolean} responseRequired - Whether the response parameter is required (for user-facing message)
   */
  constructor(name, description, schema = null, requiresConfirmation = false, responseRequired = false) {
    this.name = name;
    this.description = description;
    this.schema = schema;
    this.requiresConfirmation = requiresConfirmation;
    this.responseRequired = responseRequired;
    this.documentAPI = null;
    this.logger = createLogger('BaseTool');
  }

  /**
   * Check if a document type is valid in the current system
   * @param {string} documentType - The document type to validate
   * @returns {boolean} True if valid, false otherwise
   */
  isValidDocumentType(documentType) {
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
   * Validate parameters including document type validation
   * @param {Object} params - Parameters to validate
   * @throws {SimulacrumError} if validation fails
   */
  validateParams(params) {
    if (params.documentType) {
      if (!this.isValidDocumentType(params.documentType)) {
        throw new SimulacrumError(
          `Document type "${params.documentType}" not available in current system`
        );
      }
    }
  }

  /**
   * Set the document API instance
   * @param {DocumentAPI} documentAPI - The document API instance
   */
  setDocumentAPI(documentAPI) {
    this.documentAPI = documentAPI;
  }

  /**
   * Validate the required parameters for tool execution
   * @param {Object} parameters - Parameters to validate
   * @param {Object} schema - The JSON Schema validation schema
   * @throws {ValidationError} if validation fails
   */
  validateParameters(parameters, schema) {
    if (!schema) {
      throw new SimulacrumError('Validation schema is required');
    }

    const result = ValidationUtils.validateParams(parameters, schema);

    if (!result.valid) {
      throw new SimulacrumError(`Parameter validation failed: ${result.errors.join(', ')}`);
    }
  }

  /**
   * Execute the tool with given parameters
   * Must be implemented by subclasses
   * @param {Object} parameters - Tool parameters
   * @returns {Promise<Object>} Result of the tool execution
   */
  async execute() {
    throw new SimulacrumError('Execute method must be implemented by subclasses');
  }

  /**
   * Get tool schema information
   * @returns {Object} Tool schema including name, description, and parameters
   */
  getSchema() {
    return {
      name: this.name,
      description: this.description,
      parameters: this.getParameterSchema(),
    };
  }

  /**
   * Get parameter schema - override in subclasses
   * Subclasses should call _addResponseParam() on their schema before returning
   * @returns {Object} Parameter schema definition
   */
  getParameterSchema() {
    return this._addResponseParam(
      this.schema || { type: 'object', properties: {}, required: [] }
    );
  }

  /**
   * Add the standard 'response' parameter to a schema
   * @param {Object} schema - The parameter schema to augment
   * @returns {Object} New schema with response parameter added (does not mutate original)
   * @protected
   */
  _addResponseParam(schema) {
    // Clone to avoid mutating the original schema
    const result = {
      ...schema,
      properties: { ...schema.properties },
      required: [...(schema.required || [])],
    };

    // Add response property
    result.properties.response = {
      type: 'string',
      description: 'Your message to the user explaining what you are doing or have done. Required for models that cannot send text alongside tool calls.',
    };

    // If responseRequired is set, add to required array
    if (this.responseRequired && !result.required.includes('response')) {
      result.required.push('response');
    }

    return result;
  }

  /**
   * Extract raw document ID from a value that may be a UUID reference.
   * Handles: "@UUID[JournalEntry.abc123]{Name}" → "abc123"
   *          "@UUID[Compendium.dnd5e.monsters.abc123]{Name}" → "abc123"
   *          "abc123" → "abc123" (passthrough)
   * @param {string} input - Raw input from AI
   * @returns {string} The extracted document ID
   */
  static extractRawId(input) {
    if (!input || typeof input !== 'string') return input;
    const match = input.match(/@UUID\[([^\]]+)\]/);
    if (match) {
      const segments = match[1].split('.');
      return segments[segments.length - 1];
    }
    return input;
  }

  /**
   * Handle errors consistently across tools
   * @param {Error} error - The error to handle
   * @param {Object} contextContext for error handling
   * @returns {Object} Formatted error response
   */
  handleError(error, context = {}) {
    this.logger.error(`Tool ${this.name} failed:`, error);

    return {
      success: false,
      error: {
        message: error.message,
        type: error.constructor.name,
        tool: this.name,
        context: context,
      },
    };
  }

  /**
   * Create success response
   * @param {Object} data - Success data
   * @returns {Object} Formatted success response
   */
  createSuccessResponse(data) {
    return {
      success: true,
      data: data,
      tool: this.name,
    };
  }

  /**
   * Check if document API is available
   * @throws {SimulacrumError} if document API is not initialized
   */
  ensureDocumentAPI() {
    if (!this.documentAPI) {
      throw new SimulacrumError('Document API not initialized');
    }
  }

  /**
   * Validate image URLs in data object (recursive).
   * Invalid images are blanked out so Foundry uses its default icon.
   * @param {Object} data - Data to validate (modified in place)
   * @returns {Promise<string[]>} Warning messages for any cleared images
   */
  async validateImageUrls(data) {
    if (!data || typeof data !== 'object') return [];

    const entries = [];

    const collect = obj => {
      for (const [key, value] of Object.entries(obj)) {
        const isImageField =
          key === 'img' ||
          key === 'src' ||
          key === 'icon' ||
          key.endsWith('.img') ||
          key.endsWith('texture.src');

        if (isImageField && typeof value === 'string' && value.trim().length > 0) {
          entries.push({ parentObj: obj, key, url: value });
        }

        if (typeof value === 'object' && value !== null) {
          collect(value);
        }
      }
    };

    collect(data);
    if (entries.length === 0) return [];

    const warnings = [];
    await Promise.all(entries.map(async ({ parentObj, key, url }) => {
      if (this.#isSimpleInvalidCheck(url) || !(await this.#checkUrlExists(url))) {
        delete parentObj[key];
        warnings.push(`'${key}' image '${url}' does not exist — removed. Foundry will use its default icon.`);
      }
    }));
    return warnings;
  }

  /**
   * Validate and correct UUID references in data using the document schema.
   * Scans for ForeignDocumentField entries, checks values, and rebuilds
   * malformed UUIDs via foundry.utils.buildUuid. Modifies data in place.
   * @param {string} documentType - The parent document type (e.g. 'Actor')
   * @param {Object} data - Data to validate (modified in place)
   * @param {string} [pack] - Compendium pack key if applicable
   * @returns {string[]} Warning messages for any corrected UUIDs
   */
  validateUuids(documentType, data, pack) {
    const warnings = [];
    if (!data || typeof data !== 'object') return warnings;

    const documentClass = CONFIG[documentType]?.documentClass;
    if (!documentClass?.schema) return warnings;

    // Walk schema fields to find all reference fields, then validate their values
    this.#validateSchemaUuids(documentClass.schema, data, pack, '', warnings);
    return warnings;
  }

  /**
   * Recursively walk schema fields looking for document reference fields.
   * @param {DataSchema} schema - Foundry schema (or sub-schema)
   * @param {Object} data - Corresponding data object
   * @param {string} pack - Pack key
   * @param {string} pathPrefix - Dot-separated path for warnings
   * @param {string[]} warnings - Collects warning messages
   */
  #validateSchemaUuids(schema, data, pack, pathPrefix, warnings) {
    if (!schema?.fields || !data) return;

    const fields = schema.fields instanceof Map
      ? Object.fromEntries(schema.fields)
      : schema.fields;

    for (const [fieldName, field] of Object.entries(fields)) {
      const value = data[fieldName];
      const fullPath = pathPrefix ? `${pathPrefix}.${fieldName}` : fieldName;
      const ctor = field?.constructor?.name;

      // ForeignDocumentField — expects a document reference
      if (ctor === 'ForeignDocumentField' && typeof value === 'string' && value.trim()) {
        const refDocName = field.model?.documentName;
        if (refDocName) {
          this.#tryCorrectUuid(data, fieldName, value, refDocName, pack, fullPath, warnings);
        }
        continue;
      }

      // Recurse into sub-schemas (e.g. system.*)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const subSchema = field?.fields ? field : field?.schema;
        if (subSchema?.fields) {
          this.#validateSchemaUuids(subSchema, value, pack, fullPath, warnings);
        }
      }
    }
  }

  /**
   * Check a single UUID value and correct it if malformed.
   */
  #tryCorrectUuid(parentObj, key, value, documentName, pack, fullPath, warnings) {
    // Extract raw ID in case the AI wrapped it in @UUID[...]{...}
    const rawId = BaseTool.extractRawId(value);

    try {
      const corrected = foundry.utils.buildUuid({ documentName, id: rawId, pack });
      if (corrected && corrected !== value) {
        parentObj[key] = corrected;
        warnings.push(`Corrected UUID for '${fullPath}': '${value}' → '${corrected}'`);
      }
    } catch {
      // buildUuid failed — leave value as-is, Foundry validation will catch it
    }
  }

  #isSimpleInvalidCheck(url) {
    if (url.includes(' ') && !url.startsWith('http')) return true;
    if (url.length > 500) return true;

    const lower = url.toLowerCase();
    if (lower.startsWith('image of') || lower.startsWith('picture of') || lower.startsWith('a '))
      return true;

    return false;
  }

  async #checkUrlExists(url) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }
}
