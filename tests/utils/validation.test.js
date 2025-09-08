/**
 * Tests for ValidationUtils
 */

import { 
  ValidationUtils, 
  ValidationResult, 
  validators, 
  VALIDATION_CONFIG, 
  VALIDATION_CONTEXTS 
} from '../../scripts/utils/validation.js';

function createBasicSchema() {
  return {
    type: 'object',
    required: ['name', 'type'],
    properties: {
      name: { type: 'string' },
      type: { type: 'string' }
    }
  };
}

function createTypedSchema() {
  return {
    type: 'object',
    properties: {
      name: { type: 'string' },
      count: { type: 'number' },
      active: { type: 'boolean' },
      data: { type: 'object' },
      items: { type: 'array' }
    }
  };
}

function testInvalidDocumentData(testData, expectedMessage) {
  const result = ValidationUtils.validateDocumentData(testData, 'Actor');
  expect(result.valid).toBe(false);
  expect(result.errors).toContain(expectedMessage);
}

describe('ValidationUtils - validateParams', () => {
  it('should validate required parameters', () => {
    const schema = createBasicSchema();
    const params = { name: 'Test', type: 'Actor' };
    const result = ValidationUtils.validateParams(params, schema);
    
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should detect missing required parameters', () => {
    const schema = createBasicSchema();
    const params = { name: 'Test' }; // missing 'type'
    const result = ValidationUtils.validateParams(params, schema);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required parameter: type');
  });

  it('should validate parameter types', () => {
    const schema = createTypedSchema();
    const params = {
      name: 'Test',
      count: 5,
      active: true,
      data: { key: 'value' },
      items: ['item1', 'item2']
    };
    
    const result = ValidationUtils.validateParams(params, schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should detect type mismatches', () => {
    const schema = createTypedSchema();
    const params = {
      name: 123, // should be string
      count: 'five' // should be number
    };
    
    const result = ValidationUtils.validateParams(params, schema);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Parameter name must be a string');
    expect(result.errors).toContain('Parameter count must be a number');
  });
});

describe('ValidationUtils - validateDocumentData', () => {
  it('should validate document data objects', () => {
    const data = { name: 'Test Actor', type: 'character' };
    const result = ValidationUtils.validateDocumentData(data, 'Actor');
    
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  // eslint-disable-next-line jest/expect-expect
  it('should reject non-object data', () => {
    testInvalidDocumentData(null, 'Document data must be an object');
    testInvalidDocumentData('string', 'Document data must be an object');
    testInvalidDocumentData(123, 'Document data must be an object');
  });

  it('should accept empty objects', () => {
    const data = {};
    const result = ValidationUtils.validateDocumentData(data, 'Actor');
    
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('ValidationResult', () => {
  it('should initialize with valid state', () => {
    const result = new ValidationResult();
    
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.data).toEqual({});
  });

  it('should add errors and mark as invalid', () => {
    const result = new ValidationResult();
    result.addError('field1', 'Error message', 'value');
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([
      { field: 'field1', message: 'Error message', value: 'value' }
    ]);
  });

  it('should add warnings without affecting validity', () => {
    const result = new ValidationResult();
    result.addWarning('field1', 'Warning message', 'warning');
    
    expect(result.isValid).toBe(true);
    expect(result.warnings).toEqual([
      { field: 'field1', message: 'Warning message', warning: 'warning' }
    ]);
  });

  it('should serialize to JSON correctly', () => {
    const result = new ValidationResult();
    result.addError('field1', 'Error');
    result.addWarning('field2', 'Warning');
    
    const json = result.toJSON();
    
    expect(json).toEqual({
      isValid: false,
      errorCount: 1,
      warningCount: 1,
      errors: [{ field: 'field1', message: 'Error', value: null }],
      warnings: [{ field: 'field2', message: 'Warning', warning: null }]
    });
  });
});

describe('VALIDATION_CONFIG', () => {
  it('should export configuration constants', () => {
    expect(VALIDATION_CONFIG.STRING_MAX_LENGTH).toBe(10000);
    expect(VALIDATION_CONFIG.NAME_MAX_LENGTH).toBe(255);
    expect(VALIDATION_CONFIG.ID_LENGTH).toBe(16);
    expect(VALIDATION_CONFIG.FOLDER_MAX_DEPTH).toBe(3);
  });
});

describe('VALIDATION_CONTEXTS', () => {
  it('should export context constants', () => {
    expect(VALIDATION_CONTEXTS.DOCUMENT).toBe('document');
    expect(VALIDATION_CONTEXTS.TOOL).toBe('tool');
    expect(VALIDATION_CONTEXTS.SYSTEM).toBe('system');
    expect(VALIDATION_CONTEXTS.NETWORK).toBe('network');
    expect(VALIDATION_CONTEXTS.UI).toBe('ui');
  });
});

describe('validators - string', () => {
  it('should validate valid strings', () => {
    const result = validators.string('test value');
    
    expect(result.isValid).toBe(true);
    expect(result.data.value).toBe('test value');
  });

  it('should trim strings', () => {
    const result = validators.string('  spaced  ');
    
    expect(result.isValid).toBe(true);
    expect(result.data.value).toBe('spaced');
  });

  it('should handle null and undefined when not required', () => {
    expect(validators.string(null).isValid).toBe(true);
    expect(validators.string(undefined).isValid).toBe(true);
  });

  it('should reject null/undefined when required', () => {
    const result = validators.string(null, { required: true });
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'value', message: 'Field is required' })
    );
  });

  it('should reject empty strings when required', () => {
    const result = validators.string('', { required: true });
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'value', message: 'Field is required' })
    );
  });

  it('should validate minimum length', () => {
    const result = validators.string('ab', { minLength: 3 });
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'value', message: 'Minimum length is 3' })
    );
  });

  it('should validate maximum length', () => {
    const longString = 'a'.repeat(101);
    const result = validators.string(longString, { maxLength: 100 });
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'value', message: 'Maximum length is 100' })
    );
  });

  it('should validate regex patterns', () => {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const result = validators.string('invalid-email', { pattern: emailPattern });
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ 
        field: 'value', 
        message: 'Value does not match required pattern' 
      })
    );
  });

  it('should pass regex pattern validation', () => {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const result = validators.string('test@example.com', { pattern: emailPattern });
    
    expect(result.isValid).toBe(true);
  });
});

describe('validators - integer', () => {
  it('should validate valid integers', () => {
    const result = validators.integer(42);
    
    expect(result.isValid).toBe(true);
    expect(result.data.value).toBe(42);
  });

  it('should handle string numbers', () => {
    const result = validators.integer('123');
    
    expect(result.isValid).toBe(true);
    expect(result.data.value).toBe(123);
  });

  it('should reject non-integers', () => {
    const result = validators.integer(3.14);
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'value', message: 'Value must be an integer' })
    );
  });

  it('should reject non-numeric values', () => {
    const result = validators.integer('not-a-number');
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'value', message: 'Value must be an integer' })
    );
  });

  it('should validate minimum values', () => {
    const result = validators.integer(5, { min: 10 });
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'value', message: 'Minimum value is 10' })
    );
  });

  it('should validate maximum values', () => {
    const result = validators.integer(15, { max: 10 });
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'value', message: 'Maximum value is 10' })
    );
  });

  it('should handle null when not required', () => {
    const result = validators.integer(null);
    
    expect(result.isValid).toBe(true);
  });

  it('should reject null when required', () => {
    const result = validators.integer(null, { required: true });
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'value', message: 'Field is required' })
    );
  });
});

describe('validators - number', () => {
  it('should validate valid numbers', () => {
    const result = validators.number(3.14);
    
    expect(result.isValid).toBe(true);
    expect(result.data.value).toBe(3.14);
  });

  it('should handle string numbers', () => {
    const result = validators.number('3.14');
    
    expect(result.isValid).toBe(true);
    expect(result.data.value).toBe(3.14);
  });

  it('should reject invalid numbers', () => {
    const result = validators.number('not a number');
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'value', message: 'Value must be a valid number' })
    );
  });

  it('should validate min/max ranges', () => {
    const tooLow = validators.number(5, { min: 10 });
    expect(tooLow.isValid).toBe(false);
    expect(tooLow.errors).toContainEqual(
      expect.objectContaining({ field: 'value', message: 'Minimum value is 10' })
    );

    const tooHigh = validators.number(15, { max: 10 });
    expect(tooHigh.isValid).toBe(false);
    expect(tooHigh.errors).toContainEqual(
      expect.objectContaining({ field: 'value', message: 'Maximum value is 10' })
    );
  });

  it('should handle precision rounding', () => {
    const result = validators.number(3.14159, { precision: 2 });
    
    expect(result.isValid).toBe(true);
    expect(result.data.value).toBe(3.14);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ field: 'value', message: expect.stringContaining('rounded') })
    );
  });

  it('should handle null when not required', () => {
    const result = validators.number(null);
    
    expect(result.isValid).toBe(true);
  });

  it('should reject null when required', () => {
    const result = validators.number(null, { required: true });
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'value', message: 'Field is required' })
    );
  });
});

describe('validators - boolean', () => {
  it('should validate valid booleans', () => {
    expect(validators.boolean(true).isValid).toBe(true);
    expect(validators.boolean(false).isValid).toBe(true);
    expect(validators.boolean(true).data.value).toBe(true);
    expect(validators.boolean(false).data.value).toBe(false);
  });

  it('should convert truthy values to boolean', () => {
    expect(validators.boolean('yes').data.value).toBe(true);
    expect(validators.boolean(1).data.value).toBe(true);
    expect(validators.boolean({}).data.value).toBe(true);
  });

  it('should convert falsy values to boolean', () => {
    expect(validators.boolean('').data.value).toBe(false);
    expect(validators.boolean(0).data.value).toBe(false);
  });

  it('should handle null when not required', () => {
    const result = validators.boolean(null);
    expect(result.isValid).toBe(true);
  });

  it('should reject null when required', () => {
    const result = validators.boolean(null, { required: true });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'value', message: 'Field is required' })
    );
  });

  it('should handle undefined when not required', () => {
    const result = validators.boolean(undefined);
    expect(result.isValid).toBe(true);
  });

  it('should reject undefined when required', () => {
    const result = validators.boolean(undefined, { required: true });
    expect(result.isValid).toBe(false);
  });
});

describe('validators - array', () => {
  it('should validate valid arrays', () => {
    const result = validators.array([1, 2, 3]);
    expect(result.isValid).toBe(true);
    expect(result.data.value).toEqual([1, 2, 3]);
  });

  it('should handle empty arrays', () => {
    const result = validators.array([]);
    expect(result.isValid).toBe(true);
    expect(result.data.value).toEqual([]);
  });

  it('should ignore non-arrays when not required', () => {
    const result = validators.array('not an array');
    expect(result.isValid).toBe(true); // Returns valid but doesn't set value
  });

  it('should handle null when not required', () => {
    const result = validators.array(null);
    expect(result.isValid).toBe(true);
  });

  it('should reject null when required', () => {
    const result = validators.array(null, { required: true });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'value', message: 'Field is required and must be an array' })
    );
  });

  it('should validate minimum length', () => {
    const result = validators.array([1], { minLength: 2 });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'value', message: 'Minimum array length is 2' })
    );
  });

  it('should validate maximum length', () => {
    const result = validators.array([1, 2, 3], { maxLength: 2 });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'value', message: 'Maximum array length is 2' })
    );
  });

  it('should pass length validation', () => {
    const result = validators.array([1, 2], { minLength: 2, maxLength: 3 });
    expect(result.isValid).toBe(true);
  });
});

describe('ValidationUtils - edge cases and additional coverage', () => {
  it('should handle invalid schema in validateParams', () => {
    const params = { name: 'test' };
    const invalidSchema = null;
    
    const result = ValidationUtils.validateParams(params, invalidSchema);
    
    // Invalid schema should return false but not crash
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('should handle missing required properties in validateParams', () => {
    const params = {};
    const schema = {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' }
      }
    };
    
    const result = ValidationUtils.validateParams(params, schema);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required parameter: name');
  });

  it('should validate type mismatches in validateParams', () => {
    const params = { 
      name: 123, // should be string
      count: 'not-a-number' // should be number
    };
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        count: { type: 'number' }
      }
    };
    
    const result = ValidationUtils.validateParams(params, schema);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(err => err.includes('must be a string'))).toBe(true);
    expect(result.errors.some(err => err.includes('must be a number'))).toBe(true);
  });

  it('should handle boolean type validation in validateParams', () => {
    const params = { 
      active: 'not-a-boolean' // should be boolean
    };
    const schema = {
      type: 'object',
      properties: {
        active: { type: 'boolean' }
      }
    };
    
    const result = ValidationUtils.validateParams(params, schema);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(err => err.includes('must be a boolean'))).toBe(true);
  });

  it('should handle null document data in validateDocumentData', () => {
    const result = ValidationUtils.validateDocumentData(null);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Document data must be an object');
  });

  it('should handle array document data in validateDocumentData', () => {
    const result = ValidationUtils.validateDocumentData([1, 2, 3]);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Document data must be an object');
  });

  it('should handle valid object document data in validateDocumentData', () => {
    const result = ValidationUtils.validateDocumentData({ name: 'test' });
    
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});