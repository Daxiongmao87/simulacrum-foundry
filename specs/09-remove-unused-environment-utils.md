Title: Remove unused environment utilities

Overview
- scripts/utils/environment.js is not referenced by runtime code or tests. Remove to reduce footprint unless a future use is planned.

Affected
- scripts/utils/environment.js

Investigate
- rg -n "utils/environment" and rg -n "isFoundryEnvironmentAvailable|isTestEnvironment|checkToolExecutionEnvironment" across repo.

Fix
- Delete the file if truly unused; otherwise move to tools/ if needed for dev-only scripts.

Verify
- rg shows no references.
- Build/tests pass.

