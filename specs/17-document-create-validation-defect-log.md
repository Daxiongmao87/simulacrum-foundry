# Defect Log — Document Creation Validation Fix

| ID | File | Lines | Type | Severity | Cause | Fix | Owner/Reviewer | Status | Notes |
|----|------|-------|------|----------|-------|-----|----------------|--------|-------|
| DL-000 | scripts/core/document-api.js | 236 | Defect | High | Gemini document creation fails because `documentClass.validate` is undefined for Foundry documents | Guard validation call and fall back to direct creation | Assistant | Closed | Resolved by sanitizing validation calls |
| DL-001 | scripts/core/document-api.js | 307 | Defect | High | Document updates call `doc.validate` which is undefined in Foundry | Skip missing validator and rely on Foundry update semantics | Assistant | Closed | Validation guarded; permission handling rechecked |
