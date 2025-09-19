# Defect Log — Document Update Tool Embedded Support

| ID | File | Lines | Type | Severity | Cause | Fix | Owner/Reviewer | Status | Notes |
|----|------|-------|------|----------|-------|-----|----------------|--------|-------|
| DL-220 | scripts/tools/document-update.js | 160-188 | Defect | High | Embedded operations compute array replacements but never call Foundry's embedded-document APIs, so deletions like `JournalEntry.pages` silently fail. | Introduce embedded-aware resolver that uses `updateEmbeddedDocuments`/`-=id` semantics. | Assistant | Closed | Resolved via embedded-aware operation plan and DocumentAPI.applyEmbeddedOperations. |
| DL-221 | scripts/tools/document-update.js | 82-134 | Defect | Medium | Tool responses omit the updated document data, forcing extra reads and hiding partial failures. | Fetch and return updated document payload on success; surface mismatches if fetch fails. | Assistant | Closed | Tool now includes serialized document payload in success content and `document` field. |
