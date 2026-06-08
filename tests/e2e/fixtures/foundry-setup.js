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
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, cpSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';
import {
  pollUntil,
  pollForElement,
  pollUntilGone,
  pollForServer,
  waitForUiSettle,
} from './poll-utils.js';
import { extractZip, isPortInUse, waitForPortFree, killAndWait, resolveLicenseJson } from './platform-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
const SYSTEM_CACHE_ROOT = join(ROOT, '.foundry-system-cache');

function systemCacheDir(foundryVersion) {
  return join(SYSTEM_CACHE_ROOT, `v${foundryVersion}`);
}

// Linux/Node zips put main.mjs at the root; Windows portable zips nest it.
function findFoundryEntryPoint(extractDir) {
  const candidates = [
    join(extractDir, 'main.mjs'),
    join(extractDir, 'App', 'resources', 'app', 'main.mjs'),
    join(extractDir, 'resources', 'app', 'main.mjs'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Could not locate main.mjs in extracted Foundry at ${extractDir}`);
}

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
    await pollUntilGone(page, 'button[data-action="no"]:has-text("Decline Sharing")', { timeout: 3000 }).catch(() => {});
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
      if (typeof Tour !== 'undefined' && Tour.activeTour && typeof Tour.activeTour.exit === 'function') {
        // @ts-ignore
        Tour.activeTour.exit();
      }
    } catch (e) { /* ignore */ }
  });
  
  // Also try pressing Escape to dismiss tour
  await page.keyboard.press('Escape');
  
  // Poll until tour overlay is gone
  await pollUntilGone(page, '.tour-overlay, .tour', { timeout: 2000 }).catch(() => {});
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
 * Setup an isolated Foundry instance for a single test.
 *
 * Two source modes:
 *  - foundryZip: extract a fresh copy per test (normal local dev flow)
 *  - foundryInstallPath: share a pre-extracted install (container/CI flow);
 *    only the data directory is isolated per test, Foundry binaries are shared
 *
 * @param {Object} options
 * @param {string} options.testId
 * @param {string} options.systemId
 * @param {number} options.foundryVersion
 * @param {string|null} options.foundryZip
 * @param {string|null} options.foundryInstallPath - Pre-extracted Foundry dir
 * @param {string} options.adminKey
 * @param {string} [options.licenseKey]
 * @param {number} options.port
 * @returns {Promise<Object>} Server info for test use
 */
export async function setupIsolatedFoundry(options) {
  const { testId, systemId, foundryVersion, foundryZip, foundryInstallPath,
    adminKey, licenseKey, port } = options;
  const cacheDir = systemCacheDir(foundryVersion);
  
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
  
  // Compute worldId up-front so it's available for disk pre-creation before server start.
  const shortHash = testId.replace(/[^a-f0-9]/g, '').slice(-12);
  let worldId = `w-${shortHash}`;

  console.log(`[setup:${testId}] Creating isolated Foundry instance`);
  if (basePath !== ROOT) {
    console.log(`[setup:${testId}] Using tmpfs: ${basePath}`);
  }
  
  // 1. Clean any existing per-test directories
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });

  // 2. Create data directory structure (testDir only created in zip mode)
  mkdirSync(modulesDir, { recursive: true });
  mkdirSync(worldsDir, { recursive: true });
  mkdirSync(systemsDir, { recursive: true });
  mkdirSync(configDir, { recursive: true });

  // 3. Obtain Foundry binaries
  // foundryDir is where main.mjs lives; shared across tests in install-path mode.
  let foundryDir;
  if (foundryInstallPath) {
    if (!existsSync(foundryInstallPath)) {
      throw new Error(`FOUNDRY_INSTALL_PATH not found: ${foundryInstallPath}`);
    }
    foundryDir = foundryInstallPath;
    console.log(`[setup:${testId}] Using pre-installed Foundry at ${foundryDir}`);
  } else {
    if (!foundryZip || !existsSync(foundryZip)) {
      throw new Error(`Foundry zip not found: ${foundryZip}`);
    }
    mkdirSync(testDir, { recursive: true });
    foundryDir = testDir;
    console.log(`[setup:${testId}] Extracting Foundry v${foundryVersion}`);
    extractZip(foundryZip, foundryDir);
  }
  
  // 4. Package and deploy module
  console.log(`[setup:${testId}] Packaging module...`);
  execSync('node tools/package-module.js', { cwd: ROOT, stdio: 'pipe' });
  
  // Deploy by copying the module directory (faster than unzipping)
  const moduleSourceDir = join(ROOT, 'scripts');
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
  
  // 5. Copy cached system if available (per-version cache)
  const cachedSystem = join(cacheDir, systemId);
  if (existsSync(cachedSystem)) {
    console.log(`[setup:${testId}] Using cached system: ${systemId} (v${foundryVersion})`);
    cpSync(cachedSystem, join(systemsDir, systemId), { recursive: true });
  }
  
  // 6. Configure Foundry
  const optionsJson = {
    dataPath: dataDir,
    port: port,
    upnp: false,
    adminKey: adminKey,
  };
  writeFileSync(join(configDir, 'options.json'), JSON.stringify(optionsJson, null, 2));

  const licenseJson = resolveLicenseJson();
  if (licenseJson) {
    writeFileSync(join(configDir, 'license.json'), licenseJson);
  } else {
    console.warn(`[setup:${testId}] No license.json found — Foundry will prompt for license/EULA`);
  }

  // 6b. Pre-create the world directory and manifest before starting the server.
  // Foundry loads worlds from disk at startup, so creating it now ensures the
  // world is immediately available without any HTTP/UI interaction after boot.
  const worldDir = join(worldsDir, worldId);
  mkdirSync(worldDir, { recursive: true });
  // Read the installed system version so the world manifest is valid.
  let systemVersion = '1.0.0';
  try {
    const sysJson = JSON.parse(readFileSync(join(systemsDir, systemId, 'system.json'), 'utf-8'));
    systemVersion = sysJson.version ?? sysJson.data?.version ?? '1.0.0';
  } catch { /* use default */ }

  // Derive the full Foundry build version from the zip filename when available.
  const coreVersionMatch = foundryZip?.match(/(\d+\.\d+)/);
  const coreVersion = coreVersionMatch
    ? coreVersionMatch[1]
    : (process.env.FOUNDRY_VERSION || String(foundryVersion));

  writeFileSync(join(worldDir, 'world.json'), JSON.stringify({
    id: worldId,
    title: worldId,
    system: systemId,
    coreVersion,
    compatibility: { minimum: String(foundryVersion), verified: String(foundryVersion) },
    systemVersion,
    description: '',
    flags: {},
  }, null, 2));
  console.log(`[setup:${testId}] Pre-created world: ${worldId}`);

  // 7. Verify the port is free.
  if (!(await waitForPortFree(port, { timeoutMs: 5000 }))) {
    throw new Error(
      `Port ${port} is in use — likely an orphan from a previous crashed run. Kill it and retry.`
    );
  }
  
  // 8. Start Foundry server
  const mainMjs = findFoundryEntryPoint(foundryDir);
  console.log(`[setup:${testId}] Starting Foundry on port ${port}`);

  const serverProcess = spawn('node', [mainMjs, `--dataPath=${dataDir}`, `--port=${port}`], {
    cwd: dirname(mainMjs),
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false,
  });
  
  const serverPid = serverProcess.pid;
  console.log(`[setup:${testId}] Server PID: ${serverPid}`);
  
  // Forward server output
  serverProcess.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[foundry:${testId}] ${msg}`);
  });
  serverProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[foundry:${testId}] ${msg}`);
  });
  
  // 8. Wait for server to be ready
  const baseUrl = `http://localhost:${port}`;
  await waitForServer(baseUrl, 60000);
  console.log(`[setup:${testId}] Server is ready`);
  
  // 9. Use Playwright to complete setup (license, system install, world creation)
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
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
        await page.locator('button:has-text("Agree"), button[name="accept"], button[data-action="accept"]').first().click();
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
        await installSystemViaUI(page, baseUrl, systemId, adminKey);
      } catch (installError) {
        console.error(`[setup:${testId}] System installation failed: ${installError.message}`);
        throw installError;
      }
      
      // Cache the installed system for future tests (per-version)
      const installedSystem = join(systemsDir, systemId);
      if (existsSync(installedSystem)) {
        mkdirSync(cacheDir, { recursive: true });
        cpSync(installedSystem, join(cacheDir, systemId), { recursive: true });
        console.log(`[setup:${testId}] Cached system: ${systemId} (v${foundryVersion})`);
      }
    } else {
      console.log(`[setup:${testId}] Using cached system: ${systemId}`);
    }
    
    // World was pre-created on disk before server start (see step 6b above).
    // No browser interaction needed for world creation.
    
  } finally {
    await context.close();
    await browser.close();
  }
  
  // Return server info for test use
  return {
    testId,
    testDir: foundryInstallPath ? null : testDir,
    dataDir,
    baseUrl,
    port,
    serverPid,
    serverProcess,
    adminKey,
    worldId,
    systemId,
    foundryVersion,
    foundryZip,
  };
}

export async function teardownIsolatedFoundry(serverInfo) {
  const { testId, testDir, dataDir, port, serverPid, serverProcess } = serverInfo;

  console.log(`[teardown:${testId}] Stopping server on port ${port}...`);

  // Await full process exit; Windows holds file handles until then.
  await killAndWait(serverProcess, { escalateAfterMs: 2000, timeoutMs: 8000 });

  if (serverPid) {
    try { process.kill(serverPid, 'SIGKILL'); } catch { /* already dead */ }
  }

  if (await waitForPortFree(port, { timeoutMs: 5000 })) {
    console.log(`[teardown:${testId}] Port ${port} is now free`);
  } else {
    console.log(`[teardown:${testId}] Warning: Port ${port} may still be in use`);
  }

  console.log(`[teardown:${testId}] Cleaning up directories...`);
  // testDir is null in pre-installed mode (shared Foundry binaries — never delete)
  if (testDir) await rmDirWithRetry(testDir, testId, 'testDir');
  await rmDirWithRetry(dataDir, testId, 'dataDir');

  console.log(`[teardown:${testId}] Cleanup complete`);
}

async function rmDirWithRetry(dir, testId, label, { attempts = 25, delayMs = 400 } = {}) {
  if (!existsSync(dir)) return;
  for (let i = 0; i < attempts; i++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      if (i === attempts - 1) {
        console.log(`[teardown:${testId}] Error removing ${label}: ${err.message}`);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Wait for server to respond using polling utility
 */
async function waitForServer(baseUrl, timeout) {
  await pollForServer(baseUrl, { timeout, pollInterval: 300 });
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
    await pollUntilGone(page, 'button:has-text("Decline Sharing")', { timeout: 2000 }).catch(() => {});
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
      const endTourBtn = page.locator('button:has-text("End Tour"), button:has-text("Skip"), .tour-end');
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
  const systemsTab = page.locator('[data-action="tab"][data-tab="systems"], [data-tab="systems"]').first();
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
  const installBtn = page.locator('section[data-tab="systems"] button[data-action="installPackage"]');
  await installBtn.click();
  // Wait for install dialog to appear using polling
  await pollForElement(page, 'input[name="manifestURL"], #install-package-manifestUrl', { timeout: 5000 });
  
  // Use manifest URL
  const manifestUrls = {
    'dnd5e': 'https://raw.githubusercontent.com/foundryvtt/dnd5e/master/system.json',
    'pf2e': 'https://github.com/foundryvtt/pf2e/releases/latest/download/system.json',
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
