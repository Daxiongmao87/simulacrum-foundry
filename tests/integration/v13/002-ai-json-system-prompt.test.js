/**
 * @file tests/integration/v13/002-ai-json-system-prompt.test.js
 * @description Integration test for Issue #90: System prompt JSON response effectiveness (v13)
 * 
 * This is identical to the v12 version as the JSON parsing logic is version-agnostic.
 * The test validates system prompt effectiveness across FoundryVTT versions.
 */

// Re-export the v12 test since JSON parsing logic is version-agnostic
export { default, testMetadata } from '../v12/002-ai-json-system-prompt.test.js';