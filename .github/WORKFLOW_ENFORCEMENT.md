# WORKFLOW ENFORCEMENT: DEVELOPMENT GUIDELINES

## DEVELOPMENT WORKFLOW

### Code Quality Standards
- **ESLint**: Use `npm run lint` for validation and `npm run lint:fix` for auto-fixing issues.
- **Prettier**: Use `npm run format` for code formatting.
- **Console Prefixes**: All console.log statements must use `'Simulacrum | '` prefix.

### Git Workflow
- **Commit Messages**: Provide clear, descriptive commit messages that explain what was changed and why.
- **Pre-commit Hooks**: Husky git hooks are set up (`npm run prepare`) to enforce code quality. Do NOT bypass these hooks.
- **Feature Branches**: Work on feature branches (e.g., `git checkout -b feature-name`).

### Testing Requirements
- **Unit Tests**: Create unit tests for new functionality in `tests/unit/v12/` or `tests/unit/v13/`.
- **Integration Tests**: Create integration tests for new features in `tests/integration/v12/` or `tests/integration/v13/`.
- **Test Coverage**: Ensure adequate test coverage for new code.

### Implementation Guidelines

#### Tool-Based Architecture
- All tools extend the `Tool` base class in `scripts/tools/tool-registry.js`.
- Implement `execute(params)` in subclasses.
- Override `shouldConfirmExecute()` if the tool does not require user confirmation (defaults to `true`).
- Define `parameterSchema` using JSON schema for input validation.

#### System-Agnostic Architecture
**NEVER hardcode game system assumptions.** This module MUST work with ALL FoundryVTT systems.
- Use `DocumentDiscoveryEngine.getAvailableTypes()` for document types.
- Use `FoundrySchemaExtractor.getDocumentSchema()` for schemas.
- Use `CONFIG` inspection for system-specific types.
- NEVER assume D&D 5e, Pathfinder, etc., exist.

#### Document Operations
- Always use the system-agnostic `DocumentDiscoveryEngine` from `scripts/core/document-discovery-engine.js` for discovering, normalizing, and interacting with Foundry VTT document types.
- Use `GenericCRUDTools` from `scripts/core/generic-crud-tools.js` for creating, reading, updating, and deleting documents.

#### AI Integration
- Follow the AI service pattern in `scripts/chat/ai-service.js` for OpenAI-compatible API integration, streaming responses, and tool call parsing.
- Utilize `ModelDetector` and `ContextWindowDetector` (`scripts/core/`) for dynamic AI model and context window detection.
- Employ `TokenTracker` (`scripts/core/`) for managing context window limits and truncating tool results for AI consumption.

#### Settings Pattern
- Register module settings using FoundryVTT's system as demonstrated in `scripts/settings.js`.
- Leverage dynamic settings for `modelName` and `contextLength` based on API detection.

#### Error Handling
- Implement robust `try/catch` blocks.
- Return structured results: `{ success: boolean, result?: any, error?: string }`.
- Ensure graceful degradation for API failures using `SimulacrumError` and `ErrorRecoveryManager` (`scripts/error-handling.js`).

### Testing and Verification

#### Working Commands
- `npm run lint` - ESLint validation
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Prettier formatting
- `npm run prepare` - Husky git hooks setup
- `npm test` - Jest testing (Currently broken due to ES6 module config issues; avoid relying on this until fixed).

#### Docker Integration Testing
- The project uses a sophisticated Docker-based integration testing infrastructure, detailed in `tests/README.md`.
- Use `node tests/run-tests.js` to execute integration tests.
- **CRITICAL**: Understand the distinction between "BOOTSTRAP HELPER" (modifying `tests/helpers/concurrent-docker-test-runner.js` or related bootstrap files) and "INTEGRATION TEST" (creating `.test.js` files in `tests/integration/`).
- For manual debugging of the bootstrap process, use `node tests/run-tests.js --manual`.

### Key Files to Understand

- `scripts/main.js`: Module initialization and tool registration.
- `scripts/core/agentic-loop-controller.js`: AI workflow orchestration.
- `scripts/tools/tool-registry.js`: Tool base class and registry.
- `scripts/core/document-discovery-engine.js`: System-agnostic document handling.
- `scripts/settings.js`: Module settings integration.
- `scripts/error-handling.js`: Comprehensive error handling system.
- `tests/run-tests.js`: Main test orchestrator.
- `tests/README.md`: Detailed documentation for the testing infrastructure.
- `.github/copilot-instructions.md`: Detailed project overview and architectural patterns.