# Specification Document

## Title
[x] Feature/Module Name: Document Creation Validation Fix

## Overview
[x] Brief description of purpose and scope:  
> Ensure DocumentAPI.createDocument no longer calls nonexistent validation helpers on Foundry document classes, allowing Gemini tool flows to create documents without runtime-errors while preserving error propagation.

## Requirements
- [x] Functional Requirements:  
  - [x] Req 1: Guard DocumentAPI.createDocument against invoking `documentClass.validate` when the method is absent.  
  - [x] Req 2: Guard DocumentAPI.updateDocument against invoking `doc.validate` when the method is absent.  
  - [x] Req 3: Preserve existing permission checks and creation/update flows, including returning plain objects from created/updated documents.  
  - [x] Req 4: Propagate validation errors emitted by Foundry (DataModelValidationError or generic errors) without masking them.  

- [x] Non-Functional Requirements:  
  - [x] Req 1: Add unit coverage to ensure createDocument succeeds when document classes lack a `validate` helper.  
  - [x] Req 2: Maintain compatibility with mocked environments used across existing tests.

## Inputs
- [x] Define expected inputs:  
  - Field: `documentType` (string)  
  - Field: `data` (object)  
  - Field: `options.folder` (string, optional)

## Outputs
- [x] Define expected outputs:  
  - Field: Plain document object with `_id` and requested properties  
  - Rules: Throws when document type unknown or creation fails/denied.

## Behaviors / Flows
- [x] Primary flow:  
  1. Tool requests creation via DocumentAPI.  
  2. API checks permissions, safely calls Foundry `create` without unsupported validators.  
  3. Tool receives created object, or error propagates cleanly.

- [x] Edge cases:  
  - [x] Case 1: Document class exposes `validate`; API still leverages it.  
  - [x] Case 2: Document class has no `validate`; API skips call and proceeds.  
  - [x] Case 3: `documentClass.create` throws validation error; API rethrows without wrapping.  

## Examples (Acceptance Cases)
- [x] Example 1: JournalEntry creation works when only `create` exists.  
- [x] Example 2: Actor update works when instance lacks `validate`.  
- [x] Example 3: Validation error thrown by `documentClass.create` or `doc.update` surfaces to caller unchanged.

## Test Cases (for TDD seed)
- [x] Requirement → Test Case(s):  
  - Req 1 & Req 3 → Unit test mocking a document class with `create` but no `validate`.  
  - Req 2 & Req 3 → Unit test mocking a document instance with missing `validate`.  
  - Req 4 → Unit test asserting thrown errors bubble up (reuse existing patterns if present).

## Planning Addendum (for OOD / Implementation Strategy)
- [x] Components / Modules:  
  - `scripts/core/document-api.js`, `tests/core/document-api-crud.test.js`.
- [x] Classes & Interfaces:  
  - `DocumentAPI` static methods.  
- [x] Reuse / DRY considerations:  
  - Do not duplicate permission checks; only adjust validation segment.
- [x] MVP task breakdown:  
  1. Write failing unit test for missing `validate`.  
  2. Update DocumentAPI to guard validation call and rely on Foundry's `create`.  
  3. Run targeted tests and update spec status/logs.

### Status
- [x] Specification reviewed  
- [x] Tests derived from spec  
- [x] Implementation complete  
- [x] Verification complete  
