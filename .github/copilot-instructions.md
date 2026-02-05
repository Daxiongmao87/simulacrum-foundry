# Simulacrum Development Guide

## Architecture
**Layered structure:** UI → Core → AI Client → Document → Tools (see `reference/ARCHITECTURE.md`)
- **Entry:** `scripts/simulacrum.js` → `SimulacrumCore` orchestrates all subsystems
- **Data flow:** User → `ChatHandler` → `ConversationEngine` → `AIClient` → `ToolLoopHandler` → `ToolRegistry` → `DocumentAPI`
- **AI providers:** `OpenAIProvider`, `GeminiProvider`, `MockAIProvider` all extend `AIProvider` base class

## Tool Development Pattern
```javascript
// scripts/tools/my-tool.js - All tools extend BaseTool
export class MyTool extends BaseTool {
  constructor() {
    super('tool_name', 'Description for AI', schema, requiresConfirmation, responseRequired);
  }
  async execute({ param1, param2 }) {
    // Use this.documentAPI for ALL Foundry document operations - never raw Foundry APIs
    return result; // Returned to AI as tool result
  }
}
```
Register in `tool-registry.js` `registerDefaults()` array. Tools auto-receive `DocumentAPI` injection.

## Document Operations
**Always use `DocumentAPI`** (`scripts/core/document-api.js`) - handles permissions, validation, system compatibility:
```javascript
await this.documentAPI.createDocument('Actor', data);
await this.documentAPI.getDocument('Actor', id);
```

## Error Handling
Use typed errors from `scripts/utils/errors.js`: `SimulacrumError`, `ToolError`, `ValidationError`, `NotFoundError`.
Tools throw errors; `ToolLoopHandler` catches and reports to AI for self-correction.

## Development Commands
```bash
npm run lint          # ESLint with auto-fix
npm run format        # Prettier formatting
npm run build:packs   # Build compendium packs from packs/_source/
npm run dead-code     # Knip dead code detection
npm run test:e2e      # Playwright E2E (requires vendor/foundry/ setup)
./deploy_package.sh   # Build, package, deploy to Foundry server
```

## Compendium Packs
Source files in `packs/_source/{pack-name}/`. Each JSON document requires `_key` field:
```json
{ "_id": "abc123", "_key": "!macros!abc123", "name": "Tool Name" }
```
Format: `!{plural-type}!{id}` (e.g., `!macros!`, `!actors!`, `!items!`)

## Critical Conventions
- **Hook isolation:** Use `hookManager.withHooksDisabled(async () => {...})` to prevent UI side effects during tool ops
- **AI normalization:** `ai-normalization.js` unifies OpenAI `tool_calls` and Gemini `functionCall` formats
- **Settings:** All `scope: 'world'`, `config: false` - custom UI via `SettingsInterface`
- **Conversation:** `ConversationManager` persists via `game.user.setFlag` with tiered context

## Commit Format (Conventional Commits)
```bash
git commit -m "feat: add feature description (Fixes #123)"
git commit -m "fix: resolve bug description (Closes #45)"
```
Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `ci`

## File Structure
- `scripts/core/` - Engine, conversation, tool registry, AI clients, providers
- `scripts/tools/` - Tool implementations (extend `BaseTool`)
- `scripts/ui/` - Sidebar, settings, chat handler
- `scripts/utils/` - Logger, validation, errors, retry helpers
- `reference/` - Architecture docs, Foundry/dnd5e/pf2e API references
