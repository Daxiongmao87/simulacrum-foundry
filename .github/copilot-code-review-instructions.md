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

- All new features and bug fixes MUST include tests that verify the code actually works — tests MUST assert real, observable behavior, not just that functions exist or return without error
- Tests MUST exercise meaningful scenarios: valid inputs producing correct outputs, edge cases, and error conditions
- Do not accept tests that are superficial stubs, mock everything away, or only check that no exception is thrown — tests MUST prove functional correctness
- E2E tests MUST use Playwright (`tests/e2e/`) — see `tests/e2e/fixtures/test-base.js` for available fixtures
- If a PR modifies tool behavior, it MUST include or update tests exercising the tool's `execute()` method with realistic inputs and expected outputs

## PR Conventions (flag as comments)

- Commit messages must follow Conventional Commits: `type: description (Fixes #N)`
- Valid types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `ci`
- PR description should reference related GitHub issues
- PRs should be focused on a single logical change
