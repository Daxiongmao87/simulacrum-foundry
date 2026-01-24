/**
 * Base Test Fixtures for Simulacrum E2E Tests
 * 
 * Provides extended Playwright test with Foundry-specific fixtures:
 * - Authenticated page
 * - World-launched page (per-system)
 * - Simulacrum-ready page
 * 
 * Multi-System Support:
 * - Each test project runs against a specific game system
 * - The `systemId` fixture provides the current system being tested
 * - The `worldId` fixture returns the world for the current system
 */

import { test as base, expect } from '@playwright/test';
import * as helpers from './foundry-helpers.js';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, '../setup/.test-state.json');

/**
 * Load test state from global setup
 */
function loadTestState() {
  if (!existsSync(STATE_FILE)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Extended test fixtures
 */
export const test = base.extend({
  /**
   * Current system ID being tested (from project config)
   */
  systemId: async ({}, use, testInfo) => {
    // Get system ID from project metadata or use options
    const systemId = testInfo.project.use?.systemId || 
                     testInfo.project.metadata?.systemId ||
                     process.env.TEST_SYSTEM_ID || 
                     'dnd5e';
    await use(systemId);
  },
  
  /**
   * Admin key from environment
   */
  adminKey: async ({}, use) => {
    const state = loadTestState();
    const key = state?.env?.FOUNDRY_ADMIN_KEY || 
                process.env.FOUNDRY_ADMIN_KEY || 
                'test-admin-key';
    await use(key);
  },
  
  /**
   * World ID for the current system being tested
   */
  worldId: async ({ systemId }, use) => {
    const state = loadTestState();
    
    // Look up world ID from the worlds map
    let worldId;
    if (state?.worlds && state.worlds[systemId]) {
      worldId = state.worlds[systemId];
    } else {
      // Fallback to environment variable or default
      worldId = process.env.TEST_WORLD_ID || 'simulacrum-test-world';
      
      // For multi-system, append system ID
      const systemIds = (process.env.TEST_SYSTEM_IDS || '').split(',').filter(Boolean);
      if (systemIds.length > 1) {
        worldId = `${worldId}-${systemId}`;
      }
    }
    
    await use(worldId);
  },
  
  /**
   * All system IDs being tested
   */
  allSystemIds: async ({}, use) => {
    const state = loadTestState();
    const systemIds = state?.systemIds || 
                      (process.env.TEST_SYSTEM_IDS || 'dnd5e').split(',').filter(Boolean);
    await use(systemIds);
  },
  
  /**
   * Page that has authenticated as admin
   */
  adminPage: async ({ page, adminKey }, use) => {
    await helpers.loginAsAdmin(page, adminKey);
    await use(page);
  },
  
  /**
   * Page with world launched and ready (for current system)
   * 
   * IMPORTANT: This fixture performs a complete reset after each test.
   * The world is exited and returned to setup, ensuring each test starts
   * with a clean, freshly-launched world.
   */
  gamePage: async ({ page, adminKey, worldId, systemId }, use, testInfo) => {
    console.log(`[fixture] Setting up gamePage for system: ${systemId}, world: ${worldId}`);
    
    // Login as admin
    await helpers.loginAsAdmin(page, adminKey);
    
    // Launch the test world for this system
    await helpers.launchWorld(page, worldId);
    
    // Join as Gamemaster
    await helpers.joinAsUser(page, 'Gamemaster');
    
    // Wait for everything to be ready
    await helpers.waitForFoundryReady(page);
    
    await use(page);
    
    // === TEARDOWN: Complete reset after each test ===
    console.log(`[fixture] Tearing down gamePage - returning to setup for clean state`);
    await helpers.returnToSetup(page);
  },
  
  /**
   * Page with Simulacrum module confirmed active
   */
  simulacrumPage: async ({ gamePage }, use) => {
    // Debug: Log module state
    const moduleDebug = await gamePage.evaluate(() => {
      // @ts-ignore
      const mod = game.modules.get('simulacrum');
      // @ts-ignore
      const allModules = Array.from(game.modules.keys());
      // @ts-ignore
      const activeModules = Array.from(game.modules.values()).filter(m => m.active).map(m => m.id);
      return {
        simulacrumFound: !!mod,
        simulacrumActive: mod?.active,
        simulacrumId: mod?.id,
        allModuleIds: allModules,
        activeModuleIds: activeModules,
      };
    });
    console.log(`[fixture] Module debug:`, JSON.stringify(moduleDebug, null, 2));
    
    // Check if Simulacrum is active
    let isActive = await helpers.isSimulacrumActive(gamePage);
    
    // If not active, try to enable it via Module Management UI
    if (!isActive) {
      console.log(`[fixture] Simulacrum not active, enabling via Module Management UI...`);
      const enabled = await helpers.enableModuleViaUI(gamePage, 'simulacrum');
      if (enabled) {
        console.log(`[fixture] Module enabled, verifying...`);
        isActive = await helpers.isSimulacrumActive(gamePage);
      } else {
        console.log(`[fixture] Failed to enable module via UI`);
      }
    }
    
    // Verify Simulacrum is now active
    expect(isActive).toBe(true);
    
    await use(gamePage);
  },
  
  /**
   * Helper functions available in tests
   */
  foundry: async ({}, use) => {
    await use(helpers);
  },
});

export { expect };

/**
 * Test annotations for common scenarios
 */
export const describe = test.describe;
export const beforeAll = test.beforeAll;
export const afterAll = test.afterAll;
export const beforeEach = test.beforeEach;
export const afterEach = test.afterEach;
