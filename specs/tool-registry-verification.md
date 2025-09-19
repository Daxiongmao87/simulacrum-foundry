# Verification Plan - Tool Registry Export Fix

- **Scope:** Validate that `toolRegistry` is available as both named and default export and that dependent code paths import without runtime errors.
- **Preconditions:**
  - Working directory at repository root.
  - Dependencies installed (`npm install`).
- **Steps:**
  1. Run `npm test -- tests/core/tool-registry-exports.test.js` to confirm export contract.  
  2. Run `npm test -- tests/core/tool-registry.test.js` to ensure broader registry behaviors remain intact (known legacy hook assertions currently fail; capture output).  
  3. Optionally execute `npm run lint` to verify no lint regressions related to the change.
- **Negative Cases:** Ensure tests would fail if the named export were removed (covered implicitly by first test).
- **Evidence:** Captured command outputs in task log (see session transcripts).
- **Result:** Partial — export contract test passes; broader registry suite reports expected failures in deprecated hook APIs (unchanged by this patch).
