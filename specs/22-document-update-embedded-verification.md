# Verification Plan — Document Update Tool Embedded Support

## Scope
- Confirm the update tool removes embedded documents, preserves flat updates, and returns the latest document payload.

## Preconditions
- Mock Foundry environment available via `setupMockFoundryEnvironment`.
- Jest installed (`npm install`).

## Test Steps
1. `npm test -- --runTestsByPath tests/tools/document-update.test.js tests/core/document-api.test.js`
   - Validates embedded delete flow, response payload JSON, and DocumentAPI delegation.

## Negative / Edge Cases
- Missing embedded id/index triggers validation error (covered in tool tests).
- Mixed flat + embedded operations succeed sequentially.
- Permission failures bubble up unchanged (existing regression coverage).

## Evidence
- `npm test -- --runTestsByPath tests/tools/document-update.test.js tests/core/document-api.test.js tests/ui/simulacrum-sidebar-tab.test.js` → pass (2025-03-07).

## Result
- ✅ Verification passed; embedded operations now mutate collections and tool responses include the updated document.
