import { SimulacrumError, ERROR_TYPES } from '../../scripts/utils/errors.js';

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