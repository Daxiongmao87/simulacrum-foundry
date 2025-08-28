# Simulacrum FoundryVTT Unit Testing

## Overview

This directory contains the complete unit testing infrastructure for the Simulacrum FoundryVTT module. The testing system focuses exclusively on **unit tests** for fast, reliable feedback during development.

## Quick Start

### Running Unit Tests

```bash
# Run all unit tests
npm test

# Run unit tests for specific version
npm run test:unit:v13

# Run tests via orchestrator
node tests/run-tests.js

# Run with specific version
node tests/run-tests.js -v v13

# List available tests
node tests/run-tests.js --list-tests
```

### Manual FoundryVTT Testing

For manual testing with live FoundryVTT sessions:

```bash
# Launch FoundryVTT for manual testing (replaces old integration tests)
node tests/launch-foundry.js

# Launch with specific version and system
node tests/launch-foundry.js -v v13 -s dnd5e

# This will:
# 1. Bootstrap a complete FoundryVTT environment
# 2. Enable the Simulacrum module
# 3. Wait for you to press ESC to cleanup
```

## Architecture

### Unit Tests Only (`tests/unit/v13/`)

**Purpose**: Fast, isolated testing of individual components  
**Scope**: Component logic, error handling, data validation

- **Fast Execution**: All tests complete in < 2 seconds
- **Isolated Components**: Each test focuses on a single unit
- **Comprehensive Mocking**: All external dependencies mocked
- **System Agnostic**: Tests work regardless of FoundryVTT game system

### Test Orchestrator (`run-tests.js`)

**Purpose**: Execute unit tests with proper setup and reporting  
**Scope**: Test execution coordination and result reporting

- **Jest Integration**: Runs Jest tests with proper configuration
- **Version Support**: Currently supports FoundryVTT v13
- **Result Reporting**: Detailed success/failure reporting with timing

### Manual Testing (`launch-foundry.js`)

**Purpose**: Launch live FoundryVTT sessions for manual testing  
**Scope**: Manual validation and integration testing

- **Bootstrap Infrastructure**: Complete FoundryVTT environment setup
- **Interactive Testing**: Manual UI testing and validation
- **System Testing**: Validate across different game systems

## File Structure

```
tests/
├── README.md                           # This documentation
├── run-tests.js                        # Unit test orchestrator
├── launch-foundry.js                   # Manual testing launcher
├── config/
│   └── test.config.json                # Test configuration
├── unit/
│   └── v13/                           # FoundryVTT v13 unit tests
│       ├── jest.config.js             # Jest configuration
│       ├── jest.setup.js              # Global test setup
│       ├── context-manager.test.js    # ContextManager tests
│       ├── json-response-parser.test.js # JSON response parser tests
│       ├── logger.test.js             # Logger system tests
│       └── sample.test.js             # Sample test template
├── bootstrap/                         # Manual testing infrastructure
│   ├── bootstrap-runner.js           # Manual testing orchestrator
│   ├── stages/                       # Bootstrap stages
│   └── common/                       # Shared utilities
└── artifacts/                        # Test outputs (coverage, screenshots)
```

## Writing Unit Tests

### Unit Test Philosophy

Unit tests should test **individual components in isolation**, with all external dependencies mocked. Focus on testing the component's logic, not its integration with other systems.

### Unit Test Structure

```javascript
// tests/unit/v13/my-component.test.js

import { jest } from '@jest/globals';
import { MyComponent } from '../../../scripts/my-component.js';

describe('MyComponent', () => {
  let component;
  let mockDependency;

  beforeEach(() => {
    // Setup fresh mocks for each test
    mockDependency = {
      method: jest.fn().mockReturnValue('mock-result')
    };
    
    // Create component with mocked dependencies
    component = new MyComponent(mockDependency);
  });

  describe('method', () => {
    it('should handle valid input correctly', () => {
      const input = { valid: 'data' };
      const result = component.method(input);
      
      expect(result).toBe('expected-result');
      expect(mockDependency.method).toHaveBeenCalledWith(input);
    });

    it('should handle invalid input gracefully', () => {
      const invalidInput = null;
      
      expect(() => component.method(invalidInput))
        .toThrow('Invalid input');
    });

    it('should handle dependency failures', () => {
      mockDependency.method.mockImplementation(() => {
        throw new Error('Dependency failed');
      });
      
      const result = component.method({ data: 'test' });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Dependency failed');
    });
  });
});
```

### Required Test Patterns

#### ✅ DO: Test Component Logic

```javascript
// GOOD: Test the component's actual behavior
it('should calculate damage correctly', () => {
  const damage = calculator.calculateDamage(10, 0.5);
  expect(damage).toBe(5);
});
```

#### ✅ DO: Test Error Conditions

```javascript
// GOOD: Test how component handles errors
it('should throw error for negative input', () => {
  expect(() => calculator.calculateDamage(-1, 0.5))
    .toThrow('Damage cannot be negative');
});
```

#### ✅ DO: Mock External Dependencies

```javascript
// GOOD: Mock all external dependencies
const mockAiService = {
  sendMessage: jest.fn().mockResolvedValue('AI response')
};
const component = new MyComponent(mockAiService);
```

#### ❌ DON'T: Test Implementation Details

```javascript
// BAD: Testing private method names or internal structure
expect(component._privateMethod).toHaveBeenCalled();
```

#### ❌ DON'T: Test External Systems

```javascript
// BAD: Testing FoundryVTT's internal behavior
expect(game.actors.get).toHaveBeenCalled();
```

### Unit Test Requirements

All unit tests must include:

1. **Isolated Testing**: Test only the component under test
2. **Comprehensive Mocking**: Mock all external dependencies
3. **Error Testing**: Test both success and failure scenarios
4. **Fast Execution**: Each test should run in milliseconds
5. **Descriptive Names**: Clear test names describing what is tested
6. **Proper Setup/Teardown**: Use beforeEach/afterEach for clean state

### Test Categories

#### **Happy Path Tests**
- Test normal operation with valid inputs
- Verify expected outputs and behavior
- Ensure component works as designed

#### **Error Handling Tests**
- Test invalid inputs and edge cases
- Verify error messages and recovery
- Ensure graceful failure modes

#### **Boundary Tests**
- Test minimum and maximum values
- Test empty/null/undefined inputs
- Test limits and constraints

#### **State Management Tests**
- Test component state changes
- Verify state consistency
- Test state transitions

### Mocking Best Practices

#### Global Mocks (jest.setup.js)

```javascript
// Global mocks for FoundryVTT objects
global.game = {
  simulacrum: {
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn()
    }
  },
  settings: {
    get: jest.fn(),
    set: jest.fn()
  }
};
```

#### Component-Specific Mocks

```javascript
// Mock specific to your test
const mockAiService = {
  sendMessage: jest.fn()
    .mockResolvedValueOnce('First response')
    .mockResolvedValueOnce('Second response')
    .mockRejectedValueOnce(new Error('Service failed'))
};
```

### Pass/Fail Scenarios

#### Test Must Pass When:
- Component handles all valid inputs correctly
- Error conditions are handled gracefully
- All mocked dependencies are called as expected
- Component state remains consistent
- No unexpected side effects occur

#### Test Must Fail When:
- Component logic is incorrect
- Error handling is missing or broken
- Dependencies are not properly mocked
- Component state becomes inconsistent
- Unexpected exceptions are thrown

## Configuration

### Test Configuration (`test.config.json`)

```json
{
  "foundry-versions": ["v13"],
  "foundry-systems": ["dnd5e", "pf2e"],
  "foundryLicenseKey": "YOUR-LICENSE-KEY",
  "docker": {
    "portBeginning": 30050,
    "maxConcurrentInstances": 1
  }
}
```

### Jest Configuration (`jest.config.js`)

```javascript
export default {
  testEnvironment: 'node',
  transform: {},
  extensionsToTreatAsEsm: ['.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: [
    '../../../scripts/**/*.js',
    '!../../../scripts/fimlib/**'
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80
    }
  }
};
```

## Adding New Tests

### Creating a New Test File

1. Create test file in `tests/unit/v13/`
2. Follow the naming convention: `component-name.test.js`
3. Use the test structure template above
4. Import the component you're testing
5. Mock all external dependencies

### Test Naming Convention

- **File naming**: `component-name.test.js`
- **Test descriptions**: Use clear, descriptive names
- **Test groups**: Group related tests in `describe` blocks

```javascript
// GOOD naming
describe('ContextManager', () => {
  describe('addDocument', () => {
    it('should add a new document to context', () => {
      // Test implementation
    });
    
    it('should prevent duplicate documents', () => {
      // Test implementation
    });
  });
});
```

## Prerequisites

1. **Node.js**: Node.js 18+ with ES module support
2. **Jest**: Automatically installed via npm dependencies
3. **FoundryVTT License**: Required only for manual testing with `launch-foundry.js`
4. **Docker**: Required only for manual testing with `launch-foundry.js`

## Troubleshooting

### Common Issues

**"Jest tests failing with import errors"**
- Ensure Jest configuration is correct in `jest.config.js`
- Check that ES modules are properly configured
- Verify file paths in import statements

**"Global mocks not working"**
- Check `jest.setup.js` is properly loaded
- Ensure global objects are mocked before test execution
- Verify mock functions are properly configured

**"Tests running too slowly"**
- Unit tests should complete in < 2 seconds total
- Check for unmocked external dependencies
- Avoid real file I/O or network calls in unit tests

### Debug Mode

```bash
# Run tests with verbose output
npm test -- --verbose

# Run specific test file
npm test -- --testPathPattern="context-manager"

# Generate coverage report
npm test -- --coverage
```

## Coverage Requirements

All unit tests must maintain:
- **80% statement coverage**
- **80% branch coverage**  
- **80% function coverage**
- **80% line coverage**

Coverage reports are generated in `tests/unit/v13/coverage/` and should not be committed to version control.

## Contributing

When adding new unit tests:

1. **Follow Architecture**: Test components in isolation
2. **Mock Everything**: Mock all external dependencies
3. **Test Thoroughly**: Include happy path, error cases, and boundaries
4. **Fast Execution**: Keep tests under 2 seconds total
5. **Documentation**: Update this README for new patterns or requirements

### Test Review Checklist

- [ ] Test is isolated (no external dependencies)
- [ ] All dependencies are properly mocked
- [ ] Both success and error cases are tested
- [ ] Test names are clear and descriptive
- [ ] Test execution is fast (milliseconds)
- [ ] Coverage requirements are met
- [ ] No test implementation details are tested