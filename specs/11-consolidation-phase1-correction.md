Title: Phase 1 — Shared Correction Routine (Pre‑Tool and In‑Loop)

Overview
- Unify the “empty-content correction” into a single routine that both pre‑tool (initial assistant turn) and in‑loop (mid tool-loop) paths call. Supports the module’s goal: always communicate intent to the user while acting autonomously with tools.

Requirements
- R1: Every assistant turn must include meaningful natural-language content, even when tool_calls are present.
- R2: If content is empty, inject corrective feedback into conversation messages before retrying (assistant failed turn + system correction).
- R3: One shared correction routine is invoked in both paths (pre‑tool and in‑loop) with consistent behavior.
- R4: Works in both native and legacy modes.

Inputs
- errorResponse: normalized AI response (may include toolCalls, raw provider message).
- conversationManager: provides addMessage/getMessages.
- getSystemPrompt: function to compute system prompt (for native mode calls).

Outputs
- Updated conversation messages including:
  - Assistant message (combined failure content, carries tool_calls if present)
  - System correction instruction

Behaviors / Flows
1) On _parseError=true:
   - Add assistant combined failure message.
   - Add system correction message.
   - Return control to caller to perform the retry.
2) Native mode: correction messages live in conversation and are included via chatWithSystem(messages,…).
3) Legacy mode: correction messages survive sanitization and are included in chat(messages,…).

Edge cases
- Provider returns function_call instead of tool_calls → carry through.
- Repeated empty content → caller enforces bounded retry; emit user-facing failure after exhaustion.

Examples (Acceptance)
- A1: Initial assistant reply has empty content + tool_calls → correction messages appended; next request includes them.
- A2: Mid-loop assistant reply has empty content → loop uses same routine; next request includes messages.

Verification
- Inspect conversationManager.getMessages() before retry → contains assistant + system correction.
- Confirm tools are not executed until a non-empty assistant content appears.

Test Coverage Mapping
- R1 → unit tests: normalization sets _parseError on empty content.
- R2/R3 → unit/integration: shared correction invoked in both paths; messages appended.
- R4 → mode-specific tests (native/legacy) assert identical behavior.

