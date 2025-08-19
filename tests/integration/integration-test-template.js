/**
 * @file tests/integration/integration-test-template.js
 * @description Integration Test Template - Boilerplate for FoundryVTT integration tests
 * 
 * This template provides a complete structure for creating integration tests that:
 * 1. Automatically bootstrap their own FoundryVTT environment
 * 2. Run comprehensive tests against the bootstrapped environment
 * 3. Automatically clean up via Jest infrastructure
 * 4. Include proper error handling and logging
 * 5. Follow best practices for integration testing
 * 
 * CONFIGURATION APPROACH:
 * - Centralized configuration: test.config.json contains all system defaults
 * - Test-specific overrides: Only override what's specific to your test
 * - No duplication: Don't hardcode systems, timeouts, or other config values
 * 
 * COPY THIS FILE AND MODIFY FOR YOUR SPECIFIC INTEGRATION TEST
 * 
 * Usage:
 * 1. Copy this file to your new test file
 * 2. Update the describe block name and description
 * 3. Modify only the test-specific overrides (world name, description, etc.)
 * 4. Add your specific test cases
 * 5. Update Jest test timeouts based on your test complexity
 */

import puppeteer from 'puppeteer';
import { 
  bootstrapFoundryEnvironment,
  loadBootstrapConfig,
  quickBootstrap 
} from '../helpers/bootstrap/index.js';

// ============================================================================
// CONFIGURATION SECTION
// ============================================================================
// 
// IMPORTANT: This template follows the DRY principle for configuration:
// - All system defaults come from tests/config/test.config.json
// - Only override what's specific to your test
// - Don't duplicate systems, timeouts, retries, or other config values
// 
// The loadBootstrapConfig() function automatically merges:
// 1. Centralized defaults from test.config.json
// 2. Environment variable overrides
// 3. Test-specific overrides (defined below)
// 4. Final runtime overrides

// Test environment configuration
const TEST_CONFIG = {
  // Test enablement flag (set to true to run this test)
  enableTest: process.env.ENABLE_INTEGRATION_TEST === 'true',
  
  // Test-specific overrides (everything else comes from test.config.json)
  testOverrides: {
    // World configuration (overrides defaults)
    worldName: 'Integration Test World',
    worldDescription: 'Automated test world for integration testing',
    
    // Test-specific behavior
    takeScreenshots: true,      // Take screenshots during bootstrap
    
    // Note: Systems, timeouts, retries, etc. come from test.config.json
    // Only override what's specific to this test
  },
  
  // Test timeouts (for Jest test cases)
  timeouts: {
    verification: 120000,       // 2 minutes for verification tests
    interaction: 60000,         // 1 minute for interaction tests
    total: 900000               // 15 minutes total test time
  }
};

// ============================================================================
// TEST SUITE DEFINITION
// ============================================================================

// Jest test suite - only runs when ENABLE_INTEGRATION_TEST=true
describe('Integration Test Template - FoundryVTT Environment', () => {
  // ============================================================================
  // TEST SETUP AND TEARDOWN
  // ============================================================================
  
  let browser;
  let page;
  let bootstrapResult;

  beforeAll(async () => {
    // Skip if not enabled
    if (!TEST_CONFIG.enableTest) {
      console.log('⏭️ Integration test disabled. Set ENABLE_INTEGRATION_TEST=true to run.');
      return;
    }

    console.log('🚀 Integration Test: Starting automated bootstrap process...');
    
    try {
      // Step 1: Launch browser
      console.log('🌐 Step 1: Launching browser...');
      browser = await puppeteer.launch({
        headless: process.env.CI === 'true',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: { width: 1920, height: 1080 }
      });
      
      page = await browser.newPage();
      
      // Enable console logging for debugging
      page.on('console', (msg) => {
        console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`);
      });

      // Enable page error logging
      page.on('pageerror', (error) => {
        console.error(`[BROWSER ERROR] ${error.message}`);
      });

      // Step 2: Bootstrap FoundryVTT environment
      console.log('🔧 Step 2: Bootstrapping FoundryVTT environment...');
      
      // Load configuration for bootstrap (uses centralized test.config.json)
      const config = loadBootstrapConfig({
        ...TEST_CONFIG.testOverrides,
        // You can override any settings here if needed
        // systems: ['pf2e'], // Example: test with Pathfinder instead
        // worldName: 'Custom Test World', // Example: custom world name
      });

      console.log('📋 Bootstrap configuration loaded:', {
        foundryUrl: config.foundryUrl,      // From test.config.json
        systems: config.systems,            // From test.config.json
        worldName: config.worldName,        // From test overrides
        timeouts: config.bootstrap.timeouts, // From test.config.json
        source: 'Centralized test.config.json + test overrides'
      });

      // Run the full bootstrap process
      bootstrapResult = await bootstrapFoundryEnvironment(page, config);
      
      if (!bootstrapResult.success) {
        throw new Error(`Bootstrap failed: ${JSON.stringify(bootstrapResult.errors, null, 2)}`);
      }

      console.log('✅ Bootstrap completed successfully!');
      console.log('📊 Bootstrap results:', {
        containerReady: bootstrapResult.results.containerReady.success,
        licenseSubmitted: bootstrapResult.results.licenseSubmitted.success,
        systemsInstalled: bootstrapResult.results.systemsInstalled.success,
        worldCreated: bootstrapResult.results.worldCreated.success,
        gmAuthenticated: bootstrapResult.results.gmAuthenticated.success,
        readyStateValidated: bootstrapResult.results.readyStateValidated.success
      });

    } catch (error) {
      console.error('❌ Bootstrap failed:', error.message);
      
      // Take screenshot of failure state for debugging
      try {
        if (page) {
          await page.screenshot({ 
            path: 'integration-test-bootstrap-failure.png', 
            fullPage: true 
          });
          console.log('📸 Failure screenshot saved: integration-test-bootstrap-failure.png');
        }
      } catch (screenshotError) {
        console.error('Failed to take failure screenshot:', screenshotError.message);
      }
      
      throw new Error(`Bootstrap process failed: ${error.message}`);
    }

    console.log('🎯 Integration Test: Environment ready for testing!');
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    
    // Note: Container cleanup happens automatically via Jest globalTeardown
    console.log('🧹 Integration Test: Browser closed, containers will be cleaned up automatically');
  });

  // ============================================================================
  // CORE TEST CASES
  // ============================================================================
  
  describe('Environment Verification', () => {
    it('should verify FoundryVTT environment is ready', async () => {
      // Skip if not enabled
      if (!TEST_CONFIG.enableTest) {
        console.log('⏭️ Test skipped - Integration test disabled');
        return;
      }

      console.log('🔍 Verifying FoundryVTT environment...');
      
      // Wait for FoundryVTT to be fully loaded (should already be ready from bootstrap)
      await page.waitForFunction(() => {
        return typeof window.game !== 'undefined' && window.game.ready;
      }, { timeout: TEST_CONFIG.timeouts.verification });
      
      console.log('✅ FoundryVTT environment verified and ready');

      // Basic environment checks
      const environmentCheck = await page.evaluate(() => {
        const game = window.game;
        const canvas = window.canvas;
        
        return {
          gameReady: game?.ready || false,
          gameView: game?.view || 'unknown',
          canvasReady: canvas?.ready || false,
          hasWorld: !!game?.world,
          hasUser: !!game?.user,
          systemId: game?.system?.id || 'unknown'
        };
      });

      console.log('📊 Environment status:', environmentCheck);

      // Verify basic requirements
      expect(environmentCheck.gameReady).toBe(true);
      expect(environmentCheck.gameView).toBe('game');
      expect(environmentCheck.canvasReady).toBe(true);
      expect(environmentCheck.hasWorld).toBe(true);
      expect(environmentCheck.hasUser).toBe(true);

      console.log('✅ Environment verification passed!');
    }, TEST_CONFIG.timeouts.verification);
  });

  describe('Game System Verification', () => {
    it('should verify required game systems are installed and functional', async () => {
      // Skip if not enabled
      if (!TEST_CONFIG.enableTest) {
        console.log('⏭️ Test skipped - Integration test disabled');
        return;
      }

      console.log('🎮 Verifying game systems...');

      const systemVerification = await page.evaluate((expectedSystems) => {
        const game = window.game;
        const world = game.world;
        
        // Check if expected systems are installed
        const installedSystems = [];
        if (world.system) {
          installedSystems.push(world.system.id);
        }
        
        // Check system-specific data
        const systemData = {
          worldSystem: world.system?.id || 'unknown',
          worldSystemTitle: world.system?.title || 'unknown',
          worldSystemVersion: world.system?.version || 'unknown',
          hasSystemData: !!world.system,
          expectedSystems: expectedSystems,
          systemsMatch: expectedSystems.includes(world.system?.id)
        };

        return {
          installedSystems,
          systemData,
          collections: {
            actors: game.collections.get('actors')?.size || 0,
            items: game.collections.get('items')?.size || 0,
            scenes: game.collections.get('scenes')?.size || 0
          }
        };
      }, config.systems); // Use systems from centralized config

      console.log('📊 System verification results:', systemVerification);

      // Verify system installation
      expect(systemVerification.systemData.hasSystemData).toBe(true);
      expect(systemVerification.systemData.systemsMatch).toBe(true);
      
      // Verify collections have data
      expect(systemVerification.collections.actors).toBeGreaterThan(0);
      expect(systemVerification.collections.scenes).toBeGreaterThan(0);

      console.log('✅ Game system verification passed!');
    }, TEST_CONFIG.timeouts.verification);
  });

  describe('User Authentication and Permissions', () => {
    it('should verify user authentication and permissions', async () => {
      // Skip if not enabled
      if (!TEST_CONFIG.enableTest) {
        console.log('⏭️ Test skipped - Integration test disabled');
        return;
      }

      console.log('👤 Verifying user authentication and permissions...');

      const userVerification = await page.evaluate(() => {
        const game = window.game;
        const user = game.user;
        const world = game.world;
        
        return {
          user: {
            id: user?.id || 'unknown',
            name: user?.name || 'unknown',
            role: user?.role || 'unknown',
            isGM: user?.isGM || false,
            isAuthenticated: !!user
          },
          permissions: {
            canCreate: world?.canCreate || false,
            canUpdate: world?.canUpdate || false,
            canDelete: world?.canDelete || false
          },
          world: {
            id: world?.id || 'unknown',
            title: world?.title || 'unknown',
            description: world?.description || 'unknown'
          }
        };
      });

      console.log('📊 User verification results:', userVerification);

      // Verify user authentication
      expect(userVerification.user.isAuthenticated).toBe(true);
      expect(userVerification.user.id).toBeTruthy();
      expect(userVerification.user.name).toBeTruthy();
      
      // Verify GM permissions (should be GM from bootstrap)
      expect(userVerification.user.isGM).toBe(true);
      expect(userVerification.permissions.canCreate).toBe(true);
      expect(userVerification.permissions.canUpdate).toBe(true);

      console.log('✅ User authentication and permissions verification passed!');
    }, TEST_CONFIG.timeouts.verification);
  });

  // ============================================================================
  // CUSTOM TEST CASES - ADD YOUR SPECIFIC TESTS HERE
  // ============================================================================
  
  describe('Custom Functionality Tests', () => {
    it('should test your specific integration requirements', async () => {
      // Skip if not enabled
      if (!TEST_CONFIG.enableTest) {
        console.log('⏭️ Test skipped - Integration test disabled');
        return;
      }

      console.log('🧪 Running custom functionality tests...');

      // ============================================================================
      // ADD YOUR CUSTOM TEST LOGIC HERE
      // ============================================================================
      
      // Example: Test specific game mechanics
      // const gameMechanics = await page.evaluate(() => {
      //   // Your custom test logic here
      //   return { success: true, data: 'test result' };
      // });
      
      // Example: Test UI interactions
      // await page.click('#some-button');
      // await page.waitForSelector('#some-result');
      
      // Example: Test data persistence
      // const savedData = await page.evaluate(() => {
      //   return localStorage.getItem('test-data');
      // });

      // ============================================================================
      // PLACEHOLDER TEST - REPLACE WITH YOUR ACTUAL TESTS
      // ============================================================================
      
      // This is a placeholder - replace with your actual test logic
      const customTestResult = await page.evaluate(() => {
        // Simulate a custom test
        return {
          success: true,
          message: 'Custom test placeholder - replace with your actual test logic',
          timestamp: new Date().toISOString()
        };
      });

      console.log('📊 Custom test results:', customTestResult);

      // Verify your custom test requirements
      expect(customTestResult.success).toBe(true);
      expect(customTestResult.message).toBeTruthy();

      console.log('✅ Custom functionality tests passed!');
    }, TEST_CONFIG.timeouts.interaction);
  });

  // ============================================================================
  // UTILITY TEST CASES - MODIFY AS NEEDED
  // ============================================================================
  
  describe('Performance and Stability', () => {
    it('should verify environment stability and performance', async () => {
      // Skip if not enabled
      if (!TEST_CONFIG.enableTest) {
        console.log('⏭️ Test skipped - Integration test disabled');
        return;
      }

      console.log('⚡ Testing environment stability and performance...');

      // Test canvas performance
      const performanceCheck = await page.evaluate(() => {
        const canvas = window.canvas;
        
        return {
          canvasReady: canvas?.ready || false,
          hasScene: !!canvas?.scene,
          sceneDimensions: canvas?.dimensions || null,
          gridType: canvas?.grid?.type || 'none',
          performance: {
            hasAnimation: typeof canvas?.animate === 'function',
            hasPan: typeof canvas?.pan === 'function',
            hasRecenter: typeof canvas?.recenter === 'function'
          }
        };
      });

      console.log('📊 Performance check results:', performanceCheck);

      // Verify performance requirements
      expect(performanceCheck.canvasReady).toBe(true);
      expect(performanceCheck.hasScene).toBe(true);
      expect(performanceCheck.performance.hasPan).toBe(true);
      expect(performanceCheck.performance.hasRecenter).toBe(true);

      console.log('✅ Performance and stability tests passed!');
    }, TEST_CONFIG.timeouts.interaction);
  });
});

// ============================================================================
// HELPER FUNCTIONS - ADD YOUR CUSTOM HELPERS HERE
// ============================================================================

/**
 * Custom helper function example
 * @param {string} selector - CSS selector to wait for
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<boolean>} True if element found
 */
async function waitForElement(selector, timeout = 10000) {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch (error) {
    console.log(`Element not found: ${selector}`);
    return false;
  }
}

/**
 * Take a screenshot with timestamp
 * @param {string} prefix - Screenshot filename prefix
 * @returns {Promise<string>} Screenshot filename
 */
async function takeTimestampedScreenshot(prefix = 'integration-test') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${prefix}-${timestamp}.png`;
  
  try {
    await page.screenshot({ path: filename, fullPage: true });
    console.log(`📸 Screenshot saved: ${filename}`);
    return filename;
  } catch (error) {
    console.error(`Failed to take screenshot: ${error.message}`);
    return null;
  }
}

// ============================================================================
// EXPORT CONFIGURATION FOR EXTERNAL USE
// ============================================================================

export const INTEGRATION_TEST_CONFIG = {
  ...TEST_CONFIG,
  // Add any additional configuration exports here
};

export { waitForElement, takeTimestampedScreenshot };
