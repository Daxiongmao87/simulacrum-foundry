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

### Major Features Implemented ✅ (2025-08-09)
- **Dynamic Image Validation**: Runtime validation with FilePicker.browse API integration
- **AI-Powered Error Recovery**: Enhanced retry mechanism with image-specific prompts
- **Professional Testing Infrastructure**: Jest framework with ES6 modules and Babel
- **Document CRUD Operations**: Full create/read/update/delete with validation
- **Tool Permission System**: Granular access control
- **Development Quality Gates**: ESLint, Prettier, Husky pre-commit hooks

### Key Components You've Built ✅ COMPLETE
- `scripts/core/image-validator.js` - Runtime image validation with caching and timeout
- `scripts/tools/validation-error-recovery.js` - Enhanced AI retry with image support
- `scripts/test/validation-error-recovery.test.js` - 100% test coverage with mocks
- `scripts/test/mocks.js` - Comprehensive FoundryVTT environment mocking
- `scripts/core/generic-crud-tools.js` - Enhanced CRUD with validation integration
- `package.json` - Professional Node.js development environment
- `jest.config.js` - ES6 module testing configuration
- `.husky/pre-commit` - Automated quality assurance hooks

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

#### Final Image Validation Implementation (2025-08-09) ✅
**GitHub Issue #17 - COMPLETED**
- **Image Validation Core**: Complete runtime validation system with FilePicker.browse integration
- **Performance Features**: 30-second caching, timeout protection, concurrent validation
- **Error Integration**: Seamless integration with AI retry mechanism (Issue #15)
- **Quality Assurance**: 100% test coverage with comprehensive edge case testing
- **Documentation**: Complete technical specifications and usage examples
- **Status**: Production-ready implementation addressing all acceptance criteria

#### AI Retry Enhancement Completion (2025-08-09) ✅
**GitHub Issue #15 - CLOSED**
- **Image-Specific Prompts**: Enhanced error recovery with image validation guidance
- **Context-Aware Corrections**: Schema-informed retry prompts with actionable suggestions
- **Tool Integration**: Recommendations for list_images tool usage in corrections
- **Comprehensive Testing**: Full Jest test suite with mocked FoundryVTT environment
- **Status**: Production-ready enhancement with proven reliability

#### Development Infrastructure Setup (2025-08-09) ✅
**Professional Workflow Implementation**
- **Jest Testing Framework**: ES6 module support with Babel transformation
- **Code Quality Gates**: ESLint integration with automatic fixing
- **Code Formatting**: Prettier integration for consistent styling
- **Git Hooks**: Husky pre-commit hooks preventing low-quality commits
- **CI/CD Ready**: Foundation for automated testing and deployment
- **Status**: Industry-standard development environment fully operational

## Quality Standards ✅ ENFORCED
- **Code Quality**: ESLint and Prettier automatically enforced via pre-commit hooks
- **Test Coverage**: Jest framework with 100% coverage achieved for validation components
- **Documentation**: JSDoc documentation implemented for all public APIs
- **Performance**: Caching, async operations, and timeout protection implemented
- **Compatibility**: Validated system-agnostic operation across FoundryVTT systems
- **Quality Gates**: Automated prevention of commits with linting errors or test failures
- **Testing Infrastructure**: Comprehensive mocking framework for isolated unit testing