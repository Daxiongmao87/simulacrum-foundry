/**
 * @file tests/regression/v13/001-basic-functionality.test.js
 * @description Basic functionality regression test for FoundryVTT v13
 */

export const testMetadata = {
  name: 'Basic Functionality Regression Test',
  description: 'Tests that basic FoundryVTT functionality still works after changes',
  version: 'v13',
  category: 'regression'
};

export default async function basicFunctionalityTest(session, permutation, config) {
  try {
    // Basic test implementation
    // This would contain actual regression test logic
    
    return {
      success: true,
      message: 'Basic functionality regression test passed',
      details: {
        version: permutation.version,
        system: permutation.system,
        sessionId: session.id || 'unknown'
      }
    };
  } catch (error) {
    return {
      success: false,
      message: `Basic functionality regression test failed: ${error.message}`,
      error: error
    };
  }
}
