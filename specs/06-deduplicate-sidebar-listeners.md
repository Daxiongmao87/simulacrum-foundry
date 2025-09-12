Title: Deduplicate sidebar input listeners

Overview
- simulacrum-sidebar-tab wires form submit/keydown in both _activateListeners and _attachPartListeners. Consolidate to the v13 parts path to reduce duplication.

Affected
- scripts/ui/simulacrum-sidebar-tab.js

Investigate
- Inspect both methods to list overlapping listeners.
- Check tests referencing these areas in tests/ui/simulacrum-sidebar-tab.test.js.

Fix
- Keep listener wiring inside _attachPartListeners('input', ...) only.
- Retain a minimal _activateListeners shim if tests rely on it, but avoid duplicating handlers.

Verify
- Run UI tests; Enter key, form submit, and cancel button still work.
- Manual: send messages; ensure only one handler triggers per action (no double-send).

