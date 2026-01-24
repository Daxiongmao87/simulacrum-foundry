// @ts-check
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const TEST_ENV_PATH = join(__dirname, '.env.test');

/**
 * Load environment variables from .env.test
 */
function loadEnv() {
  if (!existsSync(TEST_ENV_PATH)) {
    return {};
  }
  
  const envContent = readFileSync(TEST_ENV_PATH, 'utf-8');
  const env = {};
  
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    
    env[key] = value;
  }
  
  return env;
}

/**
 * Parse comma-separated system IDs
 */
function parseSystemIds(env) {
  const systemIdsRaw = env.TEST_SYSTEM_IDS || env.TEST_SYSTEM_ID || 'dnd5e';
  return systemIdsRaw.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Build Playwright projects - one per system + browser combination
 * 
 * Test Routing:
 * - specs/common/*.spec.js → runs for ALL systems
 * - specs/systems/{systemId}/*.spec.js → runs ONLY for that system
 */
function buildProjects(systemIds) {
  const projects = [];
  
  for (const systemId of systemIds) {
    // Chromium project for each system
    projects.push({
      name: `chromium-${systemId}`,
      testDir: './specs',
      // testMatch controls which files run for this project
      testMatch: [
        // All common tests
        'common/**/*.spec.js',
        // System-specific tests (only matching system)
        `systems/${systemId}/**/*.spec.js`,
      ],
      use: {
        ...devices['Desktop Chrome'],
        // Foundry requires minimum 1366x768 resolution
        viewport: { width: 1920, height: 1080 },
        // Pass system ID to tests via custom fixture
        systemId,
      },
      // Set metadata for this project
      metadata: {
        systemId,
      },
    });
    
    // Uncomment to add Firefox/WebKit per system:
    // projects.push({
    //   name: `firefox-${systemId}`,
    //   testDir: './specs',
    //   testMatch: ['common/**/*.spec.js', `systems/${systemId}/**/*.spec.js`],
    //   use: { ...devices['Desktop Firefox'], systemId },
    //   metadata: { systemId },
    // });
  }
  
  return projects;
}

// Load env and build config
const env = loadEnv();
const systemIds = parseSystemIds(env);
const projects = buildProjects(systemIds);

console.log(`[config] Testing with systems: ${systemIds.join(', ')}`);

/**
 * Playwright configuration for Simulacrum Foundry VTT E2E tests.
 * 
 * Test lifecycle:
 * 1. globalSetup: Unzips Foundry, packages module, deploys, launches server
 *    - Installs ALL systems from TEST_SYSTEM_IDS
 *    - Creates a test world for EACH system
 * 2. Tests run against live Foundry instance, iterating per system
 * 3. globalTeardown: Nukes the unzipped Foundry instance for clean slate
 * 
 * Multi-System Support:
 * - Set TEST_SYSTEM_IDS=dnd5e,pf2e,... in .env.test
 * - Each system gets its own Playwright project
 * - Tests run against each system independently
 * 
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './specs',
  
  /* Run tests in files in parallel */
  fullyParallel: false, // Sequential for Foundry - single server instance
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Single worker - Foundry can only run one instance at a time */
  workers: 1,
  
  /* Reporter to use - using list only to avoid HTML server blocking terminal */
  reporter: 'list',
  
  /* Shared settings for all the projects below */
  use: {
    /* Base URL for Foundry instance */
    baseURL: process.env.FOUNDRY_URL || 'http://localhost:30000',
    
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Video on failure */
    video: 'on-first-retry',
    
    /* Timeout for actions */
    actionTimeout: 30000,
    
    /* Navigation timeout - Foundry can be slow to load */
    navigationTimeout: 60000,
  },
  
  /* Global setup - prepare Foundry instance */
  globalSetup: './setup/global-setup.js',
  
  /* Global teardown - cleanup Foundry instance */
  globalTeardown: './setup/global-teardown.js',
  
  /* Test timeout - generous for Foundry operations */
  timeout: 120000,
  
  /* Expect timeout */
  expect: {
    timeout: 10000,
  },
  
  /* Dynamic projects - one per system */
  projects,
  
  /* Output directory for test artifacts */
  outputDir: join(ROOT, 'tests/e2e/test-results'),
});

// Export parsed system IDs for use in setup
export { systemIds };
