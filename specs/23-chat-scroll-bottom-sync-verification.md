# Verification Plan — Simulacrum Chat Scroll Anchoring

## Scope
- Validate that chat scrolling remains anchored to the latest message after new posts and history hydration while preserving manual scroll override behavior.

## Preconditions
- Jest environment with DOM mocks for `SimulacrumSidebarTab` located in `tests/ui/simulacrum-sidebar-tab.test.js`.
- Chat history fixtures capable of simulating multi-message hydration.

## Test Steps
1. `npm test -- --runTestsByPath tests/ui/simulacrum-sidebar-tab.test.js`
   - Covers message append scrolling, history hydration, and process status updates.

## Negative / Edge Cases
- User scrolls away from bottom before AI reply; new message should not yank viewport but must display jump control.
- History load with embedded images waits for asset sizing before final scroll (implicitly validated via wait logic).

## Evidence
- `npm test -- --runTestsByPath tests/ui/simulacrum-sidebar-tab.test.js tests/lib/markdown-renderer.test.js` → pass (2025-03-10).

## Result
- ✅ Verification passed.
