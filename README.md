# Simulacrum - AI-Powered FoundryVTT Module

Simulacrum is a comprehensive AI-powered FoundryVTT v12+ module that provides campaign assistance through natural language interaction. It features a sophisticated tool-based architecture with agentic AI loops and system-agnostic design that works with all FoundryVTT game systems.

## FoundryVTT API Research

When developing this module or creating tests, it is essential to research and understand the FoundryVTT API documentation for the target versions:

### API Documentation Links

- **FoundryVTT v13 API**: https://foundryvtt.com/api/v13/index.html
- **FoundryVTT v12 API**: https://foundryvtt.com/api/v12/index.html
- **General API Pattern**: https://foundryvtt.com/api/<version>/index.html

### Why API Research is Critical

1. **Version Compatibility**: FoundryVTT APIs can change between versions. Always consult the appropriate version's documentation.

2. **System-Agnostic Development**: This module is designed to work with ALL FoundryVTT game systems. Use the API documentation to understand core FoundryVTT concepts rather than system-specific implementations.

3. **Document Types & Schemas**: The API documentation provides comprehensive information about document types, their schemas, and available methods.

4. **Testing Accuracy**: Proper tests require understanding the exact API behavior for the version being tested.

### Key API Areas to Research

- **Document Classes**: Actor, Item, Scene, User, etc.
- **Collection Methods**: CRUD operations on document collections
- **Hook System**: Events and lifecycle hooks
- **Settings API**: Module configuration and user preferences
- **Canvas API**: Scene rendering and interaction
- **Socket Communication**: Real-time data synchronization

### Development Workflow

1. **Before Implementation**: Research the relevant API documentation for your target FoundryVTT version
2. **During Development**: Reference API docs for method signatures, parameters, and return values
3. **Testing**: Use API documentation to create accurate test scenarios and validate behavior
4. **Cross-Version Support**: Compare API differences between v12 and v13 when implementing features

## Quick Start

See [CLAUDE.md](./CLAUDE.md) for comprehensive development instructions, including:

- Essential development commands
- Core architecture overview
- Testing infrastructure
- Code quality standards
- Git workflow requirements

## Project Structure

- `scripts/` - Core module functionality
- `tests/` - Comprehensive testing infrastructure
- `docs/` - Documentation and development guides
- `tools/` - Development utilities and build scripts

## Development Commands

```bash
# Quality checks
npm run lint              # ESLint validation
npm run format            # Prettier code formatting
npm run quality:check     # Combined lint and console validation

# Testing
npm test                  # Run all unit tests
node tests/run-tests.js   # Run integration tests

# Development
npm run prepare           # Install git hooks
```

For detailed instructions, see [CLAUDE.md](./CLAUDE.md).