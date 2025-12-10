import {
  SimulacrumError,
  ValidationError,
  ToolError,
  DocumentError,
  PermissionError,
  NetworkError,
  NotFoundError,
  APIError,
  ERROR_TYPES
} from '../../scripts/utils/errors.js';

describe('SimulacrumError', () => {
  test('should create an error with message, type, and data', () => {
    const error = new SimulacrumError('Test error', 'test_type', { foo: 'bar' });

    expect(error).toBeInstanceOf(SimulacrumError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Test error');
    expect(error.type).toBe('test_type');
    expect(error.data).toEqual({ foo: 'bar' });
    expect(error.name).toBe('SimulacrumError');
  });

  test('should create an error with default empty data object', () => {
    const error = new SimulacrumError('Test error', 'test_type');

    expect(error.data).toEqual({});
  });

  test('toJSON should return structured error object', () => {
    const error = new SimulacrumError('Test', 'TEST', { key: 'value' });
    const json = error.toJSON();

    expect(json.name).toBe('SimulacrumError');
    expect(json.message).toBe('Test');
    expect(json.type).toBe('TEST');
    expect(json.data).toEqual({ key: 'value' });
    expect(json.timestamp).toBeDefined();
  });
});

describe('ValidationError', () => {
  test('should create validation error with field and value', () => {
    const error = new ValidationError('Invalid input', 'name', 123);

    expect(error.name).toBe('ValidationError');
    expect(error.type).toBe('VALIDATION_ERROR');
    expect(error.data.field).toBe('name');
    expect(error.data.value).toBe(123);
  });
});

describe('ToolError', () => {
  test('should create tool error with toolName and details', () => {
    const error = new ToolError('Tool failed', 'documentCreate', { extra: 'info' });

    expect(error.name).toBe('ToolError');
    expect(error.type).toBe('TOOL_ERROR');
    expect(error.data.toolName).toBe('documentCreate');
    expect(error.data.extra).toBe('info');
  });
});

describe('DocumentError', () => {
  test('should create document error with documentType, operation, and documentId', () => {
    const error = new DocumentError('Doc not found', 'Actor', 'read', 'abc123');

    expect(error.name).toBe('DocumentError');
    expect(error.type).toBe('DOCUMENT_ERROR');
    expect(error.data.documentType).toBe('Actor');
    expect(error.data.operation).toBe('read');
    expect(error.data.documentId).toBe('abc123');
  });
});

describe('PermissionError', () => {
  test('should create permission error with action and roles', () => {
    const error = new PermissionError('Access denied', 'delete', 'player', 'gm');

    expect(error.name).toBe('PermissionError');
    expect(error.type).toBe('PERMISSION_ERROR');
    expect(error.data.action).toBe('delete');
    expect(error.data.userRole).toBe('player');
    expect(error.data.requiredRole).toBe('gm');
  });
});

describe('NetworkError', () => {
  test('should create network error with provider, url, and status', () => {
    const error = new NetworkError('Connection failed', 'gemini', 'https://api.example.com', 500);

    expect(error.name).toBe('NetworkError');
    expect(error.type).toBe('NETWORK_ERROR');
    expect(error.data.provider).toBe('gemini');
    expect(error.data.url).toBe('https://api.example.com');
    expect(error.data.status).toBe(500);
  });
});

describe('NotFoundError', () => {
  test('should create not found error with resource and id', () => {
    const error = new NotFoundError('Resource not found', 'JournalEntry', 'xyz789');

    expect(error.name).toBe('NotFoundError');
    expect(error.type).toBe('NOT_FOUND');
    expect(error.data.resource).toBe('JournalEntry');
    expect(error.data.id).toBe('xyz789');
  });
});

describe('APIError', () => {
  test('should create API error with data', () => {
    const error = new APIError('API request failed', { endpoint: '/v1/chat', statusCode: 429 });

    expect(error.name).toBe('APIError');
    expect(error.type).toBe('API_ERROR');
    expect(error.data.endpoint).toBe('/v1/chat');
    expect(error.data.statusCode).toBe(429);
  });
});

describe('ERROR_TYPES', () => {
  test('should contain all required error types', () => {
    expect(ERROR_TYPES).toHaveProperty('DOCUMENT_NOT_FOUND');
    expect(ERROR_TYPES).toHaveProperty('PERMISSION_DENIED');
    expect(ERROR_TYPES).toHaveProperty('VALIDATION_ERROR');
    expect(ERROR_TYPES).toHaveProperty('API_ERROR');
    expect(ERROR_TYPES).toHaveProperty('UNKNOWN_DOCUMENT_TYPE');
    expect(ERROR_TYPES).toHaveProperty('CREATION_FAILED');

    // Check that the values are correct
    expect(ERROR_TYPES.DOCUMENT_NOT_FOUND).toBe('document_not_found');
    expect(ERROR_TYPES.PERMISSION_DENIED).toBe('permission_denied');
    expect(ERROR_TYPES.VALIDATION_ERROR).toBe('validation_error');
    expect(ERROR_TYPES.API_ERROR).toBe('api_error');
    expect(ERROR_TYPES.UNKNOWN_DOCUMENT_TYPE).toBe('unknown_document_type');
    expect(ERROR_TYPES.CREATION_FAILED).toBe('creation_failed');
  });
});

describe('SimulacrumError with null data', () => {
  test('should handle null data by using empty object', () => {
    const error = new SimulacrumError('Test', 'TYPE', null);
    expect(error.data).toEqual({});
  });
});

describe('Default error values', () => {
  test('ValidationError with no field or value', () => {
    const error = new ValidationError('Just a message');
    expect(error.data.field).toBeNull();
    expect(error.data.value).toBeNull();
  });

  test('ToolError with no toolName', () => {
    const error = new ToolError('Tool failed');
    expect(error.data.toolName).toBeNull();
  });

  test('DocumentError with only message', () => {
    const error = new DocumentError('Doc error');
    expect(error.data.documentType).toBeNull();
    expect(error.data.operation).toBeNull();
    expect(error.data.documentId).toBeNull();
  });

  test('PermissionError with only message', () => {
    const error = new PermissionError('No access');
    expect(error.data.action).toBeNull();
    expect(error.data.userRole).toBeNull();
    expect(error.data.requiredRole).toBeNull();
  });

  test('NetworkError with only message', () => {
    const error = new NetworkError('Connection failed');
    expect(error.data.provider).toBeNull();
    expect(error.data.url).toBeNull();
    expect(error.data.status).toBeNull();
  });

  test('NotFoundError with only message', () => {
    const error = new NotFoundError('Not found');
    expect(error.data.resource).toBeNull();
    expect(error.data.id).toBeNull();
  });

  test('APIError with no data', () => {
    const error = new APIError('API failed');
    expect(error.data).toEqual({});
  });
});