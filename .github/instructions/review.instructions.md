---
applyTo: '**'
excludeAgent: 'cloud-agent'
---

# Simulacrum Code Review Instructions

## Critical Rules (flag as errors)

- All Foundry document operations MUST go through `DocumentAPI` (`scripts/core/document-api.js`) — never use raw Foundry APIs like `Actor.create()`, `Item.update()`, etc.
- Tools MUST extend `BaseTool` (`scripts/tools/base-tool.js`) and be registered in `tool-registry.js` `registerDefaults()`
- Document operations inside tools MUST use `hookManager.withHooksDisabled()` to prevent UI side effects
- All errors MUST use typed errors from `scripts/utils/errors.js` (`SimulacrumError`, `ToolError`, `ValidationError`, `NotFoundError`) — never throw plain `Error`
- ES modules only — no CommonJS (`require`, `module.exports`). The only exception is `.eslintrc.cjs`
- Import paths MUST include `.js` extensions
- Settings MUST use `scope: 'world'`, `config: false` — custom UI is handled via `SettingsInterface`
- AI provider implementations MUST extend `AIProvider` base class

## Style Rules (flag as warnings)

- Max line length: 100 characters (URLs, strings, template literals, and comments are exempt)
- Max function length: 50 lines (excluding blank lines and comments)
- Max file length: 500 lines (excluding blank lines and comments)
- Max cyclomatic complexity: 10
- Max nesting depth: 4
- Max function parameters: 4
- Naming: Classes `PascalCase`, functions/variables `camelCase`, constants `UPPER_SNAKE_CASE`, files `kebab-case`
- Private class fields use `#` prefix, private methods use `_` prefix
- Single quotes, trailing commas (ES5), no arrow parens for single arguments
- 2-space indentation, semicolons required

## Architecture Patterns (flag deviations)

- Imports should be grouped: external dependencies first, then internal modules
- Prefer named exports over default exports
- Logging must use `createLogger` and `isDebugEnabled` from `scripts/utils/logger.js` — never use `console.log` directly
- Conversation persistence must go through `ConversationManager` using `game.user.setFlag`
- AI response normalization is handled by `ai-normalization.js` — do not add provider-specific format handling elsewhere

## Testing Requirements (flag as errors)

- **CRITICAL GATE:** You MUST verify the pull request description contains a properly filled out `## Empirical Verification (UTRs)` section.
- If the PR description is missing this section, the section is empty, or the section contains static file names instead of empirical execution logs, you MUST reject the PR immediately.
- You must verify that the pasted test logs indicate that the tests actually passed (`PASS`, `OK`, etc.) and logically cover the systems modified in the PR.
- **Exception:** PRs that exclusively modify documentation (`*.md`), CI configuration (`.github/**`), or other non-runtime assets (no changes under `scripts/**` or `tests/**`) cannot produce meaningful runtime test output. For these, UTR output may be omitted or replaced with the output of the relevant CI check (e.g. the lint/knip run that exercises the change). Verify the exception applies by inspecting the file list — if any runtime code is touched, the standard UTR requirement still applies.

## PR Conventions (flag as comments)

- Commit messages must follow Conventional Commits: `type: description (Fixes #N)`
- Valid types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `ci`
- PR description should reference related GitHub issues
- PRs should be focused on a single logical change
