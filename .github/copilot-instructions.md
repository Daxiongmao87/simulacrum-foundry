# Copilot Instructions for Simulacrum FoundryVTT AI Module

## Project Overview
Simulacrum is a FoundryVTT v12+ module providing AI-powered campaign assistance through natural language interaction. It synthesizes four open-source projects: foundry-object-manager (dynamic document discovery), gemini-cli (agentic loop), divination-foundry (module structure), and fimlib-foundry (chat interface).

## 🚨 CRITICAL: System-Agnostic Architecture
**NEVER hardcode game system assumptions.** This module MUST work with ALL FoundryVTT systems.

- Use `DocumentDiscoveryEngine.getAvailableTypes()` for document types
- Use `FoundrySchemaExtractor.getDocumentSchema()` for schemas  
- Use `CONFIG` inspection for system-specific types
- NEVER assume D&D 5e, Pathfinder, etc. exist

## Core Architecture Patterns

### Tool-Based Architecture
Tools inherit from `Tool` base class in `scripts/tools/tool-registry.js`. The module includes 12+ comprehensive tools:
```javascript
export class MyTool extends Tool {
  constructor() {
    super('tool_name', 'Description', parameterSchema, isMarkdown, canUpdate);
  }
  
  async execute(params) {
    // Implementation
    return { success: true, result: data };
  }
  
  shouldConfirmExecute() {
    return true; // Requires user confirmation
  }
}
```

**Tool Categories**: CRUD operations, document discovery, context management, asset management, world/scene info

### Agentic Loop Pattern
`AgenticLoopController` manages AI → Tool → AI cycles:
- Handles streaming AI responses with tool calls
- Manages context windows and token tracking
- Provides cancellation and error recovery
- See `scripts/core/agentic-loop-controller.js`

### Module Structure
```
scripts/
├── main.js                 # Entry point, tool registration
├── settings.js            # FoundryVTT settings integration
├── chat/                  # AI service and chat modal
├── tools/                 # Tool implementations (CRUD, search, etc.)
├── core/                  # Core systems (agentic loop, context, etc.)
├── ui/                    # UI components
└── fimlib/                # Chat interface (git submodule)
```

## Development Workflow

### Working Commands
- ✅ `npm run lint` - ESLint validation (WORKING)
- ✅ `npm run lint:fix` - Auto-fix ESLint issues (WORKING)
- ✅ `npm run format` - Prettier formatting (WORKING)  
- ✅ `npm run prepare` - Husky git hooks setup (WORKING)
- ❌ `npm test` - Jest testing (BROKEN - ES6 module config issues)

### Docker Integration Testing
```bash
cd tests
node helpers/concurrent-docker-test-runner.js  # Requires FoundryVTT license
```

### Testing Infrastructure
Docker-based integration testing in `tests/helpers/concurrent-docker-test-runner.js`:
- Multi-version FoundryVTT testing with dynamic port allocation
- Bootstrap automation: license → system install → world creation → GM login
- **CRITICAL**: This is for BOOTSTRAP HELPERS, not integration tests
- Test configuration in `tests/config/test.config.json`
- 7-step ready state validation with 15-minute timeouts
- Progress sampling every 1 second for long operations

## Key Implementation Patterns

### Document Operations
Always use the system-agnostic document discovery:
```javascript
import { DocumentDiscoveryEngine } from './core/document-discovery-engine.js';

// Get available document types
const types = DocumentDiscoveryEngine.getAvailableTypes();

// Create documents generically
const doc = await DocumentDiscoveryEngine.createDocument(type, data);
```

### AI Integration  
AI service pattern in `scripts/chat/ai-service.js`:
- OpenAI-compatible API integration
- Streaming response handling
- Tool call parsing and execution
- Context window management
- Dynamic model detection (OpenAI, Anthropic, Ollama, local LLMs)
- Token tracking with `TokenTracker` for optimal context management

### Settings Pattern
Module settings in `scripts/settings.js` using FoundryVTT's system:
```javascript
game.settings.register('simulacrum', 'settingName', {
  name: 'Setting Display Name',
  scope: 'world',
  config: true,
  type: String,
  default: 'defaultValue'
});
```

### Error Handling
- Use try/catch with descriptive error messages
- Return structured results: `{ success: boolean, result?: any, error?: string }`
- Implement graceful degradation for API failures

## Key Files to Understand

- `scripts/main.js` - Module initialization and tool registration
- `scripts/core/agentic-loop-controller.js` - AI workflow orchestration
- `scripts/tools/tool-registry.js` - Tool base class and registry
- `scripts/core/document-discovery-engine.js` - System-agnostic document handling
- `tests/helpers/concurrent-docker-test-runner.js` - Docker testing infrastructure

## Common Tasks

### Adding New Tools
1. Create tool class extending `Tool` in `scripts/tools/`
2. Register in `scripts/main.js` tool initialization
3. Add to registry in initialization code
4. Follow system-agnostic patterns for document operations

### Debugging
- Check browser console for runtime errors
- Use FoundryVTT's `game.modules.get('simulacrum')` for module state
- Monitor API calls in Network tab
- Check `connectionState` for API accessibility
- Use `TokenTracker` for context window debugging
- Inspect `AgenticLoopController` state for AI workflow issues

### Issue Types
Based on recent development patterns:
- **BOOTSTRAP HELPER**: Modify `ConcurrentDockerTestRunner` class methods
- **INTEGRATION TEST**: Create `.test.js` files in `tests/integration/`
- **TOOL**: Create new tool class in `scripts/tools/`
- **UI**: Modify templates in `templates/` or styles in `styles/`

## Current Development Focus (2025-08-17)
- Fix Jest ES6 module configuration (testing infrastructure broken)
- UI/UX improvements: chat persistence, settings labels, theme colors
- Avoid integration tests until Jest is fixed
- Focus on manual testing and code quality tools
- Enhanced Docker testing infrastructure with bootstrap automation

## Module Configuration
Module uses ES6 modules (`"type": "module"` in package.json) with dynamic imports:
```javascript
import { DocumentDiscoveryEngine } from './core/document-discovery-engine.js';
// 45+ imports in main.js for comprehensive tool loading
```

## Essential Development Patterns

### Pre-commit Quality Gates
- Husky hooks enforce code quality: ESLint, Prettier, console validation
- Use `npm run lint:fix` for automated fixes before commits

### Code Quality Tools
- ESLint + Prettier run automatically via lint-staged
- Use `npm run lint:fix` for automated fixes before commits

### Docker Testing Infrastructure  
Multi-version FoundryVTT testing with `ConcurrentDockerTestRunner`:
- Dynamic port allocation (30000-30010) prevents conflicts
- 7-step bootstrap validation: license → system install → world creation → GM login
- 15-minute timeouts with progress sampling for complex operations
- Configuration in `tests/config/test.config.json`
