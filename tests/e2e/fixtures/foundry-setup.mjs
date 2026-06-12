/**
 * Per-Test Foundry Setup Module
 *
 * Provides isolated Foundry instance for each test:
 * - Extract fresh Foundry
 * - Clean data directory
 * - Deploy module
 * - Start server
 * - Install system
 * - Create world
 *
 * Each test is completely independent.
 */

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, cpSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';
import {
  installSystemPackage,
  SystemManifestCompatibilityError,
  validateInstalledSystemPackage,
} from './package-install.mjs';
import { completeUserManagementIfPresent } from './foundry-helpers.mjs';
import {
  pollUntil,
  pollForElement,
  pollUntilGone,
  pollForServer,
  waitForUiSettle,
} from './poll-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
const FOUNDRY_VENDOR_DIR = join(ROOT, 'vendor/foundry');
const SYSTEM_CACHE_DIR = join(ROOT, '.foundry-system-cache');

/**
 * Dismiss the "Allow Sharing Usage Data" dialog that appears after TOS acceptance.
 * This dialog appears on first /setup load in Foundry v13.
 *
 * HTML structure (from Foundry v13.351):
 * <dialog class="application dialog">
 *   <h1 class="window-title">Allow Sharing Usage Data</h1>
 *   <button data-action="no"><span>Decline Sharing</span></button>
 * </dialog>
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {string} [logPrefix='setup'] - Prefix for log messages
 */
async function dismissUsageDataDialog(page, logPrefix = 'setup') {
  // Primary selector: exact match for the decline button
  const declineBtn = page.locator('button[data-action="no"]:has-text("Decline Sharing")');

  // Fallback selectors in case Foundry changes slightly
  const fallbackSelectors = [
    'dialog.application button[data-action="no"]',
    'dialog button:has-text("Decline Sharing")',
    '.dialog button[data-action="no"]',
  ];

  // Try primary selector first
  if (await declineBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log(`[${logPrefix}] Dismissing "Allow Sharing Usage Data" dialog`);
    await declineBtn.click();
    // Wait for dialog to disappear using polling
    await pollUntilGone(page, 'button[data-action="no"]:has-text("Decline Sharing")', {
      timeout: 3000,
    }).catch(() => {});
    return true;
  }

  // Try fallback selectors
  for (const selector of fallbackSelectors) {
    const btn = page.locator(selector);
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log(`[${logPrefix}] Dismissing usage dialog via fallback: ${selector}`);
      await btn.click();
      // Wait for dialog to disappear using polling
      await pollUntilGone(page, selector, { timeout: 2000 }).catch(() => {});
      return true;
    }
  }

  return false; // No dialog found
}

/**
 * Dismiss tour overlays that block UI interactions.
 * Foundry v13 shows various tours (e.g., "Backups Overview") that intercept clicks.
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 */
async function dismissTourOverlay(page) {
  await page.evaluate(() => {
    // Remove tour overlay elements directly (v13 class names)
    document.querySelectorAll('.tour-overlay, .tour-fadeout, .tour').forEach(el => el.remove());

    // Use Foundry v13 Tour API to exit any active tour
    try {
      // @ts-ignore - Foundry v13 Tour class
      if (
        typeof Tour !== 'undefined' &&
        Tour.activeTour &&
        typeof Tour.activeTour.exit === 'function'
      ) {
        // @ts-ignore
        Tour.activeTour.exit();
      }
    } catch (e) {
      /* ignore */
    }
  });

  // Also try pressing Escape to dismiss tour
  await page.keyboard.press('Escape');

  // Poll until tour overlay is gone
  await pollUntilGone(page, '.tour-overlay, .tour', { timeout: 2000 }).catch(() => {});
}

/**
 * Find the Foundry zip file
 */
function findFoundryZip(foundryVersion) {
  if (!existsSync(FOUNDRY_VENDOR_DIR)) {
    throw new Error(`Missing ${FOUNDRY_VENDOR_DIR}`);
  }

  const files = execSync(`ls -1 "${FOUNDRY_VENDOR_DIR}"`, { encoding: 'utf-8' })
    .split('\n')
    .filter(f => f.toLowerCase().endsWith('.zip'));

  const expectedZip = `FoundryVTT-Node-${foundryVersion}.zip`;
  const matchingZip = files.find(f => f === expectedZip);
  if (matchingZip) return join(FOUNDRY_VENDOR_DIR, matchingZip);

  if (files.length === 0) {
    throw new Error(`No .zip file found in ${FOUNDRY_VENDOR_DIR}`);
  }

  throw new Error(
    `Foundry ${foundryVersion} zip not found. Expected ${expectedZip}; available: ${files.join(', ')}`
  );
}

function getSystemCacheDir(foundryVersion) {
  return join(SYSTEM_CACHE_DIR, foundryVersion);
}

/**
 * Get the base path for test directories.
 * Uses tmpfs if TEST_TMPFS_PATH is set for faster I/O.
 * @returns {string} Base path for test directories
 */
function getTestBasePath() {
  const tmpfsPath = process.env.TEST_TMPFS_PATH;
  if (tmpfsPath && existsSync(tmpfsPath)) {
    // Verify it's writable
    try {
      const testFile = join(tmpfsPath, `.foundry-test-write-check-${Date.now()}`);
      writeFileSync(testFile, 'test');
      rmSync(testFile);
      console.log(`[setup] Using tmpfs path: ${tmpfsPath}`);
      return tmpfsPath;
    } catch (e) {
      console.warn(`[setup] tmpfs path ${tmpfsPath} not writable, falling back to project dir`);
    }
  }
  return ROOT;
}

/**
 * Setup an isolated Foundry instance for a single test
 *
 * @param {Object} options
 * @param {string} options.testId - Unique test identifier
 * @param {string} options.systemId - Game system to install (e.g., 'dnd5e')
 * @param {string} options.foundryVersion - Foundry version to test
 * @param {string} options.adminKey - Admin password
 * @param {string} options.licenseKey - Foundry license key
 * @param {object} [options.env] - Loaded test environment
 * @param {number} options.port - Port to run on
 * @returns {Promise<Object>} Server info for test use
 */
export async function setupIsolatedFoundry(options) {
  const {
    testId,
    systemId,
    foundryVersion,
    adminKey,
    licenseKey,
    port,
    env = process.env,
  } = options;

  // Get base path (tmpfs or project dir)
  const basePath = getTestBasePath();

  // Unique directories for this test
  const testDir = join(basePath, `.foundry-test-${testId}`);
  const dataDir = join(basePath, `.foundry-data-${testId}`);
  const userDataDir = join(dataDir, 'Data');
  const modulesDir = join(userDataDir, 'modules');
  const worldsDir = join(userDataDir, 'worlds');
  const systemsDir = join(userDataDir, 'systems');
  const configDir = join(dataDir, 'Config');

  console.log(`[setup:${testId}] Creating isolated Foundry instance`);
  if (basePath !== ROOT) {
    console.log(`[setup:${testId}] Using tmpfs: ${basePath}`);
  }

  // 1. Clean any existing directories
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
  if (existsSync(dataDir)) {
    rmSync(dataDir, { recursive: true, force: true });
  }

  // 2. Create directory structure
  mkdirSync(testDir, { recursive: true });
  mkdirSync(modulesDir, { recursive: true });
  mkdirSync(worldsDir, { recursive: true });
  mkdirSync(systemsDir, { recursive: true });
  mkdirSync(configDir, { recursive: true });

  // 3. Extract Foundry
  const foundryZip = findFoundryZip(foundryVersion);
  console.log(`[setup:${testId}] Extracting Foundry ${foundryVersion}...`);
  execSync(`unzip -q "${foundryZip}" -d "${testDir}"`, { stdio: 'pipe' });

  // 4. Package and deploy module
  console.log(`[setup:${testId}] Packaging module...`);
  execSync('node tools/package-module.js', { cwd: ROOT, stdio: 'pipe' });

  // Deploy by copying the module directory (faster than unzipping)
  const moduleTargetDir = join(modulesDir, 'simulacrum');

  // Copy module files
  mkdirSync(moduleTargetDir, { recursive: true });
  cpSync(join(ROOT, 'module.json'), join(moduleTargetDir, 'module.json'));
  cpSync(join(ROOT, 'scripts'), join(moduleTargetDir, 'scripts'), { recursive: true });
  cpSync(join(ROOT, 'styles'), join(moduleTargetDir, 'styles'), { recursive: true });
  cpSync(join(ROOT, 'templates'), join(moduleTargetDir, 'templates'), { recursive: true });
  cpSync(join(ROOT, 'lang'), join(moduleTargetDir, 'lang'), { recursive: true });
  if (existsSync(join(ROOT, 'assets'))) {
    cpSync(join(ROOT, 'assets'), join(moduleTargetDir, 'assets'), { recursive: true });
  }

  // 5. Copy cached system if available
  const versionCacheDir = getSystemCacheDir(foundryVersion);
  const cachedSystem = join(versionCacheDir, systemId);
  if (existsSync(cachedSystem)) {
    try {
      validateInstalledSystemPackage(cachedSystem, systemId, foundryVersion);
      console.log(
        `[setup:${testId}] Using cached system: ${systemId} for Foundry ${foundryVersion}`
      );
      cpSync(cachedSystem, join(systemsDir, systemId), { recursive: true });
    } catch (error) {
      console.log(
        `[setup:${testId}] Skipping cached system ${systemId} for Foundry ${foundryVersion}: ${error.message}`
      );
    }
  }

  // 6. Configure Foundry
  const optionsJson = {
    dataPath: dataDir,
    port: port,
    upnp: false,
    adminKey: adminKey,
  };
  writeFileSync(join(configDir, 'options.json'), JSON.stringify(optionsJson, null, 2));

  // 7. FORCE KILL any process already using this port (cleanup from failed previous runs)
  console.log(`[setup:${testId}] Pre-cleanup: ensuring port ${port} is free...`);
  try {
    execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: 'pipe' });
    // Poll until port is free rather than fixed wait
    await pollUntil(
      async () => {
        try {
          const result = execSync(`ss -tlnp | grep :${port} || true`, { encoding: 'utf-8' });
          return !result.trim(); // Return true when port is free (no output)
        } catch (e) {
          return true; // If ss fails, assume port is free
        }
      },
      { timeout: 5000, pollInterval: 100 }
    ).catch(() => {}); // Ignore timeout - we'll check again below
  } catch (e) {
    // Ignore errors - port may already be free
  }

  // Verify port is free before starting
  try {
    const portCheck = execSync(`ss -tlnp | grep :${port} || true`, { encoding: 'utf-8' });
    if (portCheck.trim()) {
      throw new Error(`Port ${port} is still in use after cleanup attempt: ${portCheck}`);
    }
  } catch (e) {
    if (e.message && e.message.includes('still in use')) {
      throw e;
    }
    // If ss fails, assume port is free
  }

  // 8. Start Foundry server
  console.log(`[setup:${testId}] Starting Foundry on port ${port}...`);
  const mainMjs = join(testDir, 'main.mjs');

  const serverProcess = spawn('node', [mainMjs, `--dataPath=${dataDir}`, `--port=${port}`], {
    cwd: testDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false,
  });

  const serverPid = serverProcess.pid;
  console.log(`[setup:${testId}] Server PID: ${serverPid}`);

  // Forward server output
  serverProcess.stdout.on('data', data => {
    const msg = data.toString().trim();
    if (msg) console.log(`[foundry:${testId}] ${msg}`);
  });
  serverProcess.stderr.on('data', data => {
    const msg = data.toString().trim();
    if (msg) console.error(`[foundry:${testId}] ${msg}`);
  });

  // 8. Wait for server to be ready
  const baseUrl = `http://localhost:${port}`;
  await waitForServer(baseUrl, 60000);
  console.log(`[setup:${testId}] Server is ready`);

  await ensureLicenseSigned(baseUrl, licenseKey, testId);

  // 9. Use Playwright to complete setup (license, system install, world creation)
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('pageerror', error => {
    console.error(`[browser:${testId}] pageerror: ${error.message}`);
  });
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) {
      console.log(`[browser:${testId}] ${message.type()}: ${message.text()}`);
    }
  });

  let worldId = `world-${testId}`;

  try {
    // Handle license if needed
    await page.goto(`${baseUrl}/setup`);
    await page.waitForLoadState('networkidle');

    // Check for license page
    const licenseInput = page.locator('input[name="licenseKey"]');
    if (await licenseInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`[setup:${testId}] Entering license key...`);
      await licenseInput.fill(licenseKey);
      await page.locator('button[type="submit"]').first().click();
      await page.waitForLoadState('networkidle');

      // Accept EULA if present
      const eulaCheckbox = page.locator('input[name="agree"], input[name="eula"], #eula-agree');
      if (await eulaCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
        await eulaCheckbox.check();
        // Click specifically the Agree button, not any submit button
        await page
          .locator('button:has-text("Agree"), button[name="accept"], button[data-action="accept"]')
          .first()
          .click();
        await page.waitForLoadState('networkidle');
      }
    }

    // Dismiss "Allow Sharing Usage Data" dialog - appears after TOS on first /setup load
    // Uses exact selector from Foundry v13: button[data-action="no"] with text "Decline Sharing"
    await dismissUsageDataDialog(page, testId);

    // Dismiss tour if present - use polling to wait for tour to disappear
    await page.keyboard.press('Escape');
    await pollUntilGone(page, '.tour-overlay', { timeout: 2000 }).catch(() => {});

    // Install system if not cached
    if (!existsSync(join(systemsDir, systemId))) {
      console.log(`[setup:${testId}] Installing system: ${systemId}`);
      try {
        await installSystemPackage(systemId, systemsDir, { env, foundryVersion });
      } catch (installError) {
        if (installError instanceof SystemManifestCompatibilityError) {
          throw installError;
        }

        console.error(
          `[setup:${testId}] Direct system package install failed: ${installError.message}`
        );
        console.log(`[setup:${testId}] Falling back to Foundry setup UI system install`);
        await installSystemViaUI(page, baseUrl, systemId, adminKey);
      }

      // Cache the installed system for future tests
      const installedSystem = join(systemsDir, systemId);
      if (existsSync(installedSystem)) {
        const cachedSystemTarget = join(versionCacheDir, systemId);

        mkdirSync(versionCacheDir, { recursive: true });
        rmSync(cachedSystemTarget, { recursive: true, force: true });
        cpSync(installedSystem, cachedSystemTarget, { recursive: true });
        console.log(`[setup:${testId}] Cached system: ${systemId} for Foundry ${foundryVersion}`);
      }
    } else {
      console.log(`[setup:${testId}] Using cached system: ${systemId}`);
    }

    // Create world
    console.log(`[setup:${testId}] Creating world: ${worldId}`);
    await createWorldViaUI(page, baseUrl, worldId, systemId, adminKey);
  } finally {
    await context.close();
    await browser.close();
  }

  // Return server info for test use
  return {
    testId,
    testDir,
    dataDir,
    baseUrl,
    port,
    serverPid,
    serverProcess,
    adminKey,
    worldId,
    systemId,
    foundryVersion,
  };
}

/**
 * Teardown an isolated Foundry instance
 */
export async function teardownIsolatedFoundry(serverInfo) {
  const { testId, testDir, dataDir, port, serverPid, serverProcess } = serverInfo;

  console.log(`[teardown:${testId}] Stopping server on port ${port}...`);

  // Kill server process
  try {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
      // Poll until process is killed rather than fixed wait
      await pollUntil(async () => serverProcess.killed, { timeout: 3000, pollInterval: 100 }).catch(
        () => {
          // Process didn't terminate gracefully, force kill
          if (!serverProcess.killed) {
            serverProcess.kill('SIGKILL');
          }
        }
      );
    }
  } catch (e) {
    console.log(`[teardown:${testId}] Error stopping server: ${e.message}`);
  }

  // Also try killing by PID in case process object doesn't work
  try {
    process.kill(serverPid, 'SIGKILL');
  } catch (e) {
    // Process may already be dead
  }

  // Force kill any process using this port
  try {
    execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: 'pipe' });
  } catch (e) {
    // Port may already be free
  }

  // Wait for port to be free using polling
  await pollUntil(
    async () => {
      try {
        const result = execSync(`ss -tlnp | grep :${port} || true`, { encoding: 'utf-8' });
        return !result.trim(); // Return true when port is free
      } catch (e) {
        return true; // If ss fails, assume port is free
      }
    },
    { timeout: 5000, pollInterval: 200 }
  )
    .then(() => {
      console.log(`[teardown:${testId}] Port ${port} is now free`);
    })
    .catch(() => {
      console.log(`[teardown:${testId}] Warning: Port ${port} may still be in use`);
    });

  // Delete directories
  console.log(`[teardown:${testId}] Cleaning up directories...`);
  try {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  } catch (e) {
    console.log(`[teardown:${testId}] Error removing testDir: ${e.message}`);
  }

  try {
    if (existsSync(dataDir)) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  } catch (e) {
    console.log(`[teardown:${testId}] Error removing dataDir: ${e.message}`);
  }

  console.log(`[teardown:${testId}] Cleanup complete`);
}

/**
 * Wait for server to respond using polling utility
 */
async function waitForServer(baseUrl, timeout) {
  await pollForServer(baseUrl, { timeout, pollInterval: 300 });
}

async function ensureLicenseSigned(baseUrl, licenseKey, testId) {
  const setupResponse = await fetch(`${baseUrl}/setup`, { redirect: 'manual' });
  const setupLocation = setupResponse.headers.get('location') || '';

  if (!setupLocation.includes('/license')) {
    return;
  }

  console.log(`[setup:${testId}] Signing Foundry license via server route...`);
  await postLicenseForm(baseUrl, { licenseKey });
  await postLicenseForm(baseUrl, { agree: 'on', accept: 'accept' });

  await pollUntil(
    async () => {
      const response = await fetch(`${baseUrl}/setup`, { redirect: 'manual' });
      const location = response.headers.get('location') || '';
      return !location.includes('/license');
    },
    { timeout: 30000, interval: 500, description: 'Foundry license signature' }
  );
}

async function postLicenseForm(baseUrl, fields) {
  const body = new URLSearchParams(fields);
  const response = await fetch(`${baseUrl}/license`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (![200, 302, 303].includes(response.status)) {
    throw new Error(`Foundry license POST failed with HTTP ${response.status}`);
  }
}

/**
 * Install a game system via Foundry UI
 */
async function installSystemViaUI(page, baseUrl, systemId, adminKey) {
  console.log(`[install] Starting system installation: ${systemId}`);

  await page.goto(`${baseUrl}/setup`);
  await page.waitForLoadState('networkidle');

  // Dismiss consent dialog if present
  const declineSharingBtn = page.locator('button:has-text("Decline Sharing")');
  if (await declineSharingBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log(`[install] Dismissing consent dialog`);
    await declineSharingBtn.click();
    await pollUntilGone(page, 'button:has-text("Decline Sharing")', { timeout: 2000 }).catch(
      () => {}
    );
  }

  // Dismiss tour overlay if present
  const tourOverlay = page.locator('.tour-overlay, .tour');
  if (await tourOverlay.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log(`[install] Dismissing tour overlay`);
    // Try multiple methods to dismiss tour
    await page.keyboard.press('Escape');
    // Poll for overlay to disappear
    await pollUntilGone(page, '.tour-overlay', { timeout: 1000 }).catch(async () => {
      // Try clicking end tour button if overlay persists
      const endTourBtn = page.locator(
        'button:has-text("End Tour"), button:has-text("Skip"), .tour-end'
      );
      if (await endTourBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await endTourBtn.click();
      }
    });
    await pollUntilGone(page, '.tour-overlay, .tour', { timeout: 1000 }).catch(() => {});
  }

  // If tour is still blocking, remove it forcefully via JS
  await page.evaluate(() => {
    const overlay = document.querySelector('.tour-overlay');
    if (overlay) overlay.remove();
    const tour = document.querySelector('.tour');
    if (tour) tour.remove();
  });

  // Authenticate if needed
  const adminKeyInput = page.locator('input[name="adminKey"], input[name="adminPassword"]');
  if (await adminKeyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log(`[install] Authenticating...`);
    await adminKeyInput.fill(adminKey);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForLoadState('networkidle');
  }

  // Click Systems tab
  console.log(`[install] Clicking Systems tab...`);
  const systemsTab = page
    .locator('[data-action="tab"][data-tab="systems"], [data-tab="systems"]')
    .first();
  await systemsTab.click();
  await page.waitForLoadState('networkidle');

  // Check if already installed
  const installedSystem = page.locator(`[data-package-id="${systemId}"]`);
  if (await installedSystem.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log(`[install] System ${systemId} already installed`);
    return;
  }

  // Click Install System button
  console.log(`[install] Clicking Install System button...`);
  const installBtn = page.locator(
    'section[data-tab="systems"] button[data-action="installPackage"]'
  );
  await installBtn.click();
  // Wait for install dialog to appear using polling
  await pollForElement(page, 'input[name="manifestURL"], #install-package-manifestUrl', {
    timeout: 5000,
  });

  // Use manifest URL
  const manifestUrls = {
    dnd5e: 'https://raw.githubusercontent.com/foundryvtt/dnd5e/master/system.json',
    pf2e: 'https://github.com/foundryvtt/pf2e/releases/latest/download/system.json',
  };

  const manifestUrl = manifestUrls[systemId];
  if (!manifestUrl) {
    throw new Error(`Unknown system: ${systemId}`);
  }

  const manifestInput = page.locator('input[name="manifestURL"], #install-package-manifestUrl');
  await manifestInput.fill(manifestUrl);
  await waitForUiSettle(page, 300); // Brief settle for input

  // Click install
  console.log(`[install] Clicking Install button in dialog...`);
  const dialogInstallBtn = page.locator('#install-package footer button:has-text("Install")');
  await dialogInstallBtn.click({ force: true });

  // Wait for installation - poll for installed system to appear rather than fixed wait
  console.log(`[setup] Waiting for ${systemId} to install (this may take a while)...`);

  // Poll for system installation with 3 minute timeout
  await pollUntil(
    async () => {
      try {
        await page.goto(`${baseUrl}/setup`);
        await page.waitForLoadState('networkidle');

        // Dismiss any overlays
        await page.evaluate(() => {
          const overlay = document.querySelector('.tour-overlay');
          if (overlay) overlay.remove();
        });

        // Try to click systems tab
        const sysTab = page.locator('[data-tab="systems"]').first();
        if (await sysTab.isVisible({ timeout: 500 }).catch(() => false)) {
          await sysTab.click({ force: true });
          await waitForUiSettle(page, 300);

          // Check if installed
          const installed = page.locator(`[data-package-id="${systemId}"]`);
          if (await installed.isVisible({ timeout: 1000 }).catch(() => false)) {
            return true;
          }
        }
        return false;
      } catch (e) {
        console.log(`[install] Error during check: ${e.message}`);
        return false;
      }
    },
    { timeout: 180000, pollInterval: 1000 } // 3 minute timeout, check every second
  );

  console.log(`[install] System ${systemId} installed successfully`);
}

/**
 * Create a world via Foundry UI
 */
async function createWorldViaUI(page, baseUrl, worldId, systemId, adminKey) {
  await page.goto(`${baseUrl}/setup`);
  await page.waitForLoadState('networkidle');

  // Dismiss usage data dialog if it appears (can appear on any /setup load)
  await dismissUsageDataDialog(page, 'createWorld');

  // Dismiss any tour overlay that may block interactions
  await dismissTourOverlay(page);

  // Authenticate if needed
  const adminKeyInput = page.locator('input[name="adminKey"], input[name="adminPassword"]');
  if (await adminKeyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await adminKeyInput.fill(adminKey);
    await page.locator('button[type="submit"]').click();
    await page.waitForLoadState('networkidle');
  }

  // Dismiss usage data dialog again (can appear after auth)
  await dismissUsageDataDialog(page, 'createWorld');

  // Dismiss any tour overlay again (can reappear after auth)
  await dismissTourOverlay(page);

  // Click Worlds tab
  const worldsTab = page
    .locator('[data-action="tab"][data-tab="worlds"], [data-tab="worlds"]')
    .first();
  await worldsTab.click({ force: true });
  await page.waitForLoadState('networkidle');

  // Dismiss tour overlay before clicking Create World (tour blocks button clicks)
  await dismissTourOverlay(page);

  // Click Create World button
  const createBtn = page.locator('button[data-action="worldCreate"]');
  await createBtn.click();
  // Wait for create world dialog to appear
  await pollForElement(page, 'input[name="title"]', { timeout: 5000 });

  // Fill world form
  const titleInput = page.locator('input[name="title"]');
  await titleInput.fill(`Test World ${worldId}`);

  // Select system
  const systemSelect = page.locator('select[name="system"]');
  const systemTile = page.locator(`[data-type="system"][data-package-id="${systemId}"]`).first();
  if (await systemTile.isVisible({ timeout: 1000 }).catch(() => false)) {
    await systemTile.click();
  }
  if (await systemSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
    await systemSelect.selectOption(systemId);
  } else {
    await systemSelect.evaluate((select, value) => {
      select.value = value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, systemId);
  }

  // Submit
  const submitBtn = page
    .locator(
      'button[type="submit"]:has-text("Create World"), button[type="submit"]:has-text("Continue")'
    )
    .first();
  await submitBtn.click();

  await page.waitForLoadState('networkidle').catch(() => {});
  await pollUntil(
    async () => {
      const url = page.url();
      if (url.includes('/players') || url.includes('/join') || url.includes('/game')) return true;
      return page
        .locator(`.package:has-text("${worldId}")`)
        .first()
        .isVisible()
        .catch(() => false);
    },
    { timeout: 120000, interval: 500, description: `world ${worldId} to be created` }
  );
  await completeUserManagementIfPresent(page, { logPrefix: 'createWorld' });
  console.log(`[setup] World ${worldId} created`);
}
