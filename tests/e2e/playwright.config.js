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
      // Per-test setup can take a while (extracting, starting server, installing system)
      timeout: 180000, // 3 minutes per test
      use: {
        ...devices['Desktop Chrome'],
        // Foundry requires minimum 1366x768 resolution
        viewport: { width: 1920, height: 1080 },
        // Pass system ID to tests via custom fixture
        systemId,
        // Action/navigation timeouts
        actionTimeout: 30000,
        navigationTimeout: 60000,
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
 * Test lifecycle (Per-Test Isolation Architecture):
 * 1. globalSetup: Validates Foundry zip, license key, caches systems (ONE TIME)
 * 2. EACH TEST (via fixtures):
 *    - Extracts fresh Foundry to unique temp directory
 *    - Starts Foundry on unique port (30000 + workerIndex)
 *    - Installs system from cache
 *    - Creates fresh world
 *    - Runs test
 *    - Kills server and deletes all temp data
 * 3. globalTeardown: Cleans orphaned processes/directories (FAILSAFE)
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
  
  /* Run tests in parallel - each test gets isolated Foundry instance */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Multiple workers OK - each test gets own Foundry on unique port */
  workers: process.env.CI ? 2 : 4,
  
  /* Reporter to use - line for minimal output */
  reporter: 'line',
  
  /* Shared settings for all the projects below */
  use: {
    /* NO baseURL - each test has dynamic port via fixtures */
    // baseURL is set dynamically by the gamePage fixture
    
    /* Clear storage state for reproducibility - no cached cookies/localStorage */
    storageState: undefined,
    
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
