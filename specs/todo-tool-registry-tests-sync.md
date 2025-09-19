# Specification Document

## Title
[x] Feature/Module Name: Tool Registry Test Alignment

## Overview
[x] Brief description of purpose and scope:  
> Update the tool-registry test suite to match the current `ToolRegistry` API (hooks removed). Ensure tests cover the post-refactor surface.

## Requirements
- [x] Functional Requirements:  
  - [x] Req 1: Replace or retire failing hook-related tests in `tests/core/tool-registry.test.js`.  
  - [x] Req 2: Add coverage for current behaviors (registration, execution, stats, validation) without referencing non-existent APIs.  

- [ ] Non-Functional Requirements:  
  - [ ] Req 1: _________________________________________________  

## Inputs
- [x] Existing test suite and `ToolRegistry` implementation.

## Outputs
- [x] Passing `tests/core/tool-registry.test.js` reflecting actual API.

## Behaviors / Flows
- [x] Tests should assert registration, duplicate prevention, dependency handling, permission gating, and export parity.
- [x] Remove expectations around `addHook`, `removeHook`, `_emitHook` (deprecated).

## Examples (Acceptance Cases)
- [x] Example 1: Running `npm test -- tests/core/tool-registry.test.js` passes without hook errors.

## Test Cases
- [x] Derived from updated behavior set; ensure coverage map unchanged or improved.

## Planning Addendum
- [x] Components: `tests/core/tool-registry.test.js`, supporting fixtures/mocks.  
- [x] MVP Tasks:  
  1. Audit remaining hook-oriented expectations.  
  2. Rewrite/replace with assertions for current features (stats, permission validation, etc.).  
  3. Run targeted jest suite.

### Status
- [x] Specification reviewed  
- [ ] Tests derived from spec  
- [ ] Implementation complete  
- [ ] Verification complete  
