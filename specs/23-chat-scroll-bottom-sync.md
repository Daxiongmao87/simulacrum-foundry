# Specification Document

## Title
[x] Feature/Module Name: Simulacrum Chat Scroll Anchoring

## Overview
[x] Brief description of purpose and scope:  
> Fix Simulacrum's sidebar chat so it mirrors FoundryVTT v13's native `ChatLog.scrollBottom` behavior: after every render triggered by new messages or restored history, the `.chat-scroll` container must land on the latest entry instead of snapping to the top.

## Requirements
- [x] Functional Requirements:  
  - [x] Req 1: When `SimulacrumSidebarTab.addMessage` appends a user or AI message, re-rendering the `log` part must leave `.chat-scroll` at the newest message (bottom) even if the DOM node is replaced.  
  - [x] Req 2: After `_loadConversationHistoryOnInit` hydrates chat history, trigger a post-render scroll once data binding is complete so initial view anchors to the most recent message.  
  - [x] Req 3: Preserve manual scroll tracking (`#isAtBottom`, jump button visibility) to avoid forcing users downward once they intentionally scroll up.

- [x] Non-Functional Requirements (performance, scalability, etc.):  
  - [x] Req 1: Reuse existing Foundry helpers (`scrollBottom`, `waitForImages`) without introducing extra layout thrash or timers beyond what Foundry's `ChatLog` employs (`reference/foundryvtt/client/applications/sidebar/tabs/chat.mjs:#L148-L190`).  
  - [x] Req 2: Maintain compatibility with FoundryVTT v13 Handlebars partial lifecycle (`reference/foundryvtt-api/classes/foundry.applications.sidebar.tabs.ChatLog.html#scrollbottom`) and Simulacrum's current unit tests.

## Inputs
- [x] Define expected inputs:  
  - Field: Message append events routed through `SimulacrumSidebarTab.addMessage(role, content, display)`.  
  - Field: Conversation history payload resolved in `_syncFromCoreConversation()` during startup.  
  - Constraints: Inputs may include enriched HTML fragments and images whose loading can delay layout height calculations.

## Outputs
- [x] Define expected outputs:  
  - Field: `.chat-scroll.scrollTop` equals its `scrollHeight - clientHeight` after each render that adds messages while the user was at bottom prior to the update.  
  - Field: Jump-to-bottom control visibility reflects `#isAtBottom` after each scroll reconciliation.

## Behaviors / Flows
- [x] Primary flow:  
  1. A message is appended or history hydration completes.  
  2. The `log` part re-renders via HandlebarsApplicationMixin.  
  3. `_onRender('log')` resolves the `.chat-scroll` element and calls `scrollBottom({ waitImages: true })` when `#needsScroll` is true, keeping the view anchored.  
  4. `#needsScroll` resets only after a successful bottom alignment, leaving future renders eligible if scrolling fails (e.g., element absent).

- [x] Edge cases:  
  - [x] Case 1: Large history batches loaded on startup still land on the latest entry once DOM settles.  
  - [x] Case 2: If the user scrolls upward before a new message arrives, `#isAtBottom` prevents forced scrolling but the jump button surfaces to restore bottom alignment.  
  - [x] Case 3: Pop-out or mirrored views (future compatibility) inherit the same bottom anchoring without duplicate listeners.

## Examples (Acceptance Cases)
- [x] Example 1: User sends a message; once render completes, the viewport shows the new message at the bottom without manual scrolling.  
- [x] Example 2: AI reply arrives asynchronously; after render the view remains at the reply rather than jumping to the first message.  
- [x] Example 3 (Edge Case): On launch, conversation history restores 50+ messages, and the log displays the newest entry after hydration finishes.

## Test Cases (for TDD seed)
- [x] Requirement → Test Case(s):  
  - Req 1 → Extend `tests/ui/simulacrum-sidebar-tab.test.js` to assert `.scrollTop` matches `scrollHeight - clientHeight` after `addMessage` renders while `#isAtBottom` is true.  
  - Req 2 → Add startup hydration test ensuring `_loadConversationHistoryOnInit` triggers `scrollBottom` once history promises resolve.  
  - Req 3 → Regression test verifying manual upward scroll keeps `#needsScroll` false until user returns to bottom.

## Planning Addendum (for OOD / Implementation Strategy)
- [x] Components / Modules:  
  - `scripts/ui/simulacrum-sidebar-tab.js` (render lifecycle, scroll helpers).  
  - `templates/simulacrum/sidebar-log.hbs` (ensures `.chat-scroll` references remain stable).  
- [x] Classes & Interfaces:  
  - `SimulacrumSidebarTab` methods `_onRender`, `_attachPartListeners`, `_loadConversationHistoryOnInit`, `scrollBottom`.  
- [x] Reuse / DRY considerations:  
  - Centralize bottom-alignment logic within `scrollBottom` so startup and incremental updates stay consistent.  
- [x] MVP task breakdown:  
  1. Document current failure with automated test reproductions for message append and history hydration.  
  2. Adjust scroll flag handling to defer until DOM measurements ready, invoking `scrollBottom` post-render.  
  3. Verify new tests and capture evidence in updated verification artifacts.

### Status
- [x] Specification reviewed  
- [x] Tests derived from spec  
- [x] Implementation complete  
- [x] Verification complete  

## Fagan Inspection
- [x] Preparation: Reviewed FoundryVTT v13 chat source (`reference/foundryvtt/client/applications/sidebar/tabs/chat.mjs`) and API contract to benchmark expected scroll behavior.  
- [x] Inspection Team: Solo review (assistant) cross-checking template completeness and testability.  
- [x] Defects Logged: None; requirements map directly to reproducible failures observed in current module.  
- [x] Exit Criteria: All mandatory sections populated, acceptance cases trace to requirements, ready for implementation planning.
