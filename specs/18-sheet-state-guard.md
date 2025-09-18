# Specification Document

## Title
[x] Feature/Module Name: Document Sheet State Guard

## Overview
[x] Brief description of purpose and scope:  
> Prevent Foundry sheet race conditions by detecting when a document's sheet is open, temporarily closing it during DocumentAPI mutations, and restoring the prior state afterwards.

## Requirements
- [x] Functional Requirements:  
  - [x] Req 1: When `DocumentAPI.updateDocument` runs, detect if the target document's sheet is rendered; if so, close it before the update and reopen it afterwards.  
  - [x] Req 2: Ensure sheet restoration occurs even when the update throws (best-effort restoration).  
  - [x] Req 3: Apply the same guard to `DocumentAPI.deleteDocument` by closing an open sheet before deletion (no reopen required).  

- [x] Non-Functional Requirements:  
  - [x] Req 1: Add unit coverage verifying sheet close/open behavior during update success and failure.  
  - [x] Req 2: Maintain current behavior when no sheet is rendered (no extraneous calls).

## Inputs
- [x] Define expected inputs:  
  - Field: `documentType` (string)  
  - Field: `documentId` (string)  
  - Field: `updates` (object, update only)

## Outputs
- [x] Define expected outputs:  
  - Field: Updated or deleted document result unchanged  
  - Rules: Sheets end in original rendered state when possible.

## Behaviors / Flows
- [x] Primary flow:  
  1. Detect sheet on fetched document.  
  2. Close if rendered.  
  3. Perform update/delete.  
  4. Re-render sheet if it was previously open.  

- [x] Edge cases:  
  - [x] Case 1: Sheets lacking `close`/`render` are skipped gracefully.  
  - [x] Case 2: Update/delete throws; sheet is still reopened best-effort.  
  - [x] Case 3: Multiple rapid calls should not double close/reopen since we track per invocation only.

## Examples (Acceptance Cases)
- [x] Example 1: Journal update with open sheet leaves sheet open post-update without crashing.  
- [x] Example 2: Update failure still reopens sheet.  
- [x] Example 3: Delete with sheet closed remains unaffected.

## Test Cases (for TDD seed)
- [x] Requirement → Test Case(s):  
  - Req 1 & Req 2 → Unit test verifying close/re-render on success and failure.  
  - Req 3 → Unit test verifying delete closes an open sheet.  
  - Req 2 & Req 3 → Ensures no calls when sheet not rendered.

## Planning Addendum (for OOD / Implementation Strategy)
- [x] Components / Modules:  
  - `scripts/core/document-api.js`, `tests/core/document-api-crud.test.js`.  
- [x] Classes & Interfaces:  
  - `DocumentAPI`.  
- [x] Reuse / DRY considerations:  
  - Extract helper to manage sheet state to avoid duplication between update/delete.  
- [x] MVP task breakdown:  
  1. Add failing tests capturing sheet-state expectations.  
  2. Implement sheet guard helper in DocumentAPI.  
  3. Verify tests and update documentation artifacts.

### Status
- [x] Specification reviewed  
- [x] Tests derived from spec  
- [x] Implementation complete  
- [x] Verification complete  
