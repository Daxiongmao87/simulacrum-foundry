# Specification Document

## Title
[x] Feature/Module Name: Gemini Provider Integration

## Overview
[x] Brief description of purpose and scope:  
> Add full parity for Google Gemini API alongside existing OpenAI-style support, including provider selection, request/response normalization, and configuration updates.

## Requirements
- [x] Functional Requirements:  
  - [x] Req 1: Introduce a `GeminiProvider` in `AIClient` capable of calling `models.generateContent` (and `streamGenerateContent`) with proper authentication and payload shape.  
  - [x] Req 2: Normalize Gemini responses (candidates, parts, function calls) into existing Simulacrum response format with tool call support.  
  - [x] Req 3: Map tool registry schemas to Gemini `functionDeclarations`; interpret `functionCall` parts into standard tool calls.  
  - [x] Req 4: Update settings UI to allow provider selection (`OpenAI-compatible`, `Gemini-compatible`, `Custom`) with provider-specific defaults and validation (Gemini base URL, API key guidance).  
  - [x] Req 5: Respect `legacyMode` toggle for providers/models lacking native tool support (manual toggle retained).  

- [x] Non-Functional Requirements:  
  - [x] Req 1: Maintain backwards compatibility for existing OpenAI-configured deployments.  
  - [x] Req 2: Ensure new provider logic is covered by unit tests (request serialization, response normalization).  

## Inputs
- [x] Gemini REST API docs (`models.generateContent`, `streamGenerateContent`).
- [x] Existing AIClient/tool loop architecture.

## Outputs
- [x] Gemini provider implementation, normalized responses, updated settings UI, documentation notes.

## Behaviors / Flows
- [x] Primary flow: user selects Gemini provider → config saved → `AIClient` instantiates `GeminiProvider` → chat/tool requests routed accordingly.  
- [x] Edge cases: streaming responses, functionCall with arguments, legacy mode toggle for non-tool endpoints, safety error handling.

## Examples (Acceptance Cases)
- [x] Example 1: Configure Gemini provider, run chat turn that returns text-only response.  
- [x] Example 2: Gemini response includes `functionCall`; converted into tool call and executed via tool loop.  
- [x] Example 3: Legacy mode enabled → inline tool JSON fallback used.  
- [x] Example 4 (stream): SSE responses aggregated into final assistant message.

## Test Cases
- [x] Unit tests for Gemini request building and response normalization (fixtures).  
- [x] Integration-level test toggling provider and executing tool call loop with mocked Gemini responses.  
- [x] UI test (unit or harness) verifying provider dropdown updates base URL placeholder.

## Planning Addendum
- [x] Components: `scripts/core/ai-client.js`, new `GeminiProvider`, `scripts/ui/settings-interface.js`, `scripts/core/simulacrum-core.js` (provider selection wiring), tests under `tests/core` and `tests/utils`.  
- [x] MVP Task Breakdown:  
  1. Decouple `AIClient` base URL enforcement and add provider registry keyed by explicit setting.  
  2. Implement Gemini provider (REST + SSE).  
  3. Update normalization utilities for Gemini function calls/parts.  
  4. Expose provider selection + documentation updates.  
  5. Add/adjust tests and docs.

### Status
- [x] Specification reviewed  
- [ ] Tests derived from spec  
- [ ] Implementation complete  
- [ ] Verification complete  
