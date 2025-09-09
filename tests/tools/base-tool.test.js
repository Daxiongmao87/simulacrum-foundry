/**
 * Tests for BaseTool
 */

import { BaseTool } from '../../scripts/tools/base-tool.js';
import { 
  setupMockFoundryEnvironment, 
  cleanupMockEnvironment, 
  createParameterizedSystemTests
} from '../helpers/mock-setup.js';

// Helper for test setup
function createTestBaseTool() {
  return new BaseTool('test_tool', 'A test tool', {
    type: 'object',
    properties: {
      testParam: {
        type: 'string'
      }
    }
  });
}

// Test constructor and properties (system-independent)
describe('BaseTool - constructor and properties', () => {
  let baseTool;

  beforeEach(() => {
    setupMockFoundryEnvironment('D&D 5e'); // Any system works for constructor tests
    baseTool = createTestBaseTool();
  });

  afterEach(() => {
    cleanupMockEnvironment();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(baseTool.name).toBe('test_tool');
      expect(baseTool.description).toBe('A test tool');
      expect(baseTool.schema).toEqual({
        type: 'object',
        properties: {
          testParam: {
            type: 'string'
          }
        }
      });
      expect(baseTool.requiresConfirmation).toBe(false);
    });
  });
});

// Parameterized tests across all game systems for document type validation
describe.each(createParameterizedSystemTests())(
  'BaseTool - isValidDocumentType with %s system',
  (systemName, systemConfig) => {
    let baseTool;

    beforeEach(() => {
      setupMockFoundryEnvironment(systemName);
      baseTool = createTestBaseTool();
    });

    afterEach(() => {
      cleanupMockEnvironment();
    });

    describe('validation', () => {
      it('should return true for valid document types', () => {
        const documentTypes = Object.keys(systemConfig.documentTypes);
        
        documentTypes.forEach(docType => {
          expect(baseTool.isValidDocumentType(docType))
            .toBe(true);
        });
      });

      it('should return false for invalid document types', () => {
        expect(baseTool.isValidDocumentType('InvalidType')).toBe(false);
        expect(baseTool.isValidDocumentType('NonExistentType')).toBe(false);
        expect(baseTool.isValidDocumentType('')).toBe(false);
      });

      it('should handle empty document type gracefully', () => {
        expect(baseTool.isValidDocumentType(null)).toBe(false);
        expect(baseTool.isValidDocumentType(undefined)).toBe(false);
      });
    });
  }
);

// Parameterized tests for parameter validation
describe.each(createParameterizedSystemTests())(
  'BaseTool - validateParams with %s system',
  (systemName, systemConfig) => {
    let baseTool;

    beforeEach(() => {
      setupMockFoundryEnvironment(systemName);
      baseTool = createTestBaseTool();
    });

    afterEach(() => {
      cleanupMockEnvironment();
    });

    describe('parameter validation', () => {
      it('should not throw for valid document types', () => {
        const documentTypes = Object.keys(systemConfig.documentTypes);
        
        documentTypes.forEach(docType => {
          expect(() => {
            baseTool.validateParams({ documentType: docType });
          }).not.toThrow();
        });
      });

      it('should throw for invalid document types', () => {
        expect(() => {
          baseTool.validateParams({ documentType: 'InvalidType' });
        }).toThrow('Document type "InvalidType" not available in current system');
      });

      it('should not throw when no document type is specified', () => {
        expect(() => {
          baseTool.validateParams({ otherParam: 'value' });
        }).not.toThrow();
      });

      it('should handle systems with no document types', () => {
        if (Object.keys(systemConfig.documentTypes).length === 0) {
          expect(() => {
            baseTool.validateParams({ documentType: 'AnyType' });
          }).toThrow();
        }
      });
    });
  }
);

describe('BaseTool - execute', () => {
  let baseTool;

  beforeEach(() => {
    baseTool = createTestBaseTool();
  });

  describe('method implementation', () => {
    it('should throw an error since it must be implemented by subclasses', async () => {
      await expect(baseTool.execute({}))
        .rejects
        .toThrow('Execute method must be implemented by subclasses');
    });
  });
});

describe('BaseTool - setDocumentAPI', () => {
  let baseTool;

  beforeEach(() => {
    baseTool = createTestBaseTool();
  });

  it('should set the document API instance', () => {
    const mockDocumentAPI = { test: 'api' };
    baseTool.setDocumentAPI(mockDocumentAPI);
    expect(baseTool.documentAPI).toBe(mockDocumentAPI);
  });
});

describe('BaseTool - validateParameters', () => {
  let baseTool;

  beforeEach(() => {
    baseTool = createTestBaseTool();
  });

  it('should throw when schema is not provided', () => {
    expect(() => {
      baseTool.validateParameters({}, null);
    }).toThrow('Validation schema is required');
  });

  it('should not throw for valid parameters', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' }
      },
      required: ['name']
    };
    
    expect(() => {
      baseTool.validateParameters({ name: 'test' }, schema);
    }).not.toThrow();
  });

  it('should throw for invalid parameters', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' }
      },
      required: ['name']
    };
    
    expect(() => {
      baseTool.validateParameters({}, schema);
    }).toThrow('Parameter validation failed');
  });
});

describe('BaseTool - getSchema', () => {
  let baseTool;

  beforeEach(() => {
    baseTool = createTestBaseTool();
  });

  it('should return tool schema with name, description, and parameters', () => {
    const schema = baseTool.getSchema();
    expect(schema).toEqual({
      name: 'test_tool',
      description: 'A test tool',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    });
  });
});

describe('BaseTool - getParameterSchema', () => {
  let baseTool;

  beforeEach(() => {
    baseTool = createTestBaseTool();
  });

  it('should return default parameter schema', () => {
    const paramSchema = baseTool.getParameterSchema();
    expect(paramSchema).toEqual({
      type: 'object',
      properties: {},
      required: []
    });
  });
});

describe('BaseTool - handleError', () => {
  let baseTool;

  beforeEach(() => {
    baseTool = createTestBaseTool();
    // Mock the logger to avoid console output during tests
    baseTool.logger = {
      error: jest.fn()
    };
  });

  it('should format error response correctly', () => {
    const testError = new Error('Test error message');
    const context = { userId: '123' };
    
    const result = baseTool.handleError(testError, context);
    
    expect(result).toEqual({
      success: false,
      error: {
        message: 'Test error message',
        type: 'Error',
        tool: 'test_tool',
        context: { userId: '123' }
      }
    });
    
    expect(baseTool.logger.error).toHaveBeenCalledWith('Tool test_tool failed:', testError);
  });

  it('should handle error without context', () => {
    const testError = new Error('Test error message');
    
    const result = baseTool.handleError(testError);
    
    expect(result.error.context).toEqual({});
  });
});

describe('BaseTool - createSuccessResponse', () => {
  let baseTool;

  beforeEach(() => {
    baseTool = createTestBaseTool();
  });

  it('should format success response correctly', () => {
    const testData = { result: 'success', count: 5 };
    
    const result = baseTool.createSuccessResponse(testData);
    
    expect(result).toEqual({
      success: true,
      data: { result: 'success', count: 5 },
      tool: 'test_tool'
    });
  });
});

describe('BaseTool - ensureDocumentAPI', () => {
  let baseTool;

  beforeEach(() => {
    baseTool = createTestBaseTool();
  });

  it('should throw when document API is not initialized', () => {
    expect(() => {
      baseTool.ensureDocumentAPI();
    }).toThrow('Document API not initialized');
  });

  it('should not throw when document API is initialized', () => {
    baseTool.setDocumentAPI({ test: 'api' });
    expect(() => {
      baseTool.ensureDocumentAPI();
    }).not.toThrow();
  });
});