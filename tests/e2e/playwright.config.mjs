// @ts-check
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const TEST_ENV_PATH = join(__dirname, '.env.test');

/**
 * Load environment variables from .env.test
 */
function loadEnv() {
  const fileEnv = {};

  if (!existsSync(TEST_ENV_PATH)) {
    return { ...process.env };
  }

  const envContent = readFileSync(TEST_ENV_PATH, 'utf-8');

  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    fileEnv[key] = value;
  }

  return { ...fileEnv, ...process.env };
}

/**
 * Parse comma-separated system IDs
 */
function parseSystemIds(env) {
  const systemIdsRaw = env.TEST_SYSTEM_IDS || env.TEST_SYSTEM_ID || 'dnd5e';
  return systemIdsRaw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Parse comma-separated Foundry versions.
 */
function parseFoundryVersions(env) {
  const versionsRaw = env.TEST_FOUNDRY_VERSIONS || env.TEST_FOUNDRY_VERSION || '13.351,14.364';
  return versionsRaw
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

/**
 * Build Playwright projects - one per system + browser combination
 *
 * Test Routing:
 * - specs/common/*.spec.js → runs for ALL systems
 * - specs/systems/{systemId}/*.spec.js → runs ONLY for that system
 */
function buildProjects(systemIds, foundryVersions) {
  const projects = [];

  for (const foundryVersion of foundryVersions) {
    for (const systemId of systemIds) {
      // Chromium project for each Foundry version + system combination
      projects.push({
        name: `chromium-foundry-${foundryVersion}-${systemId}`,
        testDir: './specs',
        // testMatch controls which files run for this project
        testMatch: [
          // All common tests
          'common/**/*.spec.js',
          'common/**/*.spec.mjs',
          // System-specific tests (only matching system)
          `systems/${systemId}/**/*.spec.js`,
          `systems/${systemId}/**/*.spec.mjs`,
        ],
        // A cold dnd5e migration plus module activation, plus retained accessibility
        // evidence collection, can exceed the shared five-minute window.
        timeout: 420000, // 7 minutes per real Foundry test, with no retries
        use: {
          ...devices['Desktop Chrome'],
          // Foundry requires minimum 1366x768 resolution
          viewport: { width: 1920, height: 1080 },
          // Pass system and Foundry version to tests via custom fixtures
          systemId,
          foundryVersion,
          // Action/navigation timeouts
          actionTimeout: 30000,
          navigationTimeout: 60000,
        },
        // Set metadata for this project
        metadata: {
          systemId,
          foundryVersion,
        },
      });

      // Uncomment to add Firefox/WebKit per system:
      // projects.push({
      //   name: `firefox-foundry-${foundryVersion}-${systemId}`,
      //   testDir: './specs',
      //   testMatch: ['common/**/*.spec.js', `systems/${systemId}/**/*.spec.js`],
      //   use: { ...devices['Desktop Firefox'], systemId, foundryVersion },
      //   metadata: { systemId, foundryVersion },
      // });
    }
  }

  return projects;
}

// Load env and build config
const env = loadEnv();
const systemIds = parseSystemIds(env);
const foundryVersions = parseFoundryVersions(env);
const projects = buildProjects(systemIds, foundryVersions);
const artifactRoot = env.ADP_ARTIFACT_DIR ? resolve(env.ADP_ARTIFACT_DIR) : null;
const reportRoot = artifactRoot || join(ROOT, 'tests/e2e/reports');
const outputRoot = artifactRoot ? join(artifactRoot, 'raw') : join(ROOT, 'tests/e2e/test-results');
const jsonReportPath = artifactRoot
  ? join(artifactRoot, 'reports', 'results.json')
  : join(reportRoot, 'results.json');

console.log(`[config] Testing with systems: ${systemIds.join(', ')}`);
console.log(`[config] Testing with Foundry versions: ${foundryVersions.join(', ')}`);

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

  /* Foundry licensing and port ownership are serialized; each test is still isolated. */
  fullyParallel: false,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: true,

  /* A required failure stays a failure; retries are diagnostic-only outside this command. */
  retries: 0,

  workers: 1,

  reporter: [
    ['line'],
    ['json', { outputFile: jsonReportPath }],
    ['html', { outputFolder: join(reportRoot, 'html'), open: 'never' }],
    ['./reporters/agentic-artifact-reporter.mjs'],
  ],

  /* Shared settings for all the projects below */
  use: {
    /* NO baseURL - each test has dynamic port via fixtures */
    // baseURL is set dynamically by the gamePage fixture

    /* Clear storage state for reproducibility - no cached cookies/localStorage */
    storageState: undefined,

    /* Retain complete evidence for successful and failed required runs. */
    trace: 'on',

    screenshot: 'on',

    video: 'on',

    /* Timeout for actions */
    actionTimeout: 30000,

    /* Navigation timeout - Foundry can be slow to load */
    navigationTimeout: 60000,
  },

  /* Global setup - prepare Foundry instance */
  globalSetup: './setup/global-setup.mjs',

  /* Global teardown - cleanup Foundry instance */
  globalTeardown: './setup/global-teardown.mjs',

  /* Test timeout - generous for Foundry operations */
  timeout: 120000,

  /* Expect timeout */
  expect: {
    timeout: 10000,
  },

  /* Dynamic projects - one per system */
  projects,

  /* Output directory for test artifacts */
  outputDir: outputRoot,
});
