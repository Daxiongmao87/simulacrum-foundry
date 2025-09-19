# Specification Document

## Title
[x] Feature/Module Name: Chat Scroll Position Retention

## Overview
[x] Brief description of purpose and scope:  
> Ensure the Simulacrum sidebar chat log always returns the view to the latest message after updates so users see current activity instead of jumping to the top.

## Requirements
- [x] Functional Requirements:  
  - [x] Req 1: When messages or process-status updates re-render the chat log, automatically scroll the `.chat-scroll` container to the bottom.  
  - [x] Req 2: Preserve manual bottom tracking flags so the UI can continue to hide/show the jump-to-bottom control correctly.  
  - [x] Req 3: Avoid duplicate event bindings or regressions in existing scroll handling.

- [x] Non-Functional Requirements (performance, scalability, etc.):  
  - [x] Req 1: Limit DOM reads/writes to the existing render cycle; no timers or additional layout thrash.  
  - [x] Req 2: Maintain current test suite performance.

## Inputs
- [x] Define expected inputs:  
  - Field: Sidebar message push (internal call to `addMessage`).  
  - Field: Process status hook payload from `simulacrum:processStatus`.

## Outputs
- [x] Define expected outputs:  
  - Field: `.chat-scroll` scroll position at bottom after each update.  
  - Field: `#jump-to-bottom` visibility toggled consistently with scroll state.

## Behaviors / Flows
- [x] Primary flow:  
  1. Sidebar updates messages or process status.  
  2. Component triggers a partial render of the `log` part.  
  3. `_onRender('log')` scrolls the container to the bottom and resets flags.

- [x] Edge cases:  
  - [x] Case 1: Process status updates without new messages still scroll to bottom.  
  - [x] Case 2: Conversation history sync triggers bottom scroll.  
  - [x] Case 3: Scroll listeners remain attached exactly once after re-renders.

## Examples (Acceptance Cases)
- [x] Example 1: Sending a message keeps the viewport anchored on the latest entry.  
- [x] Example 2: Receiving tool progress updates maintains the bottom position.  
- [x] Example 3 (Edge Case): Loading historical conversation pushes view to the most recent message.

## Test Cases (for TDD seed)
- [x] Requirement → Test Case(s):  
  - Req 1 → Integration/unit test asserting `scrollBottom` invoked when process status render occurs.  
  - Req 2 → Unit test verifying `#needsScroll` flag toggled when re-render triggered outside `addMessage`.  
  - Req 3 → Existing scroll listener tests continue passing (regression coverage).

## Planning Addendum (for OOD / Implementation Strategy)
- [x] Components / Modules:  
  - `scripts/ui/simulacrum-sidebar-tab.js`, relevant tests under `tests/ui` or existing tool tests.  
- [x] Classes & Interfaces:  
  - `SimulacrumSidebarTab` adjustments to render workflow.  
- [x] Reuse / DRY considerations:  
  - Reuse existing `scrollBottom` helper; avoid duplicating logic per trigger.  
- [x] MVP task breakdown:  
  1. Capture failing tests covering re-render scenarios (process status + history sync).  
  2. Update sidebar tab logic to set scroll flags and call `scrollBottom` accordingly.  
  3. Verify tests and update docs/defect log.

### Status
- [x] Specification reviewed  
- [x] Tests derived from spec  
- [x] Implementation complete  
- [x] Verification complete  
