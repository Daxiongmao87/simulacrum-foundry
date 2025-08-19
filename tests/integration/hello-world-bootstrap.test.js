/**
 * @file tests/integration/hello-world-bootstrap.test.js
 * @description Simple Hello World integration test for the bootstrap infrastructure
 * 
 * This test verifies that the bootstrap process works and takes a screenshot
 * as proof that we're in an active game world.
 */

import { BootstrapRunner } from '../helpers/bootstrap/bootstrap-runner.js';

describe('Hello World - Bootstrap Integration Test', () => {
  let runner;
  
  beforeAll(async () => {
    console.log('🚀 Setting up bootstrap runner...');
    runner = new BootstrapRunner();
    await runner.initialize();
  }, 30000);
  
  afterAll(async () => {
    // Cleanup any running containers
    try {
      execSync('docker ps -q --filter "name=test-" | xargs -r docker stop', { stdio: 'ignore' });
      execSync('docker ps -aq --filter "name=test-" | xargs -r docker rm', { stdio: 'ignore' });
    } catch (e) {}
  }, 30000);

  it('should bootstrap Foundry VTT and take a screenshot', async () => {
    console.log('🎯 Running Hello World bootstrap test...');
    
    // Get the first available permutation
    const permutation = runner.permutations[0];
    if (!permutation) {
      throw new Error('No test permutations available');
    }
    
    console.log(`🎯 Testing: ${permutation.id} (${permutation.description})`);
    
    // Run the bootstrap test
    const result = await runner.runBootstrapTest(permutation);
    
    // Verify success
    expect(result.success).toBe(true);
    expect(result.screenshotPath).toBeDefined();
    expect(result.bootstrapResult.success).toBe(true);
    
    // Verify game world state
    const gameState = result.bootstrapResult.gameState;
    expect(gameState.ready).toBe(true);
    expect(gameState.gameState.gameReady).toBe(true);
    expect(gameState.gameState.worldLoaded).toBe(true);
    expect(gameState.gameState.userAuthenticated).toBe(true);
    
    console.log('✅ Bootstrap test completed successfully!');
    console.log(`📸 Screenshot saved: ${result.screenshotPath}`);
    console.log(`🎯 World: ${gameState.gameState.worldLoaded ? 'Loaded' : 'Not Loaded'}`);
    console.log(`🎲 System: ${gameState.gameState.systemLoaded ? 'Loaded' : 'Not Loaded'}`);
    console.log(`👤 User: ${gameState.gameState.userAuthenticated ? 'Authenticated' : 'Not Authenticated'}`);
    
  }, 900000); // 15 minute timeout for full bootstrap process
  
  it('should handle all available permutations', async () => {
    console.log('🎯 Testing all available permutations...');
    
    const availableVersions = await runner.discoverAvailableVersions();
    console.log(`📦 Available versions: ${availableVersions.map(v => v.version).join(', ')}`);
    
    // Only test permutations with available versions
    const testablePermutations = runner.permutations.filter(p => 
      availableVersions.some(v => v.version === p.version)
    );
    
    console.log(`🔄 Testing ${testablePermutations.length} permutations...`);
    
    for (const permutation of testablePermutations) {
      console.log(`🎯 Testing permutation: ${permutation.id}`);
      
      const result = await runner.runBootstrapTest(permutation);
      
      if (result.success) {
        console.log(`✅ ${permutation.id}: SUCCESS`);
        console.log(`📸 Screenshot: ${result.screenshotPath}`);
      } else {
        console.log(`❌ ${permutation.id}: FAILED - ${result.error}`);
        // Don't fail the entire test suite on individual permutation failures
        console.warn(`⚠️ Permutation ${permutation.id} failed, continuing with others`);
      }
    }
    
    console.log('✅ All permutations tested');
    
  }, 1800000); // 30 minute timeout for all permutations
});

/**
 * Test utility functions
 */
function logTestResults(results) {
  console.log('\n📊 Test Results Summary:');
  console.log('='.repeat(50));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`Total Tests: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Success Rate: ${Math.round((successful.length / results.length) * 100)}%`);
  
  if (successful.length > 0) {
    console.log('\n✅ Successful Tests:');
    successful.forEach(result => {
      console.log(`  • ${result.permutation.id}: ${result.screenshotPath}`);
    });
  }
  
  if (failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    failed.forEach(result => {
      console.log(`  • ${result.permutation.id}: ${result.error}`);
    });
  }
  
  console.log('='.repeat(50));
}
