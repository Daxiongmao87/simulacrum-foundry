# Verification Plan — Gemini Tool Schema Normalization

## Scope
- Confirm Gemini function declaration sanitation removes invalid property-level `required` flags and preserves schema fidelity.

## Preconditions
- Repository dependencies installed.
- Jest available (`npx jest`).

## Test Steps
1. `npx jest tests/core/ai-client.test.js --runTestsByPath`
   - Validates sanitation helper behavior and regression tests for AIClient.

## Negative / Edge Cases
- Nested object schemas with property `required: true` must surface in required array without duplicates.
- Existing OpenAI behaviours remain unaffected (covered indirectly via prior tests).

## Evidence
- `npx jest tests/core/ai-client.test.js --runTestsByPath` → pass (run on 2025-09-17).

## Result
- ✅ Verification passed; Gemini tool schema sanitation behaves as specified.
