/**
 * @file tests/integration/hello-world.test.js
 * @description Simple Hello World Integration Test - Bootstraps FoundryVTT and takes a screenshot
 * 
 * This test uses the new bootstrap infrastructure to:
 * 1. Start a FoundryVTT container with the specified system/version
 * 2. Run the complete bootstrap process (license, EULA, system install, world creation, GM login)
 * 3. Take a screenshot as proof of successful integration
 */

import { BootstrapRunner } from '../helpers/bootstrap/bootstrap-runner.js';
import { readFileSync } from 'fs';

class HelloWorldTest {
  async execute(testContext) {
    console.log(`🎯 Executing Hello World test for ${testContext.permutation.id}...`);
    
    // Step 1: Take screenshot as proof of successful integration
    const screenshotPath = await this.testRunner.takeScreenshot(
      testContext.page,
      `hello-world-success-${testContext.permutation.id}`,
      { fullPage: true }
    );
    
    // Step 2: Verify we're in an active game world
    console.log('🎯 Verifying game world state...');
    
    const gameState = await testContext.page.evaluate(() => {
      return {
        gameExists: typeof window.game !== 'undefined',
        gameReady: window.game?.ready || false,
        canvasExists: typeof window.canvas !== 'undefined',
        canvasReady: window.canvas?.ready || false,
        view: window.game?.view || 'unknown',
        worldName: window.game?.world?.title || 'unknown',
        systemId: window.game?.system?.id || 'unknown',
        userRole: window.game?.user?.role || 'unknown',
        isGM: window.game?.user?.isGM || false,
        url: window.location.href,
        uiElements: {
          sidebar: !!document.querySelector('#sidebar'),
          canvas: !!document.querySelector('canvas#board'),
          chatLog: !!document.querySelector('#chat-log'),
          hotbar: !!document.querySelector('#hotbar')
        }
      };
    });
    
    console.log('📊 Game state verification:', gameState);
    
    // Verification assertions
    const verifications = [
      { check: gameState.gameExists, message: 'Game object exists' },
      { check: gameState.gameReady, message: 'Game is ready' },
      { check: gameState.view === 'game', message: 'In game view' },
      { check: gameState.worldName && gameState.worldName !== 'unknown', message: 'World loaded' },
      { check: gameState.systemId === testContext.permutation.system, message: `System is ${testContext.permutation.system}` },
      { check: gameState.isGM, message: 'User is GM' },
      { check: gameState.uiElements.sidebar, message: 'Sidebar UI present' },
      { check: gameState.uiElements.canvas, message: 'Game canvas present' }
    ];
    
    const failedVerifications = verifications.filter(v => !v.check);
    
    if (failedVerifications.length > 0) {
      throw new Error(`Verification failed: ${failedVerifications.map(f => f.message).join(', ')}`);
    }
    
    console.log('✅ All verifications passed!');
    console.log(`🎯 World: ${gameState.worldName} (${gameState.systemId})`);
    console.log(`👤 User: GM (Role: ${gameState.userRole})`);
    console.log(`📸 Screenshot: ${screenshotPath}`);
    
    return {
      success: true,
      gameState,
      screenshotPath,
      verifications: verifications.length
    };
  }
}

describe('Hello World - FoundryVTT Integration', () => {
  let testRunner;
  let config;
  
  beforeAll(async () => {
    // Load test configuration
    config = JSON.parse(readFileSync('tests/config/test.config.json', 'utf8'));
    testRunner = new BootstrapRunner();
    await testRunner.initialize();
  });

  it('should bootstrap FoundryVTT and take a screenshot', async () => {
    console.log('🚀 Starting Hello World integration test...');
    
    // Use first available permutation from config
    const permutation = {
      id: `${config['foundry-versions'][0]}-${config['foundry-systems'][0]}`,
      version: config['foundry-versions'][0],
      system: config['foundry-systems'][0],
      systemName: getSystemDisplayName(config['foundry-systems'][0]),
      dockerImage: `${config.docker.imagePrefix}-${config['foundry-versions'][0].toLowerCase()}`
    };
    
    console.log(`🎯 Testing permutation: ${permutation.id} (${permutation.systemName})`);
    
    let testContext;
    
    try {
      // Step 1: Set up complete test environment with full bootstrap
      console.log('🔧 Setting up test environment with full bootstrap...');
      testContext = await testRunner.setupTestEnvironment(permutation, {
        fullBootstrap: true
      });
      
      console.log(`✅ Environment ready on port ${testContext.port}`);
      console.log(`📦 Container ID: ${testContext.containerId}`);
      console.log(`📊 Bootstrap status: ${testContext.bootstrapResult.bootstrapSuccess ? 'SUCCESS' : 'FAILED'}`);
      
      if (!testContext.bootstrapResult.bootstrapSuccess) {
        throw new Error(`Bootstrap failed: ${testContext.bootstrapResult.failureReason || 'Unknown error'}`);
      }
      
      // Step 2: Execute Hello World test
      const helloWorldTest = new HelloWorldTest(testRunner);
      const testResult = await testRunner.executeIntegrationTest(testContext, 
        async (ctx) => await helloWorldTest.execute(ctx)
      );
      
      if (!testResult.success) {
        throw new Error(`Test execution failed: ${testResult.error}`);
      }
      
      console.log('🎉 Hello World integration test completed successfully!');
      console.log(`📊 Test duration: ${testResult.duration}ms`);
      
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      throw error;
    } finally {
      // Cleanup
      if (testContext) {
        console.log('🧹 Cleaning up test environment...');
        await testRunner.cleanupTestContext(testContext);
      }
    }
  }, 900000); // 15 minute timeout for full bootstrap + test
});

/**
 * Get display name for game system
 */
function getSystemDisplayName(systemId) {
  const systemNames = {
    'dnd5e': 'Dungeons & Dragons 5th Edition',
    'pf2e': 'Pathfinder 2nd Edition',
    'swade': 'Savage Worlds Adventure Edition',
    'fate': 'Fate Core System'
  };
  return systemNames[systemId] || systemId;
}
