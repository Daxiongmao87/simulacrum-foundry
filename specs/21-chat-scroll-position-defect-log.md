# Defect Log — Chat Scroll Position Retention

| ID | File | Lines | Type | Severity | Cause | Fix | Owner/Reviewer | Status | Notes |
|----|------|-------|------|----------|-------|-----|----------------|--------|-------|
| DL-210 | scripts/ui/simulacrum-sidebar-tab.js | 141-154 | Defect | High | Process status hook re-renders the log without preserving bottom scroll position, forcing `.chat-scroll` to top on every update. | Guard render with scroll flag and trigger `scrollBottom()` post-render so updates stay anchored. | Assistant | Closed | Resolved by scrolling the freshly rendered `.chat-scroll` element in `_onRender` so container swaps preserve position. |
| DL-211 | scripts/ui/simulacrum-sidebar-tab.js | 187-193 | Defect | Medium | Conversation history sync re-renders the log without scheduling a scroll, leaving the view at top after history loads. | Set scroll-needed flag prior to history-driven renders. | Assistant | Closed | History sync now flags the render and uses the same container-aware scroll path, keeping the log at the newest message. |
