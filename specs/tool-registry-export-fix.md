# Specification Document

## Title
[x] Feature/Module Name: Tool Registry Export Fix

## Overview
[x] Brief description of purpose and scope:  
> Address the runtime syntax error thrown when `scripts/core/simulacrum-core.js` imports `toolRegistry` from `./tool-registry.js`. Ensure the registry exposes the expected named export and dependent modules load without breaking Foundry initialization.

## Requirements
- [x] Functional Requirements:  
  - [x] Req 1: `tool-registry.js` must expose a stable named export `toolRegistry` consumable by ES module importers.  
  - [x] Req 2: Dependent modules (`simulacrum-core.js`, `conversation-engine.js`, `tool-loop-handler.js`, etc.) must load without throwing during Foundry boot.

- [ ] Non-Functional Requirements (performance, scalability, etc.):  
  - [x] Req 1: Preserve backwards compatibility for default import usage of the registry (if any) to avoid broader refactors.  
  - [ ] Req 2: _________________________________________________  

## Inputs
- [x] Define expected inputs:  
  - Field: Module import statements  
  - Type: ES module static import  
  - Constraints: Must resolve to both named and default registry references if requested.

## Outputs
- [x] Define expected outputs:  
  - Field: Module namespace export  
  - Type: Object containing `toolRegistry` symbol  
  - Rules: Importing `{ toolRegistry }` returns singleton instance with existing API.

## Behaviors / Flows
- [x] Primary flow:  
  1. Foundry loads `simulacrum-core.js` as an ES module.  
  2. Module imports `{ toolRegistry }` from `./tool-registry.js`.  
  3. Named export resolves and module initialization continues without syntax errors.  

- [x] Edge cases:  
  - [x] Case 1: Legacy consumers using default import `import toolRegistry from './tool-registry.js'` still function.  
  - [x] Case 2: Unit tests or mocks importing the class definition remain unaffected.

## Examples (Acceptance Cases)
- [x] Example 1:  
  Input: `import { toolRegistry } from './tool-registry.js'` → Output: Object with methods like `getToolSchemas`.  
- [x] Example 2:  
  Input: `import registry from './tool-registry.js'` → Output: Same singleton instance.  
- [x] Example 3 (Edge Case):  
  Input: `import { ToolRegistry } from './tool-registry.js'` → Output: Class definition remains importable.

## Test Cases (for TDD seed)
- [x] Requirement → Test Case(s):  
  - Req 1 → `tool-registry.test.js` should assert that named export is defined and identical to default export.  
  - Req 2 → Smoke test executing `toolRegistry.getToolSchemas()` after import without errors.

## Planning Addendum (for OOD / Implementation Strategy)
- [x] Components / Modules:  
  - `scripts/core/tool-registry.js`, `tests/tool-registry.spec.js` (new or updated)
- [x] Classes & Interfaces:  
  - `ToolRegistry` class remains unchanged; export surface adjusted.
- [x] Reuse / DRY considerations:  
  - Reuse existing singleton instance; avoid duplicate instantiation across files.
- [x] MVP task breakdown:  
  1. Update registry exports to guarantee explicit named export.  
  2. Update or add tests verifying export contract.  
  3. Run jest to confirm no regressions.

### Status
- [x] Specification reviewed  
- [x] Tests derived from spec  
- [x] Implementation complete  
- [ ] Verification complete  
