Title: Phase 3 — Conversation Engine Orchestrator

Overview
- Introduce a thin ConversationEngine to own message assembly, mode selection (native/legacy), correction enforcement, tool-loop invocation, and retries. ChatHandler delegates to it. Supports the module’s goal by making autonomous behavior predictable and consistent.

Requirements
- R1: Single entry: processTurn(userMessage, options) → final assistant response.
- R2: Engine assembles outbound messages, enforces “content required,” and invokes tool loop when appropriate.
- R3: Mode handling centralized: native (chatWithSystem) vs legacy (chat with sanitized messages).
- R4: Bounded retries and graceful failure messaging.
- R5: Preserve existing public behavior (UI callbacks, persistence, registry).

Inputs
- userMessage: string; options: { signal, callbacks }.
- dependencies: aiClient, getSystemPrompt, toolRegistry, conversationManager.

Outputs
- assistantResponse: { content, display, toolCalls?, model?, usage? }.

Behaviors / Flows
1) Add user message → request AI → normalize.
2) If _parseError → invoke shared correction routine → retry.
3) If toolCalls → call tool loop; during loop, enforce same correction and add assistant/tool messages consistently.
4) On completion (no toolCalls) → return assistant response; UI callback invoked.

Edge cases
- Cancellation via AbortController.
- Tool failures → post-tool verification, bounded repeats → final summary.

Acceptance
- A1: Native tool_calls with empty content → corrected before tools run.
- A2: Legacy fallback inline JSON → parsed; tools executed; assistant communicative.
- A3: Retry exhaustion → user-facing failure message.

Verification
- Fagan inspection on Engine’s message assembly (outbound payloads observed).
- Compare golden traces pre/post integration (no behavioral regressions).

Test Coverage Mapping
- R1–R4 → integration tests using mock aiClient and toolRegistry.
- R5 → existing UI/tests remain green; add targeted engine tests only.

