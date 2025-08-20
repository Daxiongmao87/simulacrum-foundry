/**
 * @file tests/integration/hello-world-clean.test.js
 * @description Clean hello world integration test following the new architecture
 * 
 * This test demonstrates the clean separation between bootstrap infrastructure
 * and integration testing logic as defined in tests/SPECIFICATION.md:
 * 
 * - Receives live FoundryVTT session from bootstrap infrastructure
 * - Tests basic functionality against the live session
 * - Returns structured test results
 * - Has no infrastructure concerns (no Docker, containers, cleanup)
 * 
 * Test Scope:
 * - Verify FoundryVTT is running and responsive
 * - Verify game session is properly initialized
 * - Verify user is authenticated as GM
 * - Verify basic UI elements are present
 * - Generate test artifacts (screenshots, logs)
 */

/**
 * Hello World Integration Test
 * 
 * @param {Object} session - Live FoundryVTT session from bootstrap
 * @param {Object} session.page - Puppeteer page object
 * @param {Object} session.browser - Puppeteer browser object  
 * @param {Object} session.gameState - Bootstrap verification data
 * @param {Object} permutation - Test permutation info (version, system)
 * @param {Object} config - Test configuration from test.config.json
 * @returns {Object} Test result with success status and details
 */
export default async function helloWorldTest(session, permutation, config) {
  const { page, gameState } = session;
  
  console.log(`    🧪 Testing basic FoundryVTT functionality on ${permutation.description}`);
  
  try {
    // Test 1: Verify game is ready and responsive
    console.log(`    📍 Verifying game state...`);
    const gameCheck = await page.evaluate(() => {
      return {
        gameExists: typeof window.game !== 'undefined',
        gameReady: window.game?.ready || false,
        view: window.game?.view || 'unknown',
        worldName: window.game?.world?.title || 'unknown',
        systemId: window.game?.system?.id || 'unknown',
        systemTitle: window.game?.system?.title || 'unknown',
        isGM: window.game?.user?.isGM || false,
        userId: window.game?.user?.id || 'unknown',
        userName: window.game?.user?.name || 'unknown',
        url: window.location.href
      };
    });
    
    console.log(`    📊 Game State: ${JSON.stringify(gameCheck, null, 2)}`);
    
    // Verify core requirements
    if (!gameCheck.gameExists) {
      throw new Error('Game object not found - FoundryVTT not properly loaded');
    }
    
    if (!gameCheck.gameReady) {
      throw new Error('Game not ready - initialization incomplete');
    }
    
    if (!gameCheck.isGM) {
      throw new Error('User not authenticated as GM');
    }
    
    if (gameCheck.systemId !== permutation.system) {
      throw new Error(`Expected system ${permutation.system}, got ${gameCheck.systemId}`);
    }
    
    console.log(`    ✅ Game state verification passed`);
    
    // Test 2: Verify UI elements are present
    console.log(`    📍 Waiting 10 seconds for UI to fully load...`);
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log(`    📍 Verifying UI elements...`);
    const uiCheck = await page.evaluate(() => {
      return {
        sidebar: !!document.querySelector('#sidebar'),
        canvas: !!document.querySelector('canvas#board'),
        chatLog: !!document.querySelector('.chat-log'),
        hotbar: !!document.querySelector('#hotbar'),
        navigation: !!document.querySelector('#navigation'),
        controls: !!document.querySelector('#controls'),
        players: !!document.querySelector('#players'),
        logo: !!document.querySelector('#logo')
      };
    });
    
    console.log(`    📊 UI Elements: ${JSON.stringify(uiCheck, null, 2)}`);
    
    // Verify essential UI elements
    const requiredElements = ['sidebar', 'canvas', 'chatLog'];
    for (const element of requiredElements) {
      if (!uiCheck[element]) {
        throw new Error(`Required UI element missing: ${element}`);
      }
    }
    
    console.log(`    ✅ UI elements verification passed`);
    
    // Test 3: Test basic interaction - send a test message to chat
    console.log(`    📍 Testing basic interaction...`);
    const chatTest = await page.evaluate(() => {
      try {
        // Send a test message to chat
        const chatData = {
          content: `🧪 Hello World Test - ${new Date().toISOString()}`,
          user: game.user.id,
          speaker: { alias: 'Integration Test' }
        };
        
        ChatMessage.create(chatData);
        
        return {
          success: true,
          messageContent: chatData.content
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });
    
    if (!chatTest.success) {
      throw new Error(`Chat interaction failed: ${chatTest.error}`);
    }
    
    console.log(`    ✅ Basic interaction test passed - message sent: "${chatTest.messageContent}"`);
    
    // Test 4: Generate test artifacts
    console.log(`    📍 Generating test artifacts...`);
    
    // Take screenshot as proof of successful test
    const screenshotPath = `tests/artifacts/hello-world-${permutation.id}-${Date.now()}.png`;
    await page.screenshot({ 
      path: screenshotPath,
      fullPage: true 
    });
    
    console.log(`    📸 Screenshot saved: ${screenshotPath}`);
    
    // Collect performance metrics
    const performanceMetrics = await page.evaluate(() => {
      const nav = performance.navigation;
      const timing = performance.timing;
      
      return {
        pageLoadTime: timing.loadEventEnd - timing.navigationStart,
        domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
        firstPaint: performance.getEntriesByType('paint').find(entry => entry.name === 'first-paint')?.startTime || 0,
        memoryUsage: performance.memory ? {
          used: performance.memory.usedJSHeapSize,
          total: performance.memory.totalJSHeapSize,
          limit: performance.memory.jsHeapSizeLimit
        } : null
      };
    });
    
    console.log(`    📊 Performance Metrics: ${JSON.stringify(performanceMetrics, null, 2)}`);
    
    // Return successful test result
    return {
      success: true,
      permutation,
      message: 'Hello World test completed successfully',
      details: {
        gameState: gameCheck,
        uiElements: uiCheck,
        chatTest,
        performanceMetrics
      },
      artifacts: {
        screenshot: screenshotPath,
        timestamp: Date.now()
      }
    };
    
  } catch (error) {
    console.log(`    ❌ Hello World test failed: ${error.message}`);
    
    // Take screenshot on failure for debugging
    const failureScreenshot = `tests/artifacts/hello-world-FAILED-${permutation.id}-${Date.now()}.png`;
    try {
      await page.screenshot({ 
        path: failureScreenshot,
        fullPage: true 
      });
      console.log(`    📸 Failure screenshot saved: ${failureScreenshot}`);
    } catch (screenshotError) {
      console.log(`    ⚠️ Could not take failure screenshot: ${screenshotError.message}`);
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
