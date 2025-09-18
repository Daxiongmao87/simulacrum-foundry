# Defect Log — Document Sheet State Guard

| ID | File | Lines | Type | Severity | Cause | Fix | Owner/Reviewer | Status | Notes |
|----|------|-------|------|----------|-------|-----|----------------|--------|-------|
| DL-000 | scripts/core/document-api.js | 286 | Defect | High | Updating documents while sheets are open leaves IntersectionObserver running on destroyed DOM | Temporarily close sheet and restore after mutation | Assistant | Closed | Sheet guard implemented for update/delete |
