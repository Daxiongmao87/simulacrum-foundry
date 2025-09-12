Title: Remove unused toolCallingSupported state

Overview
- toolCallingSupported on SimulacrumCore is a leftover from an older implementation. Current logic relies on the legacyMode setting. Remove the unused state.

Affected
- scripts/core/simulacrum-core.js

Investigate
- Search for occurrences: rg -n "toolCallingSupported" scripts tests
- Confirm behavior branches use legacyMode everywhere.

Fix
- Remove the property initialization and comments referencing toolCallingSupported.

Verify
- rg shows no matches for toolCallingSupported.
- Smoke test both modes (legacy/native) to confirm behavior unchanged.

