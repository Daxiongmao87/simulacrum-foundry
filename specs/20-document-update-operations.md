# Specification Document

## Title
[x] Feature/Module Name: Document Update Tool Array Operations

## Overview
[x] Brief description of purpose and scope:  
> Extend the `update_document` tool so callers can describe array mutations (insert, replace, delete) without resupplying the full document payload. The tool will interpret the requested operations, derive minimal update payloads, and forward them through `DocumentAPI`.

## Requirements
- [x] Functional Requirements:  
  - [x] Req 1: Accept a structured `operations` array parameter describing array actions (`insert`, `replace`, `delete`) with target path and metadata.  
  - [x] Req 2: Validate each operation (required fields, bounds, supported actions) before applying updates.  
  - [x] Req 3: When operations are present, fetch the target document, apply actions to compute the new array value, and emit a standard update payload.  
  - [x] Req 4: Preserve compatibility with existing `updates` payloads; merge explicit updates and computed results before calling `DocumentAPI.updateDocument`.

- [x] Non-Functional Requirements (performance, scalability, etc.):  
  - [x] Req 1: Maintain existing logging/confirmation behavior and avoid redundant document fetches.  
  - [x] Req 2: Cover new behaviors with targeted Jest tests (validation and delete workflow at minimum).

## Inputs
- [x] Define expected inputs:  
  - Field: `documentType` — string — must map to a known Foundry collection.  
  - Field: `documentId` — string — must reference an existing document.  
  - Field: `updates` — object — optional when operations provided; merges into final payload.  
  - Field: `operations` — array — optional list of mutation descriptors.  
    - Operation fields: `path` (string, dot notation), `action` (`insert|replace|delete`), optional `index` (integer ≥ 0, default append for inserts), optional `value` (any JSON-serializable payload).

## Outputs
- [x] Define expected outputs:  
  - Field: `content` — unchanged success string summarizing the update.  
  - Field: `display` — unchanged user-facing confirmation.  
  - Field: `error` — populated on validation/runtime failures including invalid operations or retrieval errors.

## Behaviors / Flows
- [x] Primary flow:  
  1. Tool validates schema (`documentType`, `documentId`, `updates`, `operations`).  
  2. If `operations` present, fetch document via `DocumentAPI.getDocument`.  
  3. Apply operations sequentially, computing array replacements and merging into payload.  
  4. Call `DocumentAPI.updateDocument` with merged payload; return existing success response.

- [x] Edge cases:  
  - [x] Case 1: Unknown document type → existing error response (pre-validation).  
  - [x] Case 2: Operation references non-array path → validation error returned to caller.  
  - [x] Case 3: Delete/replace with out-of-bounds index → validation error.  
  - [x] Case 4: Conflicting updates for same path resolved deterministically (operation results override values from `updates`).

## Examples (Acceptance Cases)
- [x] Example 1: Delete the third bond from `system.bonds` array produces payload with array lacking that entry.  
- [x] Example 2: Insert new feature at index 1 for `system.features` array.  
- [x] Example 3 (Edge Case): Delete with missing index returns validation error message and aborts update.

## Test Cases (for TDD seed)
- [x] Requirement → Test Case(s):  
  - Req 1 & Req 2 → unit tests validating schema errors for malformed operations.  
  - Req 3 → unit test ensuring delete operation fetches doc, removes entry, and forwards trimmed array.  
  - Req 4 → unit test covering merged payload when both `updates` and `operations` provided.

## Planning Addendum (for OOD / Implementation Strategy)
- [x] Components / Modules:  
  - `scripts/tools/document-update.js`, `tests/tools/document-update.test.js`.  
- [x] Classes & Interfaces:  
  - `DocumentUpdateTool` — extend to interpret operations.  
- [x] Reuse / DRY considerations:  
  - Reuse `DocumentAPI.getDocument` for baseline data; add minimal helper for dot-path array operations.  
- [x] MVP task breakdown:  
  1. Add failing Jest tests capturing operation validation and delete workflow.  
  2. Extend tool schema/execute logic to support operations and pass tests.  
  3. Update documentation artifacts and rerun verification.

### Status
- [x] Specification reviewed  
- [x] Tests derived from spec  
- [x] Implementation complete  
- [x] Verification complete  
