# Specification Document

## Title
[x] Feature/Module Name: Provider Configuration Option

## Overview
[x] Brief description of purpose and scope:  
> Restore a first-class configuration option that lets world owners choose between OpenAI-compatible and Gemini-compatible AI providers, ensuring the selection is available in standard Foundry settings and the dedicated Simulacrum settings interface.

## Requirements
- [x] Functional Requirements:  
  - [x] Req 1: Register a world-scoped `provider` setting with `OpenAI-compatible` and `Gemini-compatible` choices, defaulting to `openai`, and trigger AI client reinitialization on change.  
  - [x] Req 2: Surface the provider dropdown inside the Simulacrum settings interface, updating base URL placeholders when the selection changes.  
  - [x] Req 3: Persist provider changes via the settings interface, ensuring `SimulacrumCore.initializeAIClient` observes the new value.  
  - [x] Req 4: Ensure the connection test uses the explicitly selected provider to determine headers and endpoints.

- [x] Non-Functional Requirements (performance, scalability, etc.):  
  - [x] Req 1: Preserve backwards compatibility for existing OpenAI deployments without requiring reconfiguration.  
  - [x] Req 2: Add Jest coverage for provider selection behavior (UI data load, change handler, persistence, and connection testing).

## Inputs
- [x] Define expected inputs:  
  - Field: `provider` (setting)  
  - Type: `string`  
  - Constraints: Must be one of `openai`, `gemini`; defaults to `openai`.

## Outputs
- [x] Define expected outputs:  
  - Field: Provider-aware AI client configuration  
  - Type: `string` persisted in Foundry settings  
  - Rules: Changing the value reinitializes the AI client and updates UI placeholders.

## Behaviors / Flows
- [x] Primary flow:  
  1. GM opens Simulacrum settings (core or custom interface).  
  2. GM selects `Gemini-compatible` provider and saves.  
  3. Module stores the provider, refreshes AI client, and adjusts base URL placeholder to Gemini default.

- [x] Edge cases:  
  - [x] Case 1: GM switches back to OpenAI; placeholder resets, AI client reinitializes without errors.  
  - [x] Case 2: Connection test runs with Gemini provider and no API key, only sending required headers.

## Examples (Acceptance Cases)
- [x] Example 1: Provider stays `OpenAI-compatible`, connection test hits `/models` with Bearer auth when API key present.  
- [x] Example 2: Provider changed to `Gemini-compatible`, placeholder becomes `https://generativelanguage.googleapis.com/v1beta`, connection test sends `x-goog-api-key` header.  
- [x] Example 3 (Edge Case): Provider toggled without base URL set; fallback placeholder still reflects provider selection.

## Test Cases (for TDD seed)
- [x] Requirement → Test Case(s):  
  - Req 1 → Unit test verifying `SettingsInterface.getData` includes provider.  
  - Req 2 → Unit test covering `_onProviderChange` updates placeholders.  
  - Req 3 → Unit test ensuring `_updateObject` persists provider via `game.settings.set`.  
  - Req 4 → Unit test validating `_testApiConnection` uses provider-specific headers.

## Planning Addendum (for OOD / Implementation Strategy)
- [x] Components / Modules:  
  - `scripts/simulacrum.js`, `scripts/ui/settings-interface.js`, `templates/settings-interface.html`, `tests/ui/settings-interface.test.js`.
- [x] Classes & Interfaces:  
  - `SettingsInterface` (FormApplication), `SimulacrumCore` provider initialization path.
- [x] Reuse / DRY considerations:  
  - Centralize provider choice strings to avoid duplication between registration and UI.  
  - Reuse `_inferProviderFromURL` for placeholder inference when direct selection absent.
- [x] MVP task breakdown:  
  1. Ensure provider setting registration exists and aligns with desired choices.  
  2. Update settings interface data/model/template to surface provider dropdown and placeholder logic.  
  3. Adjust connection testing and persistence to respect provider selection.  
  4. Add/adjust Jest tests for provider workflows; run targeted suite.

### Status
- [x] Specification reviewed  
- [x] Tests derived from spec  
- [x] Implementation complete  
- [x] Verification complete  
