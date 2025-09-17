# Specification Document

## Title
[x] Feature/Module Name: Gemini Tool Schema Normalization

## Overview
[x] Brief description of purpose and scope:  
> Fix Gemini requests so function declarations generated from Simulacrum tools emit JSON Schema that the Gemini API accepts, avoiding per-property `required` flags and surfacing required fields via the top-level schema.

## Requirements
- [x] Functional Requirements:  
  - [x] Req 1: Sanitize tool parameter schemas before sending to Gemini by removing boolean `required` properties from field definitions.  
  - [x] Req 2: Collect required property names into the schema-level `required` array while preserving existing entries.  
  - [x] Req 3: Apply the sanitation recursively so nested object parameters also follow Gemini expectations.  
  - [x] Req 4: Ensure converted schemas remain unchanged for OpenAI providers.

- [x] Non-Functional Requirements (performance, scalability, etc.):  
  - [x] Req 1: Maintain backward compatibility with existing tool registry definitions.  
  - [x] Req 2: Cover the sanitation logic with unit tests targeting `_mapToolsForGemini` or equivalent helper.

## Inputs
- [x] Define expected inputs:  
  - Field: Tool schemas from `toolRegistry.getToolSchemas()`  
  - Type: Array of OpenAI-style function specs  
  - Constraints: May include per-property `required: true` flags.

## Outputs
- [x] Define expected outputs:  
  - Field: Gemini `functionDeclarations` array  
  - Type: Array of sanitized function declaration objects  
  - Rules: No `required` booleans on property definitions; required property names surface in schema `required` array.

## Behaviors / Flows
- [x] Primary flow:  
  1. Tool registry returns a function schema containing property-level `required: true`.  
  2. Gemini mapper sanitizes the schema, moving `required` info into the array and stripping invalid booleans.  
  3. Gemini request succeeds with 200 instead of 400.

- [x] Edge cases:  
  - [x] Case 1: Schema already has a `required` array; sanitation appends missing names without duplicates.  
  - [x] Case 2: Nested object properties with `required: true` receive recursive sanitation.  
  - [x] Case 3: Non-object schemas (e.g., strings) pass through untouched.

## Examples (Acceptance Cases)
- [x] Example 1: Simple schema with two required properties generates `required: ['a','b']` and properties without boolean flags.  
- [x] Example 2: Nested schema ensures inner object uses `required` array for its properties.  
- [x] Example 3 (Edge Case): Schema lacking any required flags remains unchanged aside from ensuring type defaults to `object`.

## Test Cases (for TDD seed)
- [x] Requirement → Test Case(s):  
  - Req 1 & Req 2 → Unit test verifying sanitation removes boolean flags and populates required array.  
  - Req 3 → Unit test exercising nested object sanitation.  
  - Req 4 / Non-Functional Req 1 → Regression check ensuring OpenAI provider path unaffected (implicit via existing tests).

## Planning Addendum (for OOD / Implementation Strategy)
- [x] Components / Modules:  
  - `scripts/core/ai-client.js`, `tests/core/ai-client.test.js`.
- [x] Classes & Interfaces:  
  - `AIClient` Gemini mapping helper.
- [x] Reuse / DRY considerations:  
  - Reuse existing tool schema structure; implement dedicated sanitizer helper invoked only for Gemini.  
  - Avoid mutating original schema objects to keep OpenAI path intact.
- [x] MVP task breakdown:  
  1. Add sanitation helper with recursive handling in `AIClient`.  
  2. Update `_mapToolsForGemini` to use sanitized schema.  
  3. Write unit tests covering sanitation scenarios.  
  4. Run targeted Jest suite.

### Status
- [x] Specification reviewed  
- [x] Tests derived from spec  
- [x] Implementation complete  
- [x] Verification complete  
