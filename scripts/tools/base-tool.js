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
   * Validate image URLs in data object (recursive)
   * @param {Object} data - Data to validate
   * @throws {SimulacrumError} if invalid URL found
   */
  async validateImageUrls(data) {
    if (!data || typeof data !== 'object') return;

    const validationPromises = [];

    // Helper to collect promises
    const collectPromises = obj => {
      for (const [key, value] of Object.entries(obj)) {
        // targeted keys: img, texture.src, valid image fields, or any key ending in .img/.src
        // Common Foundry image fields: img, src, texture.src, icon, banner
        const isImageField =
          key === 'img' ||
          key === 'src' ||
          key === 'icon' ||
          key.endsWith('.img') ||
          key.endsWith('texture.src');

        if (isImageField) {
          if (typeof value === 'string' && value.trim().length > 0) {
            validationPromises.push(this.#validateSingleUrl(key, value));
          }
        }

        if (typeof value === 'object' && value !== null) {
          collectPromises(value);
        }
      }
    };

    collectPromises(data);

    if (validationPromises.length > 0) {
      await Promise.all(validationPromises);
    }
  }

  async #validateSingleUrl(key, url) {
    if (this.#isSimpleInvalidCheck(url)) {
      throw new SimulacrumError(
        `Invalid image URL for field '${key}': '${url}'. Value must be a valid file path or URL, not a description.`
      );
    }

    // Perform network check
    const exists = await this.#checkUrlExists(url);
    if (!exists) {
      throw new SimulacrumError(
        `Invalid image URL for field '${key}': '${url}'. The file does not exist (404). Please use the 'search_assets' tool to find a valid image path.`
      );
    }
  }

  #isSimpleInvalidCheck(url) {
    // Reject descriptions or obvious non-URLs
    if (url.includes(' ') && !url.startsWith('http')) return true; // URLs with spaces usually encoded
    if (url.length > 500) return true; // Too long

    const lower = url.toLowerCase();
    // Heuristic: reject "natural language" starts
    if (lower.startsWith('image of') || lower.startsWith('picture of') || lower.startsWith('a '))
      return true;

    return false;
  }

  async #checkUrlExists(url) {
    try {
      // In Foundry, relative paths are common. Fetch handles them relative to base.
      // Use method: 'HEAD' to avoid downloading the whole image.
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      // Network error or other fetch failure -> treat as non-existent for safety
      if (isDebugEnabled()) {
        this.logger.warn(`Failed to check image URL '${url}':`, error);
      }
      return false;
    }
  }
}
