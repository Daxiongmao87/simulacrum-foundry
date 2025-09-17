# Defect Log — Gemini Tool Schema Normalization

| ID | File | Lines | Type | Severity | Cause | Fix | Owner/Reviewer | Status | Notes |
|----|------|-------|------|----------|-------|-----|----------------|--------|-------|
| DL-000 | specs/16-gemini-tool-schema.md | — | Review Record | High | Gemini API rejects tool schemas with boolean required flags | Sanitation spec accepted | Assistant | Closed | Specification inspected; implementation underway |
| DL-001 | scripts/core/ai-client.js | — | Review Record | High | Gemini tool schema sanitation required | Recursively sanitize tool schemas before Gemini requests | Assistant | Closed | Code inspection completed; no outstanding defects |
