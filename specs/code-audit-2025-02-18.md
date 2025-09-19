# Simulacrum Code Audit — 2025-02-18

## Scope
- Reviewed every JavaScript module under `scripts/`, including core orchestrators, tools, UI, utilities, and the main entry point.
- Verified legacy-tool behavior, provider assumptions, and interaction boundaries identified during Gemini-research discussion.

## Module Summaries

### Core Modules
- `scripts/core/ai-client.js`: OpenAI-style chat client with retry logic, token budgeting, and provider registry. Strict `/v1` base URL enforcement and OpenAI-specific schemas will require refactor for Gemini (different endpoints/auth). No auto legacy fallback; legacy behavior still manual via setting.
- `scripts/core/argument-mapper.js`: Normalizes legacy tool-call arguments (notably `create_document`). Uses first available document type as fallback.
- `scripts/core/chat-handler.js`: Coordinates UI inputs, retries, tool loop, and parse-error corrections. Legacy-mode flag controls tool schema inclusion.
- `scripts/core/conversation-engine.js`: Handles a single user turn, performing parse-error retries before invoking the tool loop.
- `scripts/core/conversation.js`: Tracks conversation state, token estimation, truncation compression, and auto-save triggers.
- `scripts/core/correction.js`: Appends corrective system prompts when the assistant returns empty content.
- `scripts/core/document-api.js`: System-agnostic CRUD/search wrapper with permission gating and Foundry validation integration. Provides fallbacks when Foundry utilities are unavailable.
- `scripts/core/simulacrum-core.js`: Initializes AI client, registers tools, manages persistence, exposes system prompts, and mediates legacy vs native tool mode.
- `scripts/core/tool-loop-handler.js`: Active tool execution loop with retry guard, parse-error remediation, legacy inline JSON fallback, and diagnostics.
- `scripts/core/tool-loop-handler-old.js`: Deprecated loop retained for reference/tests; includes extensive correction/hook handling.
- `scripts/core/tool-registry.js`: Singleton registry managing registration, execution, dependencies, and stats. Named export restored; hook APIs removed.
- `scripts/core/tool-verification.js`: Post-tool verification helper that re-reads documents after create/update.

### Tool Modules
- `scripts/tools/base-tool.js`: Defines shared validation/error helpers for all tools.
- `scripts/tools/document-create.js`: Validates inputs, routes to `DocumentAPI.createDocument`, surfaces Foundry validation errors via `ValidationErrorHandler`.
- `scripts/tools/document-delete.js`: Deletes documents with confirmation and structured error handling.
- `scripts/tools/document-list.js`: Lists document types or documents with optional filters; summarises outputs for display.
- `scripts/tools/document-read.js`: Reads documents by type/id, currently returns simple display string without embedded expansion.
- `scripts/tools/document-schema.js`: Surfaces schema metadata and document type stats via introspection helpers.
- `scripts/tools/document-search.js`: Performs substring searches across document types/fields.
- `scripts/tools/document-update.js`: Updates documents, logs verbosely, routes validation errors through `ValidationErrorHandler`.

### UI Modules
- `scripts/ui/conversation-commands.js`: Implements `/clear`, `/compress`, `/stats` commands.
- `scripts/ui/confirmation.js`: Standard confirmation/info dialog helpers using Foundry `Dialog`.
- `scripts/ui/chat-interface.js`: Chat command integration (`/sim`), piping requests to `SimulacrumCore`.
- `scripts/ui/panel-interface.js`: Legacied Application-based panel stub; handles basic chat submission.
- `scripts/ui/settings-interface.js`: FormApplication with provider presets (OpenAI/Ollama/custom), validation, connection testing, advanced settings registration, and textarea enhancement.
- `scripts/ui/simulacrum-sidebar-tab.js`: Main Foundry v13 sidebar tab handling log rendering, actions, `<think>` collapsing, and active-process tracking.

### Utility Modules
- `scripts/utils/ai-normalization.js`: Normalizes responses, sanitizes legacy payloads, parses inline tool JSON, logs diagnostics.
- `scripts/utils/content-processor.js`: Converts `<think>` tags to collapsible spoilers.
- `scripts/utils/dev.js`: Debug toggles (note: default export references `createLogger` without import).
- `scripts/utils/errors.js`: Error hierarchy and associated constants.
- `scripts/utils/logger.js`: Logging abstraction with global debug toggle.
- `scripts/utils/permissions.js`: Permission checks/filtering with fallbacks and diagnostics.
- `scripts/utils/schema-introspection.js`: Detects schema references (ForeignDocumentField, arrays).
- `scripts/utils/schema-validator.js`: Provides schema metadata extraction and validation suggestions.
- `scripts/utils/tokenizer.js`: Word-count based token estimation adapter.
- `scripts/utils/validation.js`: Rich validation toolkit (primitive validators, sanitizers, schema helpers).
- `scripts/utils/validation-errors.js`: Transforms Foundry validation errors into AI-friendly guidance using schema insights.

### Entry Point
- `scripts/simulacrum.js`: Module bootstrap—registers settings, preloads templates, registers sidebar tab, and exposes `SimulacrumCore` globally.

## Key Findings / Issues
- `scripts/utils/dev.js:33-49`: Default export references `createLogger` but never imports it—dead export or missing import; needs correction.
- `tests/core/tool-registry.test.js` still expects removed hook APIs (`addHook`, `removeHook`); suite fails accordingly. Either restore compat layer or update tests/specs.
- `scripts/core/ai-client.js` assumes OpenAI `/v1` endpoints and bearer auth, with JSON body/response shapes; incompatible with Gemini API (needs new provider or refactor).
- `scripts/ui/settings-interface.js` enforces `/v1` base URLs and only presets OpenAI/Ollama; Gemini support requires expanded provider handling, validation, and messaging.
- Legacy tool fallback remains manual (`legacyMode` setting); no automatic detection for tool-less models (e.g., `llm7`). Document behavior accordingly.
- Several TODO-style gaps noted (e.g., `DocumentReadTool` `includeEmbedded` flag is unused; panel interface minimal).

## Recommendations
- Track remediation work in dedicated specs (see accompanying future-work documents).
- When implementing new providers (Gemini), introduce explicit provider selection rather than URL heuristics and maintain manual legacy-mode toggling until auto-detection is scoped.
