// @ts-check
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { execSync } from 'child_process';

function hasGpu() {
  try {
    switch (process.platform) {
      case 'win32': {
        const out = execSync('wmic path win32_videocontroller get name', { encoding: 'utf-8' });
        return out.split('\n').some(l => {
          const name = l.trim();
          return name && name !== 'Name' && !/Microsoft Basic/i.test(name);
        });
      }
      case 'linux': {
        const out = execSync('lspci 2>/dev/null | grep -i vga', { encoding: 'utf-8' });
        return out.trim().length > 0;
      }
      case 'darwin':
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

const gpuArgs = hasGpu() ? ['--enable-gpu', '--ignore-gpu-blocklist'] : [];
console.log(`[config] GPU acceleration: ${gpuArgs.length ? 'enabled' : 'disabled (no suitable adapter found)'}`);


const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const TEST_ENV_PATH = join(__dirname, '.env.test');
const FOUNDRY_VENDOR_DIR = join(ROOT, 'vendor/foundry');

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

function discoverFoundryVersions() {
  if (!existsSync(FOUNDRY_VENDOR_DIR)) {
    throw new Error(`[config] Missing vendor directory: ${FOUNDRY_VENDOR_DIR}`);
  }

  const zips = readdirSync(FOUNDRY_VENDOR_DIR)
    .filter(f => f.toLowerCase().endsWith('.zip'))
    .map(f => {
      const match = f.match(/(\d+)\.\d+/);
      if (!match) return null;
      return { zipPath: join(FOUNDRY_VENDOR_DIR, f), version: parseInt(match[1], 10) };
    })
    .filter(Boolean)
    .sort((a, b) => a.version - b.version);

  if (zips.length === 0) {
    throw new Error(`[config] No Foundry zip files found in ${FOUNDRY_VENDOR_DIR}`);
  }

  return zips;
}

function buildProjects(systemIds, foundryVersions) {
  const projects = [];

  for (const { zipPath, version } of foundryVersions) {
    for (const systemId of systemIds) {
      projects.push({
        name: `chromium-${systemId}-v${version}`,
        testDir: './specs',
        testMatch: [
          'common/**/*.spec.js',
          `systems/${systemId}/**/*.spec.js`,
        ],
        timeout: 180000,
        use: {
          ...devices['Desktop Chrome'],
          viewport: { width: 1920, height: 1080 },
          systemId,
          foundryVersion: version,
          foundryZip: zipPath,
          actionTimeout: 30000,
          navigationTimeout: 60000,
          launchOptions: { args: gpuArgs },
        },
        metadata: {
          systemId,
          foundryVersion: version,
          foundryZip: zipPath,
        },
      });
    }
  }

  return projects;
}

const env = loadEnv();
const systemIds = parseSystemIds(env);
const foundryVersions = discoverFoundryVersions();
const projects = buildProjects(systemIds, foundryVersions);

console.log(`[config] Testing with systems: ${systemIds.join(', ')}`);
console.log(`[config] Testing against Foundry versions: ${foundryVersions.map(v => `v${v.version}`).join(', ')}`);

/**
 * Playwright configuration for Simulacrum Foundry VTT E2E tests.
 * 
 * Test lifecycle (Per-Test Isolation Architecture):
 * 1. globalSetup: Validates Foundry zip, license key, caches systems (ONE TIME)
 * 2. EACH TEST (via fixtures):
 *    - Extracts fresh Foundry to unique temp directory
 *    - Starts Foundry on unique port (31000 + workerIndex)
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

export { systemIds, foundryVersions };
