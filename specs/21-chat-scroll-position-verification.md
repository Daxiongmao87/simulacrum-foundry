# Verification Plan — Chat Scroll Position Retention

## Scope
- Confirm the Simulacrum sidebar keeps the chat log pinned to the newest message after process updates, history loads, and message renders.

## Preconditions
- Jest environment with UI mocks defined in `tests/ui/simulacrum-sidebar-tab.test.js`.

## Test Steps
1. `npm test -- --runTestsByPath tests/ui/simulacrum-sidebar-tab.test.js`
   - Validates process status and history sync scrolling behavior.
2. `npm test -- --runTestsByPath tests/tools/document-update.test.js`
   - Regression guard for adjacent tool modifications in the same change set.

## Negative / Edge Cases
- Process status updates when user not at bottom still scroll to newest activity.
- History sync replacing welcome message drives view to latest saved message.

## Evidence
- `npm test -- --runTestsByPath tests/tools/document-update.test.js tests/ui/simulacrum-sidebar-tab.test.js` → pass (2025-03-07).

## Result
- ✅ Verification passed; chat log remains at bottom after any update.
