/**
 * Custom error classes for the Simulacrum System
 * Provides consistent error handling across the application
 */

/**
 * Base error class for all Simulacrum errors
 * @extends Error
 */
export class SimulacrumError extends Error {
  constructor(message, type = 'SIMULACRUM_ERROR', data = {}) {
    super(message);
    this.name = 'SimulacrumError';
    this.type = type;
    this.data = data || {};
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      data: this.data,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

/**
 * Error thrown when a validation operation fails
 * @extends SimulacrumError
 */
export class ValidationError extends SimulacrumError {
  constructor(message, field = null, value = null) {
    super(message, 'VALIDATION_ERROR', { field, value });
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when a tool operation fails
 * @extends SimulacrumError
 */
export class ToolError extends SimulacrumError {
  constructor(message, toolName = null, details = null) {
    super(message, 'TOOL_ERROR', { toolName, ...details });
    this.name = 'ToolError';
  }
}

/**
 * Error thrown when a document operation fails
 * @extends SimulacrumError
 */
export class DocumentError extends SimulacrumError {
  constructor(message, documentType = null, operation = null, documentId = null) {
    super(message, 'DOCUMENT_ERROR', { documentType, operation, documentId });
    this.name = 'DocumentError';
  }
}

/**
 * Error thrown when a permission or authorization operation fails
 * @extends SimulacrumError
 */
export class PermissionError extends SimulacrumError {
  constructor(message, action = null, userRole = null, requiredRole = null) {
    super(message, 'PERMISSION_ERROR', { action, userRole, requiredRole });
    this.name = 'PermissionError';
  }
}

/**
 * Error thrown when a network or AI provider operation fails
 * @extends SimulacrumError
 */
export class NetworkError extends SimulacrumError {
  constructor(message, provider = null, url = null, status = null) {
    super(message, 'NETWORK_ERROR', { provider, url, status });
    this.name = 'NetworkError';
  }
}

/**
 * Error thrown when a resource is not found
 * @extends SimulacrumError
 */
export class NotFoundError extends SimulacrumError {
  constructor(message, resource = null, id = null) {
    super(message, 'NOT_FOUND', { resource, id });
    this.name = 'NotFoundError';
  }
}

/**
 * Helper function to wrap errors in SimulacrumError instances
 * @param {Error} error - The original error
 * @param {string} fallbackCode - Fallback error code
 * @returns {SimulacrumError}
 */
// wrapError removed (unused)

/**
 * Creates an error recovery object
 * @param {SimulacrumError} error - The error to recover from
 * @param {object} context - Context information about the recovery attempt
 * @returns {object}
 */
// createRecoveryContext removed (unused)

/**
 * API error for external API failures
 */
export class APIError extends SimulacrumError {
  constructor(message, data = {}) {
    super(message, 'API_ERROR', data);
    this.name = 'APIError';
  }
}

// Export error types as constants (for test compatibility)
export const ERROR_TYPES = {
  DOCUMENT_NOT_FOUND: 'document_not_found',
  PERMISSION_DENIED: 'permission_denied',
  VALIDATION_ERROR: 'validation_error',
  API_ERROR: 'api_error',
  UNKNOWN_DOCUMENT_TYPE: 'unknown_document_type',
  CREATION_FAILED: 'creation_failed',
};

// Export error codes as constants
export const ERROR_CODES = {
  SIMULACRUM_ERROR: 'SIMULACRUM_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  TOOL_ERROR: 'TOOL_ERROR',
  DOCUMENT_ERROR: 'DOCUMENT_ERROR',
  PERMISSION_ERROR: 'PERMISSION_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  API_ERROR: 'API_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

// Export all error types for convenience
export default {
  SimulacrumError,
  ValidationError,
  ToolError,
  DocumentError,
  PermissionError,
  NetworkError,
  NotFoundError,
  APIError,
  ERROR_CODES,
  ERROR_TYPES,
};
