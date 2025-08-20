/**
 * @file tests/integration/simulacrum-init.test.js
 * @description Integration test to verify Simulacrum module is properly initialized
 * 
 * Test Scope:
 * - Verify Simulacrum module is loaded and active
 * - Verify module settings are available
 * - Verify game.simulacrum object is properly initialized
 * - Verify no critical initialization errors
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

/**
 * Simulacrum Module Initialization Test
 * 
 * @param {Object} session - Live FoundryVTT session from bootstrap
 * @param {Object} session.page - Puppeteer page object
 * @param {Object} session.browser - Puppeteer browser object  
 * @param {Object} session.gameState - Bootstrap verification data
 * @param {Object} permutation - Test permutation info (version, system)
 * @param {Object} config - Test configuration from test.config.json
 * @returns {Object} Test result with success status and details
 */
export default async function simulacrumInitTest(session, permutation, config) {
  const { page, gameState } = session;
  
  console.log(`Simulacrum | Integration Test -     🧪 Testing Simulacrum module initialization on ${permutation.description}`);
  
  try {
    // Wait for modules to fully load
    console.log(`Simulacrum | Integration Test -     📍 Waiting for modules to initialize...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Test 1: Verify Simulacrum module is loaded and active
    console.log(`Simulacrum | Integration Test -     📍 Verifying Simulacrum module is loaded...`);
    const moduleCheck = await page.evaluate(() => {
      const modules = game.modules;
      const simulacrumModule = modules.get('simulacrum');
      
      return {
        moduleExists: !!simulacrumModule,
        moduleActive: simulacrumModule?.active || false,
        moduleTitle: simulacrumModule?.title || 'unknown',
        moduleVersion: simulacrumModule?.version || 'unknown',
        moduleId: simulacrumModule?.id || 'unknown',
        allModulesCount: modules.size,
        activeModulesCount: Array.from(modules.values()).filter(mod => mod.active).length
      };
    });
    
    console.log(`Simulacrum | Integration Test -     📊 Module Check: ${JSON.stringify(moduleCheck, null, 2)}`);
    
    if (!moduleCheck.moduleExists) {
      throw new Error('Simulacrum module not found in module registry');
    }
    
    if (!moduleCheck.moduleActive) {
      throw new Error('Simulacrum module is not active');
    }
    
    console.log(`Simulacrum | Integration Test -     ✅ Simulacrum module loaded and active (v${moduleCheck.moduleVersion})`);
    
    // Test 2: Verify game.simulacrum object exists and is properly initialized
    console.log(`Simulacrum | Integration Test -     📍 Verifying game.simulacrum object...`);
    const simulacrumObjectCheck = await page.evaluate(() => {
      const simulacrum = window.game?.simulacrum;
      
      if (!simulacrum) {
        return { exists: false };
      }
      
      return {
        exists: true,
        hasToolRegistry: !!simulacrum.toolRegistry,
        hasAiService: !!simulacrum.aiService,
        hasContextManager: !!simulacrum.contextManager,
        hasDocumentDiscoveryEngine: !!simulacrum.documentDiscoveryEngine,
        initState: simulacrum._initState || null,
        propertyCount: Object.keys(simulacrum).length,
        properties: Object.keys(simulacrum)
      };
    });
    
    console.log(`Simulacrum | Integration Test -     📊 game.simulacrum Check: ${JSON.stringify(simulacrumObjectCheck, null, 2)}`);
    
    if (!simulacrumObjectCheck.exists) {
      throw new Error('game.simulacrum object not found');
    }
    
    if (!simulacrumObjectCheck.hasToolRegistry) {
      throw new Error('game.simulacrum.toolRegistry not found');
    }
    
    if (!simulacrumObjectCheck.hasAiService) {
      throw new Error('game.simulacrum.aiService not found');
    }
    
    console.log(`Simulacrum | Integration Test -     ✅ game.simulacrum object properly initialized with ${simulacrumObjectCheck.propertyCount} properties`);
    
    // Test 3: Verify module settings are registered
    console.log(`Simulacrum | Integration Test -     📍 Verifying module settings...`);
    const settingsCheck = await page.evaluate(() => {
      try {
        // Check for key settings
        const apiEndpoint = game.settings.get('simulacrum', 'apiEndpoint');
        const modelName = game.settings.get('simulacrum', 'modelName');
        const systemPrompt = game.settings.get('simulacrum', 'systemPrompt');
        
        return {
          success: true,
          hasApiEndpoint: apiEndpoint !== undefined,
          hasModelName: modelName !== undefined,
          hasSystemPrompt: systemPrompt !== undefined,
          apiEndpoint: typeof apiEndpoint === 'string' ? apiEndpoint.substring(0, 20) + '...' : apiEndpoint,
          modelName: modelName,
          systemPromptLength: typeof systemPrompt === 'string' ? systemPrompt.length : 0
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });
    
    console.log(`Simulacrum | Integration Test -     📊 Settings Check: ${JSON.stringify(settingsCheck, null, 2)}`);
    
    if (!settingsCheck.success) {
      throw new Error(`Settings check failed: ${settingsCheck.error}`);
    }
    
    if (!settingsCheck.hasApiEndpoint) {
      throw new Error('simulacrum.apiEndpoint setting not found');
    }
    
    console.log(`Simulacrum | Integration Test -     ✅ Module settings properly registered`);
    
    // Test 4: Verify initialization state
    console.log(`Simulacrum | Integration Test -     📍 Verifying initialization state...`);
    const initStateCheck = await page.evaluate(() => {
      const initState = window.game?.simulacrum?._initState;
      
      return {
        hasInitState: !!initState,
        initComplete: initState?.initComplete || false,
        readyComplete: initState?.readyComplete || false,
        initTimestamp: initState?.initTimestamp || null,
        readyTimestamp: initState?.readyTimestamp || null
      };
    });
    
    console.log(`Simulacrum | Integration Test -     📊 Init State Check: ${JSON.stringify(initStateCheck, null, 2)}`);
    
    if (!initStateCheck.hasInitState) {
      throw new Error('Module initialization state not found');
    }
    
    if (!initStateCheck.initComplete) {
      throw new Error('Module init hook not completed');
    }
    
    if (!initStateCheck.readyComplete) {
      throw new Error('Module ready hook not completed');
    }
    
    console.log(`Simulacrum | Integration Test -     ✅ Module initialization state verified`);
    
    // Test 5: Take screenshot for verification
    const screenshotPath = join(PROJECT_ROOT, 'tests', 'artifacts', `simulacrum-init-${permutation.id}-${Date.now()}.png`);
    await page.screenshot({ 
      path: screenshotPath,
      fullPage: true 
    });
    
    console.log(`Simulacrum | Integration Test -     📸 Screenshot saved: ${screenshotPath}`);
    
    // Return successful test result
    return {
      success: true,
      permutation,
      message: 'Simulacrum module initialization test completed successfully',
      details: {
        moduleCheck,
        simulacrumObjectCheck,
        settingsCheck,
        initStateCheck
      },
      artifacts: {
        screenshot: screenshotPath,
        timestamp: Date.now()
      }
    };
    
  } catch (error) {
    console.log(`Simulacrum | Integration Test -     ❌ Simulacrum module initialization test failed: ${error.message}`);
    
    // Take screenshot on failure for debugging
    const failureScreenshot = join(PROJECT_ROOT, 'tests', 'artifacts', `simulacrum-init-FAILED-${permutation.id}-${Date.now()}.png`);
    try {
      await page.screenshot({ 
        path: failureScreenshot,
        fullPage: true 
      });
      console.log(`Simulacrum | Integration Test -     📸 Failure screenshot saved: ${failureScreenshot}`);
    } catch (screenshotError) {
      console.log(`Simulacrum | Integration Test -     ⚠️ Could not take failure screenshot: ${screenshotError.message}`);
    }
    
    return {
      success: false,
      permutation,
      message: error.message,
      error: error.stack,
      artifacts: {
        failureScreenshot: failureScreenshot,
        timestamp: Date.now()
      }
    };
  }
}