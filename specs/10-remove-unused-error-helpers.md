Title: Remove unused error helper functions

Overview
- wrapError and createRecoveryContext in scripts/utils/errors.js appear unused. Removing them reduces API surface and potential confusion.

Affected
- scripts/utils/errors.js

Investigate
- rg -n "wrapError\(|createRecoveryContext\(" scripts tests
- Confirm only error classes (APIError, NotFoundError, etc.) are used.

Fix
- Remove helper functions and associated exports; keep error classes used by runtime.

Verify
- rg shows no leftover references.
- Tests compile and pass; imports unaffected.

