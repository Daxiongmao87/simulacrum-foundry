/**
 * @file tests/integration/mock-disabled.test.js
 * @description Mock test file to verify enable/disable functionality
 */

// Test metadata - this test is disabled by default
export const testMetadata = {
  name: 'mock-disabled',
  enabled: false,  // This test is disabled
  category: 'mock',
  priority: 'low',
  timeout: 5000,
  description: 'Mock test to verify disabled tests are filtered out',
  dependencies: [],
  tags: ['mock', 'test']
};

export default async function mockDisabledTest(session, permutation, config) {
  // This test should not run when auto-discovery is used
  return {
    success: false,
    message: 'This test should not have been executed - it is disabled'
  };
}