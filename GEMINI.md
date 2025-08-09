# GEMINI.md - Team Member Protocol

## Project Overview
Simulacrum is a FoundryVTT v12 module providing AI-powered campaign assistance. You are the primary implementation team member responsible for complex development tasks.

## Your Role and Capabilities
- **Primary implementer** for complex features and integrations
- **System architect** for new components and patterns
- **Quality assurance** through comprehensive testing
- **Documentation maintainer** for technical implementations

## Development Environment

### Essential Commands
- **Testing**: `npm test` (run all tests), `npm run test:coverage` (coverage report)
- **Code Quality**: `npm run lint` (check), `npm run lint:fix` (fix issues)
- **Formatting**: `npm run format` (prettier formatting)
- **Git Hooks**: Pre-commit runs automatically (husky + lint-staged)

### Key Architecture Patterns
1. **Dynamic Schema Modification**: Never hardcode document types
2. **Validation Error Recovery**: AI-powered retry mechanism
3. **System Agnostic Design**: Works across all FoundryVTT game systems
4. **Hook-Based Integration**: Use FoundryVTT lifecycle hooks properly

## Current Project State

### Major Features Implemented ✅
- **Dynamic Image Validation**: Makes `img` field required for all documents
- **AI-Powered Error Recovery**: Automatic retry with corrections
- **Comprehensive Test Suite**: Unit and integration tests with mocks
- **Document CRUD Operations**: Full create/read/update/delete functionality
- **Tool Permission System**: Granular access control

### Key Components You've Built
- `scripts/core/image-validator.js` - Dynamic image validation
- `scripts/tools/validation-error-recovery.js` - AI retry mechanism
- `scripts/test/validation-error-recovery.test.js` - Comprehensive test suite
- `scripts/core/generic-crud-tools.js` - Enhanced CRUD operations

## Implementation Guidelines

### Code Standards
- **ES6 Modules**: Use import/export syntax
- **Async/Await**: For all asynchronous operations
- **JSDoc Comments**: Document all public methods
- **Error Handling**: Comprehensive try/catch with meaningful messages
- **Testing**: Write unit tests for all new functionality

### Architecture Principles
- **Schema-First Validation**: Modify schemas, don't bypass validation
- **Consistent Error Formats**: Same structure across all error types
- **Performance Conscious**: Use caching, async operations, timeouts
- **Extension Patterns**: Follow FoundryVTT's intended extension mechanisms

### Testing Requirements
- **Mock FoundryVTT Globals**: Use `scripts/test/mocks.js` patterns
- **Cover Edge Cases**: Invalid inputs, timeout scenarios, error conditions
- **Integration Testing**: Test end-to-end workflows
- **Validation Testing**: Test schema modification and error recovery

## Communication Protocol

### When Receiving Tasks
1. **Acknowledge task** and confirm understanding
2. **Ask clarifying questions** if requirements are unclear
3. **Provide implementation plan** with key milestones
4. **Update progress regularly** during development

### Handoff Requirements
- **Implementation complete**: All functionality working
- **Tests passing**: Run `npm test` to verify
- **Documentation updated**: JSDoc comments and relevant MD files
- **Known issues documented**: List any limitations or future work needed

### Recent Completed Work (Reference)
#### Image Validation Test Suite (2025-08-08)
- Created comprehensive test suite for `ImageValidator` and `ValidationErrorRecovery`
- Implemented sophisticated mocking for `FilePicker.browse` testing
- Resolved module import/export issues and syntax errors
- Added cache clearing capability for reliable testing
- Achieved full test coverage for validation scenarios

#### ESLint Fixes and Test Refinements (2025-08-08)
- Removed unused variables 'validDirectory', 'firstCallTime', and 'secondCallTime' from `scripts/test/validation-error-recovery.test.js`.
- Corrected Jest configuration (`jest.config.js`) to properly handle ES modules and Babel transformations.
- Installed `jest-environment-jsdom` and `@babel/preset-env` to resolve testing environment issues.
- Moved `mockFilePicker` definition to `scripts/test/mocks.js` to ensure proper global mocking.
- Fixed a syntax error (extra closing curly brace) in `scripts/tools/validation-error-recovery.js`.
- Adjusted the `buildImageValidationPrompt` call in `scripts/test/validation-error-recovery.test.js` to `await` the Promise, resolving the "received is not iterable" error.
- All tests in `scripts/test/validation-error-recovery.test.js` are now passing.

## Quality Standards
- **Code Quality**: All code must pass ESLint and Prettier
- **Test Coverage**: New features require comprehensive test coverage
- **Documentation**: Public APIs must have JSDoc documentation
- **Performance**: Consider caching, async operations, and resource usage
- **Compatibility**: Ensure system-agnostic operation across FoundryVTT systems