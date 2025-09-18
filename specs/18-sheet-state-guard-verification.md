# Verification Plan — Document Sheet State Guard

## Scope
- Confirm document sheet guards close rendered sheets before mutations and restore them when appropriate.

## Preconditions
- Mock Foundry environment via existing Jest helpers.
- Access to `npx jest` in project root.

## Test Steps
1. `npx jest tests/core/document-api-crud.test.js --runTestsByPath`
   - Validates sheet close/reopen logic during update/delete operations.

## Negative / Edge Cases
- Update failure still triggers sheet reopen.
- Non-rendered sheets do not incur close/render calls.

## Evidence
- `npx jest tests/core/document-api-crud.test.js --runTestsByPath` → pass (run on 2025-09-17).

## Result
- ✅ Verification passed; sheet guards operate as specified and prevent Foundry sheet races.
