# Specification Document

## Title
[x] Feature/Module Name: Markdown Rendering Abstraction

## Overview
[x] Brief description of purpose and scope:  
> Introduce a Simulacrum-specific markdown-to-HTML adapter so AI responses authored in markdown render correctly through FoundryVTT v13's HTML pipeline before enrichment and display.

## Requirements
- [x] Functional Requirements:  
  - [x] Req 1: Provide a reusable utility (e.g., `MarkdownRenderer.render(markdown, options)`) that converts markdown into sanitized HTML using the same Showdown configuration as Foundry journals (`reference/foundryvtt/client/applications/sheets/journal/journal-entry-page-text-sheet.mjs:#L20-L38`).  
  - [x] Req 2: Update `SimulacrumSidebarTab.addMessage` to run AI-authored content through the markdown renderer prior to `TextEditor.enrichHTML`, preserving support for inline HTML when present.  
  - [x] Req 3: Handle non-markdown inputs gracefully by bypassing conversion when the string already contains HTML tags or when markdown rendering is explicitly disabled.

- [x] Non-Functional Requirements (performance, scalability, etc.):  
  - [x] Req 1: Avoid loading third-party bundles at runtime; rely on Foundry's bundled `window.showdown` and `SHOWDOWN_OPTIONS` constants to keep footprint minimal (`reference/foundryvtt/common/constants.mjs:#L1721-L1767`).  
  - [x] Req 2: Ensure converted HTML remains compatible with Foundry's sanitizer by passing the output through `TextEditor.enrichHTML` for final processing (`reference/foundryvtt/client/applications/ux/text-editor.mjs:#L82-L151`).

## Inputs
- [x] Define expected inputs:  
  - Field: `markdown` (string) — raw AI content potentially containing markdown syntax, HTML fragments, or plain text.  
  - Field: `options` (object) — optional flags such as `allowHtml`, `stripImages`, or a target `Document` for enrichment context.  
  - Constraints: Must support multi-paragraph text, fenced code blocks, inline formatting, and block quotes typical of LLM output.

## Outputs
- [x] Define expected outputs:  
  - Field: `html` (string) — HTML-safe string ready for `TextEditor.enrichHTML`, retaining markdown semantics (lists, emphasis, code).  
  - Field: Diagnostics — if markdown parsing fails, log via shared logger while returning fallback plain text.

## Behaviors / Flows
- [x] Primary flow:  
  1. AI response arrives as markdown.  
  2. `MarkdownRenderer.render` detects markdown (e.g., headings, emphasis) and delegates to Showdown configured with Foundry defaults.  
  3. Converted HTML passes to `TextEditor.enrichHTML` for enrichment and sanitization before being stored in the chat message.  
  4. Rendered message appears in chat with proper formatting.

- [x] Edge cases:  
  - [x] Case 1: Content already HTML (`<div>...</div>`) — renderer returns string unchanged to avoid double-encoding.  
  - [x] Case 2: Mixed markdown and Foundry inline roll syntax `[[/r 1d20]]` — renderer preserves inline roll patterns so enrichment can convert them.  
  - [x] Case 3: LLM produces malformed tables — renderer sanitizes via Showdown output and Foundry enrichment, logging a warning if conversion throws.

## Examples (Acceptance Cases)
- [x] Example 1: Input `**Bold** _italic_` renders in chat with proper bold and italics.  
- [x] Example 2: Multi-line markdown list (`- item`) displays as `<ul><li>item</li></ul>` post-enrichment.  
- [x] Example 3 (Edge Case): Pre-formatted HTML `<p>Hello</p>` bypasses conversion and renders unchanged.

## Test Cases (for TDD seed)
- [x] Requirement → Test Case(s):  
  - Req 1 → Unit tests for `MarkdownRenderer` verifying Showdown conversion of headings, lists, and code fences matches expected HTML snapshots.  
  - Req 2 → Integration test covering `addMessage` to confirm AI markdown surfaces as enriched HTML in rendered template.  
  - Req 3 → Regression test ensuring pure HTML input is returned untouched and logged conversions errors fall back to plain text.

## Planning Addendum (for OOD / Implementation Strategy)
- [x] Components / Modules:  
  - New utility under `scripts/lib/markdown-renderer.js`.  
  - Update `scripts/ui/simulacrum-sidebar-tab.js` to invoke renderer and log diagnostics.  
- [x] Classes & Interfaces:  
  - `MarkdownRenderer` exposing static `render` plus optional helpers for heuristics (e.g., `looksLikeMarkdown`).  
- [x] Reuse / DRY considerations:  
  - Share logger factory from existing utilities; centralize conversion so future modules reuse consistent behavior.  
- [x] MVP task breakdown:  
  1. Implement markdown detection and conversion using Foundry's Showdown configuration.  
  2. Integrate renderer into chat message enrichment path with fallback handling.  
  3. Cover functionality with targeted unit and integration tests.

### Status
- [x] Specification reviewed  
- [x] Tests derived from spec  
- [x] Implementation complete  
- [x] Verification complete  

## Fagan Inspection
- [x] Preparation: Reviewed Foundry markdown conversion pipeline (`reference/foundryvtt/client/applications/sheets/journal/journal-entry-page-text-sheet.mjs`) and `TextEditor.enrichHTML` behavior to ensure compatibility.  
- [x] Inspection Team: Solo review validating completeness, logical test mapping, and reuse of bundled Showdown.  
- [x] Defects Logged: None identified; assumptions documented in edge cases.  
- [x] Exit Criteria: Specification aligns with MVP scope and is ready for planning.
