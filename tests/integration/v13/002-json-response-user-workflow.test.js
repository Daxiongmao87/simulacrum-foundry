/**
 * @file tests/integration/v13/002-json-response-user-workflow.test.js
 * @description Level 1 User Workflow Test for Issue #90: JSON Response Reliability (v13)
 * 
 * This re-exports the v12 test since user workflow testing is version-agnostic.
 * The user experience should be consistent across FoundryVTT versions.
 */

// Re-export the v12 test since user workflow patterns are version-agnostic
export { default, testMetadata } from '../v12/002-json-response-user-workflow.test.js';