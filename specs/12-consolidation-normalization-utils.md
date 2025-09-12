Title: Phase 2 — Single Normalization and Inline Tool Parsing Utility

Overview
- Centralize AI response normalization and inline tool-call parsing into one utility used across Core, ChatHandler, and Tool Loop. Supports the module’s goal by ensuring consistent interpretation of provider outputs and reducing drift.

Requirements
- R1: One module exports normalizeAIResponse(raw), sanitizeMessagesForFallback(messages), parseInlineToolCall(text).
- R2: Both native and legacy paths use the same normalization results.
- R3: Preserve current behaviors (parseError rules, function_call fallback, Responses API parts, inline JSON detection) byte-for-byte.

Inputs
- raw: provider response.
- messages: conversation messages for sanitization.
- text: assistant content potentially containing inline JSON tool calls.

Outputs
- normalized: { content, display, toolCalls, model, usage, raw, _parseError? }.
- sanitizedMessages: only system/user/assistant with non-empty content.
- parsedInline: { name, arguments, cleanedText } | null.

Behaviors / Flows
1) If content empty → _parseError=true regardless of tool_calls.
2) Map function_call → toolCalls if provider uses legacy field.
3) Responses API “parts” flattened to content where applicable.
4) Inline JSON tool-call parsing only when native tool_calls are absent.

Edge cases
- Empty content but non-empty toolCalls → still _parseError=true.
- Malformed JSON → return parseError info for caller to handle.

Acceptance / Examples
- A1: OpenAI-style tool_calls present + empty content → normalized._parseError=true.
- A2: function_call only → toolCalls synthesized.
- A3: Inline JSON → parsed and cleaned content.

Verification
- Golden test vectors for raw inputs produce identical normalized outputs pre/post refactor.

Test Coverage Mapping
- R1/R2 → unit tests on utility with provider variants.
- R3 → snapshot tests verifying parity with current behavior.

