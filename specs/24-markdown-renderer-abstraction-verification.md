# Verification Plan — Markdown Rendering Abstraction

## Scope
- Confirm markdown is converted to HTML prior to enrichment so chat displays formatted AI responses, while existing HTML remains intact.

## Preconditions
- Jest unit tests for markdown renderer utility under `tests/lib/markdown-renderer.test.js`.
- Integration tests for `SimulacrumSidebarTab` message rendering with markdown fixtures.

## Test Steps
1. `npm test -- --runTestsByPath tests/lib/markdown-renderer.test.js`
   - Validates conversion of emphasis, lists, error fallback, and HTML passthrough.
2. `npm test -- --runTestsByPath tests/ui/simulacrum-sidebar-tab.test.js`
   - Confirms AI markdown renders as enriched HTML inside the chat log template.

## Negative / Edge Cases
- Plain HTML bypasses markdown conversion and renders unchanged.
- Renderer preserves Foundry inline roll syntax for downstream enrichment.

## Evidence
- `npm test -- --runTestsByPath tests/ui/simulacrum-sidebar-tab.test.js tests/lib/markdown-renderer.test.js` → pass (2025-03-10).

## Result
- ✅ Verification passed.
