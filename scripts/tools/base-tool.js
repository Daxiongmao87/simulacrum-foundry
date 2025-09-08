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
  constructor(name, description, schema = null) {
    this.name = name;
    this.description = description;
    this.schema = schema;
    this.requiresConfirmation = false;
    this.documentAPI = null;
    this.logger = createLogger('BaseTool');
  }

  /**
   * Check if a document type is valid in the current system
   * @param {string} documentType - The document type to validate
   * @returns {boolean} True if valid, false otherwise
   */
  isValidDocumentType(documentType) {
    return !!(global.CONFIG?.Document?.documentTypes?.[documentType]);
  }

  /**
   * Validate parameters including document type validation
   * @param {Object} params - Parameters to validate
   * @throws {SimulacrumError} if validation fails
   */
  validateParams(params) {
    if (params.documentType) {
      if (!this.isValidDocumentType(params.documentType)) {
        throw new SimulacrumError(`Document type "${params.documentType}" not available in current system`);
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
      parameters: this.getParameterSchema()
    };
  }

  /**
   * Get parameter schema - override in subclasses
   * @returns {Object} Parameter schema definition
   */
  getParameterSchema() {
    return {
      type: 'object',
      properties: {},
      required: []
    };
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
        context: context
      }
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
      tool: this.name
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
}