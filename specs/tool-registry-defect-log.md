# Defect Log - Tool Registry Export Error

| ID | File | Lines | Type | Severity | Cause | Fix | Owner/Reviewer | Status | Notes |
|----|------|-------|------|----------|-------|-----|-----------------|--------|-------|
| D1 | scripts/core/tool-registry.js | export section | Interface | High | Singleton registry exported without resilient named binding, breaking consumers expecting `{ toolRegistry }` in Foundry runtime | Refactor exports to use explicit `export const toolRegistry = …` while retaining default export | patrick (inspection) | Resolved | Verified via `tool-registry-exports.test.js`; pending broader suite cleanup |

Inspection Outcome: Blocker identified (D1). Implementation required before verification can proceed.
