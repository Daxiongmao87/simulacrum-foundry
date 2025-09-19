# Specification Document

## Title
[x] Feature/Module Name: Document Update Tool Embedded Support

## Overview
[x] Brief description of purpose and scope:  
> Extend the `update_document` tool so it can modify embedded document collections (e.g., `JournalEntry.pages`, `Actor.items`) and return the updated document payload, eliminating silent failures and follow-up reads.

## Requirements
- [x] Functional Requirements:  
  - [x] Req 1: Detect operations targeting embedded collections and translate them into the appropriate Foundry APIs (`Document.updateEmbeddedDocuments` or `'-=id'` removal syntax).  
  - [x] Req 2: Ensure the tool returns the updated document as JSON (`content` or `document` field) on success.  
  - [x] Req 3: Surface actionable errors when an embedded operation cannot be executed (e.g., unknown collection, missing id).  
  - [x] Req 4: Maintain existing flat-field updates and array operations without regressions.

- [x] Non-Functional Requirements:  
  - [x] Req 1: Add targeted Jest coverage for embedded document add/delete flows.  
  - [x] Req 2: Preserve current performance expectations (no additional render cycles or redundant fetches).

## Inputs
- [x] Define expected inputs:  
  - Field: `documentType` — string — Foundry document collection.  
  - Field: `documentId` — string — target document id.  
  - Field: `updates` — object — optional flat-field updates.  
  - Field: `operations` — array — may include embedded operations with `{ action, path, id/value }` metadata.

## Outputs
- [x] Define expected outputs:  
  - Field: `content` — success message plus serialized document data.  
  - Field: `display` — human-readable confirmation.  
  - Field: `document` (or similar) — JS object representing updated document.  
  - Field: `error` — structured failure details when operations cannot complete.

## Behaviors / Flows
- [x] Primary flow:  
  1. Tool validates parameters and resolves embedded vs. flat operations.  
  2. Executes embedded modifications using Foundry APIs, executes flat updates via `DocumentAPI.updateDocument`.  
  3. Fetches latest document state and returns it in the response payload.  
  4. Logs and propagates errors when any step fails.  

- [x] Edge cases:  
  - [x] Case 1: Embedded delete with missing id → validation error.  
  - [x] Case 2: Mixed operations (embedded + flat) → both applied atomically or failure reported.  
  - [x] Case 3: Systems without targeted collection gracefully reject unsupported operations.

## Examples (Acceptance Cases)
- [x] Example 1: Delete a journal page via operations and receive document JSON lacking that page.  
- [x] Example 2: Add an actor item and update `system` data in the same request.  
- [x] Example 3 (Edge Case): Attempt to delete a non-existent embedded id returns descriptive error.

## Test Cases (for TDD seed)
- [x] Requirement → Test Case(s):  
  - Req 1 → Unit test mocking `updateEmbeddedDocuments` and verifying correct parameters.  
  - Req 2 → Test ensuring tool response includes parsed document data after update.  
  - Req 3 → Test expecting validation error for missing embedded id.  
  - Req 4 → Regression tests for existing array update behavior.

## Planning Addendum (for OOD / Implementation Strategy)
- [x] Components / Modules:  
  - `scripts/tools/document-update.js`, `scripts/core/document-api.js`, associated tests in `tests/tools`.  
- [x] Classes & Interfaces:  
  - `DocumentUpdateTool`, `DocumentAPI`.  
- [x] Reuse / DRY considerations:  
  - Extend existing operations handler rather than duplicating logic; introduce helper for embedded operations.  
- [x] MVP task breakdown:  
  1. Capture failing tests for embedded delete/add and response payload expectations.  
  2. Implement embedded operation handling and document return.  
  3. Add verification tests and documentation updates.

### Status
- [x] Specification reviewed  
- [x] Tests derived from spec  
- [x] Implementation complete  
- [x] Verification complete  
