# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [1.0.8] - 2026-02-08

### Changed
- refactor(benchmark): replace webhook with guided Discord sharing flow
- chore(benchmark): switch webhook to public channel, drop review language
- fix(benchmark): note that Discord submissions are reviewed
- chore(benchmark): rotate Discord webhook to private verification channel
- fix(benchmark): increase failure penalty, hide bonus, add Discord link
- docs(tools): rewrite all 16 tool descriptions and parameter descriptions
- refactor(tools): align BaseTool helpers with {content, display} contract
- fix(tools): remove 50-result cap from asset search and browse folders
- fix(prompts): correct pack name in macro list builder
- refactor(ui): simplify sidebar tool display rendering
- fix(settings): invalidate model list on API key/URL change
- fix(tools): add API retry loop with backoff, soften justification enforcement
- feat(logger): human-readable interaction log export
- fix(documents): preserve uuid through toObject() serialization
- refactor(ai): remove max_tokens and temperature from AI client
- feat(tools): split schema tool, add subtype support, fix benchmark scoring
- feat(benchmark): add Grunk Benchmark macro
- chore(build): add JS injection to pack builds, exclude source from zips
- fix(tools): make end_loop response optional, auto-close task tracker
- fix(tools): auto-correct invalid document IDs on creation retry
- fix(tools): validate image URLs and UUIDs non-destructively
- fix(tools): prevent schema mutation, enforce justification, fix parameter ordering
- refactor(tokens): strip transient fields from history, trim prompts, fix UUID-as-documentId
- refactor(ui): rename thinking to processing, fix renderTemplate calls
- refactor(chat): handle cancellation before error logging
- feat(macro-tools): add response parameter and structured result wrapping
- fix(search): guard against null fields parameter in searchDocuments

## [1.0.7] - 2026-02-06

### Changed
- fix: Ollama integration - race conditions, non-blocking validation, token limit consolidation
- fix(ci): Fix shell quoting in Discord announcement step

## [1.0.6] - 2026-02-05

### Changed
- fix(ui): Restore status bar styling and task tracker regressions
- fix(ui): Remove leftover _monitorStatus call causing crash
- fix(ui): Restore status bar and indexing status logic
- feat: Add context limit handling and sidebar UI refinements
- fix: restore tool justification expand/collapse functionality
- fix: restore model selector logic lost in commit 169670fb
- fix(chat): holistic architecture audit and serialization hardening
- Fix: Synchronize Chat UI and persistence logic
- fix: wrap merged message content in div to prevent text running together
- fix: await async onToolResult callbacks to prevent race conditions in message display
- fix: reset task-tracker to inactive state when stop button pressed
- fix: show truncation notice with release link in Discord announcements

## [1.0.5] - 2026-02-03

### Changed
- fix: preserve textarea content and status area on thinking state change
- fix: extract proper content summary for direct display tools
- fix: prevent raw JSON from rendering for direct display tools
- fix: clear task tracker on process cancel, fix blank card race condition
- fix: swap content/display in document-search for consistency
- feat: migrate asset index to IndexedDB with UI status indicator
- fix: show pending tool cards during execution, update in place with result
- fix: prevent duplicate step separators in task management
- fix: render input part when thinking state changes
- feat: add response parameter to all tools for Gemini compatibility
- feat: add model selector combobox to sidebar header
- refactor: remove Gemini provider, use OpenAI-compatible endpoints only

## [1.0.4] - 2026-02-03

### Changed
- fix: make disabled sidebar tab properly inert and V12 compatibility
- style: refine Discord link appearance in settings
- fix: add Discord link to Foundry settings config, remove dead code
- feat: gray out sidebar tab when AI endpoint not configured or invalid
- Revert "fix: improve endpoint configuration validation logic"
- fix: improve endpoint configuration validation logic
- fix: hide sidebar tab for non-GMs and show config prompt when unconfigured
- feat: add Discord community link to module and settings UI

## [1.0.3] - 2026-01-31

### Changed
- fix: restore system-agnostic CSS for Carolingian UX compatibility

## [1.0.2] - 2026-01-31

### Changed
- ci: switch to manual workflow_dispatch for releases
- docs: add CONTRIBUTING.md with commit conventions
- fix: correct content/display pattern in list_documents tool
- feat: collapse tool justifications by default for completed tools (Ref #105)
- fix: update read registry after successful document update
- docs: suggest 200-line default chunk size for read_tool_output
- docs: reorganize README badges with prominent Discord and FoundryVTT links
- ci: add Discord announcement on release
- chore: update build info
- ci: auto-convert README to HTML for FoundryVTT package description
- feat: show task name in task tracker header
- feat: add step separators and skip justification for self-explanatory tools
- docs: add badges to README
- chore: remove DETERMINISM_THESIS.md
- fix: ensure live and reload chat display are consistent
- fix: improve validation error capture and propagation to AI agent
- fix: restore task summary display in chat
- feat: add dynamic CONFIG-based enum lookup for schema validation
- feat: Add task tracker UI with scroll fade effects
- feat: add indexed asset search with background sync
- fix: correct YAML syntax in changelog generation heredoc
- fix: add explicit tag check to prevent workflow file parsing failures
- fix: prevent duplication of tool loop thoughts in conversation history
- feat: implement schema normalization for document inspection to resolve context overflow issues
- fix: prevent context overflow from large tool outputs
- fix: remove oneOf from execute_macro schema for Anthropic compatibility
- feat: auto-update CHANGELOG.md on release
## [1.0.0] - 2026-01-12

### Added
- Initial public release of Simulacrum: AI Campaign Copilot
- Natural language document management (create, read, update, delete)
- Multi-provider AI support (OpenAI, Google Gemini, Anthropic, and OpenAI-compatible APIs)
- Intelligent tool system for interacting with Foundry VTT documents
- Task tracking and multi-step operation support
- Conversation history with context compaction
- Custom macro-based tool extensions
- JavaScript execution tool for advanced automation
- Comprehensive system prompt for strategic AI behavior
- GM-only access controls
