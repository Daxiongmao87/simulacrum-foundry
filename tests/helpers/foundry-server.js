/**
 * @file FoundryVTT server management utilities for integration tests
 * @description Helper functions for launching and managing FoundryVTT instances during testing
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import testConfig from './test-config.js';

// Handle __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Launches a FoundryVTT server instance for testing
 * @param {object} options - Server configuration options
 * @returns {Promise<ChildProcess>} - The spawned FoundryVTT process
 */
export async function launchFoundryServer(options = {}) {
  const baseFoundryConfig = testConfig.getFoundryConfig(options.testId || 0);
  const config = { ...baseFoundryConfig, ...options };
  
  // Prepare test data directory with minimal world
  const worldName = options.worldName || baseFoundryConfig.worldName || 'test-world';
  await prepareTestDataDirectory(config.dataPath, worldName);
  
  console.log(`[Test] Launching FoundryVTT server on port ${config.port}...`);
  
  const foundryProcess = spawn('node', [
    path.join(path.dirname(config.executablePath), 'resources/app/main.js'),
    '--headless',
    `--port=${config.port}`,
    `--dataPath=${config.dataPath}`,
    '--noupnp',
    '--nossl'
  ], {
    detached: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // Ensure headless mode for Node.js FoundryVTT
      NODE_ENV: 'test',
      FOUNDRY_HEADLESS: 'true',
      DISPLAY: undefined  // Remove display to prevent GUI
    }
  });
  
  // Handle server output for debugging
  foundryProcess.stdout.on('data', (data) => {
    if (process.env.DEBUG_FOUNDRY) {
      console.log(`[FoundryVTT] ${data.toString().trim()}`);
    }
  });
  
  foundryProcess.stderr.on('data', (data) => {
    if (process.env.DEBUG_FOUNDRY) {
      console.error(`[FoundryVTT Error] ${data.toString().trim()}`);
    }
  });
  
  // Wait for server to start
  await waitForServer(`http://localhost:${config.port}`, config.startupTimeout);
  
  console.log(`[Test] FoundryVTT server ready at http://localhost:${config.port}`);
  return foundryProcess;
}

/**
 * Gracefully shuts down a FoundryVTT server process
 * @param {ChildProcess} foundryProcess - The FoundryVTT process to shutdown
 * @param {number} timeout - Timeout in milliseconds
 */
export async function shutdownFoundryServer(foundryProcess, timeout = testConfig.getFoundryConfig().shutdownTimeout) {
  if (!foundryProcess) return;
  
  console.log('[Test] Shutting down FoundryVTT server...');
  
  // Send SIGTERM for graceful shutdown
  foundryProcess.kill('SIGTERM');
  
  // Wait for graceful shutdown
  const shutdownPromise = new Promise((resolve) => {
    foundryProcess.on('exit', resolve);
  });
  
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      console.log('[Test] Force killing FoundryVTT server...');
      foundryProcess.kill('SIGKILL');
      resolve();
    }, timeout);
  });
  
  await Promise.race([shutdownPromise, timeoutPromise]);
  console.log('[Test] FoundryVTT server shutdown complete');
}

/**
 * Waits for FoundryVTT server to become available
 * @param {string} url - Server URL to check
 * @param {number} timeout - Timeout in milliseconds
 */
export async function waitForServer(url, timeout = testConfig.getFoundryConfig().startupTimeout) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        return true;
      }
    } catch (error) {
      // Server not ready yet, continue waiting
    }
    
    // Wait 1 second before next attempt
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`FoundryVTT server failed to start within ${timeout}ms`);
}

/**
 * Prepares test data directory with minimal configuration and test world
 * @param {string} dataPath - Path to test data directory
 * @param {string} worldName - Name of the world to create
 */
export async function prepareTestDataDirectory(dataPath, worldName = 'test-world') {
  try {
    // Create data directory structure
    await fs.mkdir(dataPath, { recursive: true });
    await fs.mkdir(path.join(dataPath, 'Data'), { recursive: true });
    await fs.mkdir(path.join(dataPath, 'Config'), { recursive: true });
    await fs.mkdir(path.join(dataPath, 'Logs'), { recursive: true });
    await fs.mkdir(path.join(dataPath, 'Data', 'worlds'), { recursive: true });
    await fs.mkdir(path.join(dataPath, 'Data', 'systems'), { recursive: true });
    await fs.mkdir(path.join(dataPath, 'Data', 'modules'), { recursive: true });
    
    // Create minimal test world with worldbuilding system
    await createMinimalTestWorld(dataPath, worldName);
    
    console.log(`[Test] Prepared test data directory and world at ${dataPath}`);
  } catch (error) {
    console.error('[Test] Failed to prepare test data directory:', error);
    throw error;
  }
}

/**
 * Cleanup test data directory
 * @param {string} dataPath - Path to test data directory
 */
export async function cleanupTestData(dataPath) {
  try {
    await fs.rm(dataPath, { recursive: true, force: true });
    console.log(`[Test] Cleaned up test data directory at ${dataPath}`);
  } catch (error) {
    console.error('[Test] Failed to cleanup test data:', error);
  }
}

/**
 * Helper function to create a complete test setup with FoundryVTT and Puppeteer
 * @param {object} options - Configuration options
 * @param {number} testId - Unique ID for the test to ensure isolated environments
 * @returns {Promise<{browser, page, foundryProcess}>} - Test environment objects
 */
export async function setupTestEnvironment(options = {}, testId = 0) {
  const { launch } = await import('puppeteer');
  const foundryConfig = testConfig.getFoundryConfig(testId);
  const puppeteerConfig = testConfig.getPuppeteerConfig();

  // Launch FoundryVTT server with world name
  const worldName = options.foundry?.worldName || foundryConfig.worldName || 'test-world';
  const foundryProcess = await launchFoundryServer({ ...foundryConfig, ...options.foundry, worldName, testId });
  
  try {
    // Launch Puppeteer browser
    const browser = await launch({
      headless: puppeteerConfig.headless,
      slowMo: puppeteerConfig.slowMo,
      timeout: puppeteerConfig.timeout,
      defaultViewport: puppeteerConfig.viewport,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    
    const page = await browser.newPage();
    
    // Perform simplified FoundryVTT setup workflow
    const mergedConfig = { ...foundryConfig, ...options.foundry, worldName };
    await performCompleteFoundrySetup(page, mergedConfig, puppeteerConfig, options);
    
    console.log('[Test] Complete test environment ready');
    return { browser, page, foundryProcess };
    
  } catch (error) {
    // Cleanup on failure
    await shutdownFoundryServer(foundryProcess);
    throw error;
  }
}

/**
 * Performs simplified FoundryVTT setup workflow for integration testing
 * @param {Page} page - Puppeteer page instance
 * @param {object} foundryConfig - Foundry configuration
 * @param {object} puppeteerConfig - Puppeteer configuration
 * @param {object} options - Additional options
 */
export async function performCompleteFoundrySetup(page, foundryConfig, puppeteerConfig, options = {}) {
  console.log('[Test] Starting simplified FoundryVTT setup workflow...');
  
  const worldName = options.worldName || foundryConfig.worldName || 'test-world';
  
  // First, try to navigate to FoundryVTT base URL to see what we get
  const baseUrl = `http://localhost:${foundryConfig.port}`;
  console.log(`[Test] First navigating to base FoundryVTT URL: ${baseUrl}`);
  
  await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: puppeteerConfig.timeout });
  
  // Debug: Check what we got
  const basePageTitle = await page.title();
  const basePageUrl = page.url();
  console.log(`[Test] Base page loaded - Title: '${basePageTitle}', URL: '${basePageUrl}'`);
  
  // Since base URL goes to license, let's see if we can navigate from there to setup
  if (basePageUrl.includes('/license')) {
    console.log('[Test] Found license page, looking for setup or continue options...');
    
    // Try to find and click any continue/setup buttons
    try {
      await page.waitForSelector('button, a', { timeout: 5000 });
      const buttons = await page.$$eval('button, a', buttons => 
        buttons.map(btn => ({ 
          text: btn.textContent?.trim(), 
          href: btn.href,
          onclick: btn.onclick?.toString() 
        }))
      );
      console.log('[Test] Available buttons/links:', JSON.stringify(buttons, null, 2));
      
      // Try to click a setup or continue button if found
      for (const btn of buttons) {
        if (btn.text && (btn.text.toLowerCase().includes('setup') || 
                        btn.text.toLowerCase().includes('continue') ||
                        btn.text.toLowerCase().includes('accept'))) {
          console.log(`[Test] Clicking button: ${btn.text}`);
          await page.click(`button:has-text("${btn.text}"), a:has-text("${btn.text}")`);
          await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });
          break;
        }
      }
    } catch (e) {
      console.log('[Test] No clickable elements found on license page, trying direct navigation');
    }
  }
  
  // Try to navigate to setup page directly
  const setupUrl = `http://localhost:${foundryConfig.port}/setup`;
  console.log(`[Test] Trying to navigate to setup page: ${setupUrl}`);
  
  await page.goto(setupUrl, { waitUntil: 'networkidle0', timeout: puppeteerConfig.timeout });
  
  // Debug: Check what we got
  const pageTitle = await page.title();
  const pageUrl = page.url();
  console.log(`[Test] Page loaded - Title: '${pageTitle}', URL: '${pageUrl}'`);
  
  // Debug: Check what JavaScript objects are available
  const debugInfo = await page.evaluate(() => {
    return {
      hasWindow: typeof window !== 'undefined',
      hasGame: typeof window.game !== 'undefined',
      gameReady: window.game?.ready || false,
      hasUI: typeof window.ui !== 'undefined',
      hasCONFIG: typeof window.CONFIG !== 'undefined',
      modules: window.game?.modules ? Object.keys(window.game.modules.keys || {}) : [],
      errors: window.console?.error?.toString() || 'No console errors captured'
    };
  });
  
  console.log(`[Test] Debug info:`, JSON.stringify(debugInfo, null, 2));
  
  // Wait for FoundryVTT game interface to initialize
  console.log('[Test] Waiting for FoundryVTT game interface to initialize...');
  try {
    await page.waitForFunction(
      () => window.game && window.game.ready && window.ui && window.CONFIG,
      { timeout: 30000 }  // Shorter timeout for debugging
    );
    console.log('[Test] FoundryVTT game interface initialized successfully');
  } catch (error) {
    console.log('[Test] Failed to initialize FoundryVTT game interface:', error.message);
    
    // Additional debugging
    const finalDebugInfo = await page.evaluate(() => {
      return {
        currentGame: window.game ? {
          ready: window.game.ready,
          world: window.game.world,
          user: window.game.user?.name
        } : null,
        pageContent: document.body?.innerHTML?.substring(0, 500) || 'No body content'
      };
    });
    console.log(`[Test] Final debug info:`, JSON.stringify(finalDebugInfo, null, 2));
    throw error;
  }
  
  // Wait for simulacrum module to be loaded and active
  console.log('[Test] Waiting for simulacrum module to be active...');
  try {
    await page.waitForFunction(
      () => window.game && window.game.modules && window.game.modules.get('simulacrum')?.active,
      { timeout: 10000 }
    );
    console.log('[Test] Simulacrum module is active');
  } catch (error) {
    console.log('[Test] Simulacrum module not active, continuing anyway:', error.message);
    // Don't throw here, module might not be needed for basic tests
  }
  
  console.log('[Test] Simplified FoundryVTT setup workflow finished');
}


/**
 * Create a minimal test world configuration file
 * @param {string} dataPath - Path to test data directory
 * @param {string} worldName - Name of the world to create
 */
export async function createMinimalTestWorld(dataPath, worldName) {
  console.log(`[Test] Creating minimal test world: ${worldName}`);
  
  const worldPath = path.join(dataPath, 'Data', 'worlds', worldName);
  
  try {
    // Create world directory
    await fs.mkdir(worldPath, { recursive: true });
    
    // Create minimal world.json with worldbuilding system (built-in, no installation needed)
    const worldConfig = {
      id: worldName,
      title: 'Integration Test World',
      description: 'Automated test world for Simulacrum integration tests',
      system: 'worldbuilding',
      coreVersion: '12.0.0',
      systemVersion: '2.0.0',
      version: '12.331',
      compatibility: {
        minimum: '12',
        verified: '12',
        maximum: '12'
      },
      nextSession: null,
      resetKeys: false,
      safeMode: false,
      modules: [
        {
          id: 'simulacrum',
          active: true
        }
      ]
    };
    
    const worldConfigPath = path.join(worldPath, 'world.json');
    await fs.writeFile(worldConfigPath, JSON.stringify(worldConfig, null, 2));
    
    console.log(`[Test] Minimal test world '${worldName}' created successfully at ${worldPath}`);
  } catch (error) {
    console.error('[Test] Failed to create minimal test world:', error);
    throw error;
  }
}




/**
 * Helper function to teardown complete test environment
 * @param {object} testEnv - Test environment from setupTestEnvironment
 */
export async function teardownTestEnvironment({ browser, page, foundryProcess }) {
  try {
    // Step 6-9: Complete cleanup workflow
    if (page && !page.isClosed()) {
      await performCompleteFoundryCleanup(page, foundryProcess);
      await page.close();
    }
    
    if (browser) {
      await browser.close();
    }
    
    // Get the dataPath from the config used to launch the server
    const foundryConfig = testConfig.getFoundryConfig(); // Assuming default testId 0 for cleanup if not specified
    await shutdownFoundryServer(foundryProcess);
    await cleanupTestData(foundryConfig.dataPath);
    
    console.log('[Test] Test environment teardown complete');
  } catch (error) {
    console.error('[Test] Error during teardown:', error);
  }
}

/**
 * Simplified cleanup - just close the page gracefully
 * @param {Page} page - Puppeteer page instance
 * @param {ChildProcess} foundryProcess - FoundryVTT process (unused, kept for compatibility)
 */
export async function performCompleteFoundryCleanup(page, foundryProcess) {
  console.log('[Test] Starting simplified FoundryVTT cleanup...');
  
  try {
    // No complex UI navigation needed - just close gracefully
    // World cleanup is handled by cleanupTestData which removes the entire data directory
    console.log('[Test] Simplified FoundryVTT cleanup completed');
  } catch (error) {
    console.error('[Test] Error during FoundryVTT cleanup:', error);
    // Cleanup errors are not critical - process will be killed anyway
  }
}

