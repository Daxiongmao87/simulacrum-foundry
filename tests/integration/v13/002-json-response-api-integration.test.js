/**
 * @file tests/integration/v13/002-json-response-api-integration.test.js
 * @description Level 2 API Integration Test for Issue #90: JSON Response System Validation (v13)
 * 
 * This re-exports the v12 test since API integration testing is version-agnostic.
 * The JSON parsing components work identically across FoundryVTT versions.
 */

// Re-export the v12 test since API integration patterns are version-agnostic
export { default, testMetadata } from '../v12/002-json-response-api-integration.test.js';