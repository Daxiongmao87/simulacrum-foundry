# Defect Log — Document Update Tool Array Operations

| ID | File | Lines | Type | Severity | Cause | Fix | Owner/Reviewer | Status | Notes |
|----|------|-------|------|----------|-------|-----|----------------|--------|-------|
| DL-200 | scripts/tools/document-update.js | 83 | Defect | High | Tool forwards raw update payloads and cannot remove array entries without full document context | Introduce structured operations that fetch the document, mutate targeted arrays, and emit minimal updates | Assistant | Closed | Resolved via operations payload support and tests |
