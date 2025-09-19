# Change Summary — Document Update Tool Embedded Support

| File | Description | Requirement / Defect |
|------|-------------|-----------------------|
| scripts/tools/document-update.js | Adds embedded-aware operation planner, returns updated document payload, and validates ids vs indexes for delete/replace. | Req 1, Req 2, Req 3, Req 4 (DL-220, DL-221) |
| scripts/core/document-api.js | Exposes `getDocumentInstance` and `applyEmbeddedOperations` to invoke Foundry embedded CRUD APIs safely. | Req 1 (DL-220) |
| tests/tools/document-update.test.js | Covers embedded delete flow, response payload JSON, and legacy regression expectations. | Req 1, Req 2, Req 3, Req 4 |
| tests/core/document-api.test.js | Verifies embedded operations delegate to Foundry document methods. | Req 1 |
| specs/22-document-update-embedded.md | Updated status checkpoints. | Documentation alignment |
| specs/22-document-update-embedded-defect-log.md | Closed DL-220 and DL-221. | DL-220, DL-221 |
