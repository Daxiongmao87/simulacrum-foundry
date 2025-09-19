# Change Summary — Chat Scroll Position Retention

| File | Description | Requirement / Defect |
|------|-------------|-----------------------|
| scripts/ui/simulacrum-sidebar-tab.js | Tracks `#needsScroll` and scrolls the freshly rendered `.chat-scroll` element so process-status and history renders stay anchored on the latest message. | Req 1, Req 2 (DL-210, DL-211) |
| tests/ui/simulacrum-sidebar-tab.test.js | Adds regression coverage for process status updates, history sync scrolling, and adjusts existing async expectations. | Req 1, Req 2, Req 3 |
| specs/21-chat-scroll-position.md | Updated specification status to reflect completion. | Documentation alignment |
| specs/21-chat-scroll-position-defect-log.md | Closed DL-210 and DL-211 after fix. | DL-210, DL-211 |
| specs/21-chat-scroll-position-verification.md | Captures verification plan and evidence for scroll behavior. | Verification artifact |
