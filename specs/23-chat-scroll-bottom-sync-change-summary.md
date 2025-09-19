# Change Summary — Simulacrum Chat Scroll Anchoring

| File | Description | Requirement / Defect |
|------|-------------|-----------------------|
| scripts/ui/simulacrum-sidebar-tab.js | Moves scroll reconciliation to `_postRender`, reuses Foundry scroll settings, and marks the `log` part scrollable to preserve manual offsets. | DL-230, DL-231 |
| tests/ui/simulacrum-sidebar-tab.test.js | Adds DOM-backed tests ensuring message append, history hydration, and process updates leave `.chat-scroll` at the bottom. | DL-230, DL-231 |
| specs/23-chat-scroll-bottom-sync.md | Marks specification tasks as complete following implementation. | Documentation alignment |
| specs/23-chat-scroll-bottom-sync-defect-log.md | Closes DL-230 and DL-231 after verifying fixes. | DL-230, DL-231 |
| specs/23-chat-scroll-bottom-sync-verification.md | Records targeted Jest command outputs for scroll anchoring verification. | Verification artifact |

## Notes
- Verification command: `npm test -- --runTestsByPath tests/ui/simulacrum-sidebar-tab.test.js tests/lib/markdown-renderer.test.js`.
