/**
 * Ready State Validation Usage Examples (Issue #44)
 * 
 * This file demonstrates how to use the validateReadyState() method
 * in integration tests for FoundryVTT module testing.
 */

import { ConcurrentDockerTestRunner } from '../helpers/concurrent-docker-test-runner.js';

/**
 * Example 1: Basic Ready State Validation
 * 
 * This example shows the standard usage pattern for validating
 * FoundryVTT ready state after completing the bootstrap sequence.
 */
async function basicReadyStateValidation() {
  const testRunner = new ConcurrentDockerTestRunner();
  
  // Setup test environment (this includes the full bootstrap sequence)
  const context = {
    version: 'v13',
    versionZip: 'FoundryVTT-Node-13.347.zip',
    system: 'dnd5e',
    systemName: 'D&D 5th Edition'
  };
  
  const { page, containerId, port } = await testRunner.setupTestEnvironment(context);
  
  try {
    // Validate ready state - this is automatically called in bootstrap sequence
    const readyStateResult = await testRunner.validateReadyState(page);
    
    if (readyStateResult.success) {
      console.log('✅ FoundryVTT is ready for testing!');
      console.log(`Details: ${readyStateResult.details}`);
      
      // Your module integration tests can now run safely
      await runModuleTests(page);
      
    } else {
      console.error('❌ FoundryVTT ready state validation failed');
      console.error(`Reason: ${readyStateResult.details}`);
      
      // Check specific validation results for debugging
      console.log('Validation breakdown:', readyStateResult.validationResults);
    }
    
  } finally {
    await testRunner.cleanupTestEnvironment(containerId);
  }
}

/**
 * Example 2: Custom Validation Options
 * 
 * This example shows how to customize the validation behavior
 * for different testing scenarios.
 */
async function customValidationOptions() {
  const testRunner = new ConcurrentDockerTestRunner();
  const { page, containerId } = await testRunner.setupTestEnvironment(/* context */);
  
  try {
    // Test without requiring canvas (for headless scenarios)
    const headlessResult = await testRunner.validateReadyState(page, {
      requireCanvas: false,
      requireGMPermissions: true,
      timeout: 45000,
      componentTimeout: 10000
    });
    
    // Test with relaxed GM requirements (for player-perspective tests)
    const playerResult = await testRunner.validateReadyState(page, {
      requireCanvas: true,
      requireGMPermissions: false,
      timeout: 30000
    });
    
    console.log('Headless validation:', headlessResult.success);
    console.log('Player validation:', playerResult.success);
    
  } finally {
    await testRunner.cleanupTestEnvironment(containerId);
  }
}

/**
 * Example 3: Integration Test Pattern
 * 
 * This example shows the recommended pattern for using ready state validation
 * in actual integration tests.
 */
describe('Simulacrum Module Integration Tests', () => {
  let testRunner;
  
  beforeAll(() => {
    testRunner = new ConcurrentDockerTestRunner();
  });
  
  afterAll(async () => {
    await testRunner.globalCleanup();
  });
  
  test('module loads correctly in ready FoundryVTT environment', async () => {
    const context = {
      version: 'v13',
      versionZip: 'FoundryVTT-Node-13.347.zip',
      system: 'dnd5e',
      systemName: 'D&D 5th Edition'
    };
    
    const { page, containerId } = await testRunner.setupTestEnvironment(context);
    
    try {
      // The bootstrap sequence automatically validates ready state
      // But you can manually validate specific conditions if needed
      const validationResult = await testRunner.validateReadyState(page, {
        requireCanvas: true,
        requireGMPermissions: true,
        timeout: 30000
      });
      
      expect(validationResult.success).toBe(true);
      expect(validationResult.validationResults.foundryFramework.valid).toBe(true);
      expect(validationResult.validationResults.gameSystem.valid).toBe(true);
      expect(validationResult.validationResults.worldAccess.valid).toBe(true);
      expect(validationResult.validationResults.gmAuthentication.valid).toBe(true);
      expect(validationResult.validationResults.uiComponents.valid).toBe(true);
      expect(validationResult.validationResults.canvasSystem.valid).toBe(true);
      expect(validationResult.validationResults.moduleEnvironment.valid).toBe(true);
      
      // Now test your module functionality
      const moduleLoaded = await page.evaluate(() => {
        return window.game.modules.get('simulacrum')?.active === true;
      });
      
      expect(moduleLoaded).toBe(true);
      
    } finally {
      await testRunner.cleanupTestEnvironment(containerId);
    }
  }, 120000); // Extended timeout for Docker operations
});

/**
 * Example 4: Debugging Failed Validation
 * 
 * This example shows how to debug validation failures
 * by examining the detailed validation results.
 */
async function debugValidationFailure() {
  const testRunner = new ConcurrentDockerTestRunner();
  const { page, containerId } = await testRunner.setupTestEnvironment(/* context */);
  
  try {
    const result = await testRunner.validateReadyState(page);
    
    if (!result.success) {
      console.log('🔍 Debugging validation failure...');
      
      // Check each validation step
      Object.entries(result.validationResults).forEach(([step, validation]) => {
        if (validation.checked && !validation.valid) {
          console.error(`❌ ${step}: ${validation.details}`);
        } else if (validation.checked && validation.valid) {
          console.log(`✅ ${step}: ${validation.details}`);
        } else {
          console.log(`⏭️  ${step}: Not checked`);
        }
      });
      
      // Common debugging actions based on failure type
      if (!result.validationResults.foundryFramework.valid) {
        console.log('🔧 Try: Check if FoundryVTT server is fully started');
        console.log('🔧 Try: Increase componentTimeout in validation options');
      }
      
      if (!result.validationResults.canvasSystem.valid) {
        console.log('🔧 Try: Set requireCanvas: false for headless tests');
        console.log('🔧 Try: Check if world has a valid scene');
      }
      
      if (!result.validationResults.gmAuthentication.valid) {
        console.log('🔧 Try: Verify GM user is correctly configured');
        console.log('🔧 Try: Set requireGMPermissions: false for non-GM tests');
      }
    }
    
  } finally {
    await testRunner.cleanupTestEnvironment(containerId);
  }
}

/**
 * Example 5: Using testAcrossVersions with Ready State Validation
 * 
 * This example shows how ready state validation integrates with
 * cross-version testing.
 */
function crossVersionTestExample() {
  const testRunner = new ConcurrentDockerTestRunner();
  
  testRunner.testAcrossVersions('Ready State Validation', async (page, context) => {
    // Ready state validation is automatically performed in setupTestEnvironment
    // The page and context are guaranteed to be in a validated ready state
    
    console.log(`Testing on FoundryVTT ${context.version} with ${context.systemName}`);
    
    // Perform version-specific validation if needed
    const customValidation = await testRunner.validateReadyState(page, {
      timeout: 60000, // Longer timeout for older versions
      requireCanvas: true,
      requireGMPermissions: true
    });
    
    expect(customValidation.success).toBe(true);
    
    // Your module tests here...
    const moduleReady = await page.evaluate(() => {
      return !!(window.game && window.game.ready && window.game.modules);
    });
    
    expect(moduleReady).toBe(true);
  });
}

// Mock function for demonstration
async function runModuleTests(page) {
  // Your actual module integration tests would go here
  console.log('Running module-specific tests...');
}

export {
  basicReadyStateValidation,
  customValidationOptions,
  debugValidationFailure,
  crossVersionTestExample
};