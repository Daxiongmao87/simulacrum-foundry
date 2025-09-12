Title: Remove dead function handleAutonomousContinuation

Overview
- handleAutonomousContinuation in scripts/core/tool-loop-handler.js is not referenced and can be removed to reduce maintenance overhead.

Affected
- scripts/core/tool-loop-handler.js

Investigate
- Search for references: rg -n "handleAutonomousContinuation\b" scripts tests
- Confirm no imports/exports or indirect references exist.

Fix
- Delete the handleAutonomousContinuation function from tool-loop-handler.js.
- Ensure no export list changes are needed (it is not exported).

Verify
- rg returns no matches for handleAutonomousContinuation.
- Run unit tests for tool loop and chat flow; confirm no regressions.
- Manual sanity: send a message in legacy and native modes; behavior unchanged.

