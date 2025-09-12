Title: Remove deprecated SimulacrumCore.processMessage

Overview
- SimulacrumCore.processMessage is marked deprecated and simply delegates to ChatHandler. It appears unused and can be removed to avoid confusion.

Affected
- scripts/core/simulacrum-core.js

Investigate
- Search for usages: rg -n "processMessage\(" scripts tests
- Confirm no external entry points (e.g., templates) reference it.

Fix
- Remove the processMessage method and its deprecation comment.
- Ensure ChatHandler remains the sole orchestrator for message flow.

Verify
- rg reports no references to processMessage.
- Run tests that initialize simulacrum and send messages; no changes expected.

