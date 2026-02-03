# Simulacrum Development Guide

## Architecture
**Layered structure:** UI → Core → AI Client → Document → Tools (see `reference/ARCHITECTURE.md`)
- **Core entry:** `scripts/simulacrum.js` - module initialization, settings, sidebar registration
- **Tool system:** All tools extend `scripts/tools/base-tool.js` and register via `scripts/core/tool-registry.js`
- **AI providers:** Abstract `AIProvider` base in `scripts/core/providers/base-provider.js` with OpenAI/Mock implementations

## Key Patterns

### Tool Development
```javascript
// All tools extend BaseTool and use this pattern:
export class MyTool extends BaseTool {
  constructor() {
    super('tool_name', 'Description for AI', schemaObject, requiresConfirmation);
  }
  async execute({ param1, param2 }) {
    // Validation happens automatically via schema
    // Use this.documentAPI for Foundry document operations
    return result;
  }
}
```
Register in `tool-registry.js` `registerDefaults()` method.

### Macro Tools (User-Extensible)
Users create Foundry macros with `const tool = { name, description, parameters, enabled: true }` in the code.
`MacroToolManager` auto-discovers and registers them (see `scripts/core/macro-tool-manager.js`).

### Document Operations
**Never use Foundry APIs directly.** Use `DocumentAPI` (scripts/core/document-api.js):
```javascript
await this.documentAPI.createDocument('Actor', data);
await this.documentAPI.getDocument('Actor', id);
```
Handles permissions, validation, and system compatibility.

### Error Handling
Use typed errors from `scripts/utils/errors.js`: `SimulacrumError`, `ToolError`, `ValidationError`, `NotFoundError`.
Tools throw errors; `ToolLoopHandler` catches and reports to AI.

## Development Workflow

**Build commands:**
- `npm run lint` - ESLint with auto-fix
- `npm run format` - Prettier formatting
- `npm run build:packs` - Build compendium packs from `packs/_source/`
- `npm run package:module` - Create release zip
- `npm test:e2e` - Run Playwright e2e tests (requires Foundry in `vendor/foundry/`)

**Deployment:** `./deploy_package.sh` - builds, packages, and copies to Foundry modules directory

**Testing:** E2E tests in `tests/e2e/` use Playwright to spin up isolated Foundry instances. See `tests/e2e/README.md`.

## Critical Conventions

### Settings
All settings use `scope: 'world'` with `config: true/false` for Foundry's settings config (see `scripts/ui/settings-interface.js`).
UI enhancements injected via `registerSettingsEnhancements()` hook on `renderSettingsConfig`.

### Conversation Persistence
`ConversationManager` (scripts/core/conversation.js) uses:
- User flags (`game.user.setFlag`) for per-user conversation history
- Tiered context: activeMessages + rollingSummary + toolOutputBuffer

### Hook Management
`HookManager` (scripts/core/hook-manager.js) prevents hook pollution during tool operations.
Use `hookManager.withHooksDisabled(async () => { ... })` for operations that shouldn't trigger UI updates.

### AI Provider Integration
All providers use OpenAI-compatible endpoints. Response normalization via `normalizeToolCall()` in `ai-normalization.js` handles minor format differences between providers.

## File Structure
- `scripts/core/` - Core engine, conversation, tool registry, AI clients
- `scripts/tools/` - Individual tool implementations
- `scripts/ui/` - Sidebar tab, settings interface, chat handler
- `scripts/utils/` - Logging, validation, error handling, retry logic
- `packs/_source/` - Source for compendium packs (built via `build-packs.js`)
- `reference/` - Architecture docs, FoundryVTT API references, external system references

## GitHub Issues
**Format:** Concise, ~10-15 lines max. Structure: "## Overview" + "## Features" + "## Implementation" (optional).
Avoid verbose explanations - be direct and actionable.
