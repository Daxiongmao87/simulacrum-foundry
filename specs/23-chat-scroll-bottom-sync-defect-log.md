# Defect Log — Simulacrum Chat Scroll Anchoring

| ID | File | Lines | Type | Severity | Cause | Fix | Owner/Reviewer | Status | Notes |
|----|------|-------|------|----------|-------|-----|----------------|--------|-------|
| DL-230 | scripts/ui/simulacrum-sidebar-tab.js | 520-610 | Defect | High | New chat messages trigger a partial render that rebuilds `.chat-scroll`, resetting `scrollTop` to `0` instead of maintaining bottom alignment. | Ensure post-render path calls `scrollBottom` with `waitImages` when prior state was at bottom, mirroring Foundry's `ChatLog.scrollBottom`. | Assistant | Open | Reproduced by sending consecutive messages; viewport jumps to first message.
| DL-231 | scripts/ui/simulacrum-sidebar-tab.js | 620-700 | Defect | High | Initial conversation hydration completes without scheduling a bottom scroll, so the chat opens scrolled to the oldest message. | Queue a bottom scroll after `_syncFromCoreConversation()` resolves and DOM nodes mount. | Assistant | Open | Observed when joining a game with existing history; requires manual scroll to see latest content.
