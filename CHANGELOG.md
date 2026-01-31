# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


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
