/**
 * Playwright Global Setup - MINIMAL
 * 
 * This only does truly one-time validation work:
 * 1. Validates Foundry zip exists
 * 2. Validates license key exists
 * 3. Pre-caches game systems (to speed up per-test setup)
 * 
 * Per-test setup (server start, world creation) is handled by fixtures.
 * This ensures each test is completely isolated.
 */

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, cpSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';
import { extractZip, killAndWait, resolveLicenseJson } from '../fixtures/platform-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
const TEST_ENV_PATH = join(ROOT, 'tests/e2e/.env.test');
const FOUNDRY_VENDOR_DIR = join(ROOT, 'vendor/foundry');
const SYSTEM_CACHE_ROOT = join(ROOT, '.foundry-system-cache');

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
 * Load environment variables from .env.test
 */
function loadEnv() {
  if (!existsSync(TEST_ENV_PATH)) {
    console.error(`[setup] ERROR: Missing ${TEST_ENV_PATH}`);
    console.error('[setup] Copy .env.test.example to .env.test and configure it.');
    process.exit(1);
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

function findFoundryZips() {
  if (!existsSync(FOUNDRY_VENDOR_DIR)) {
    console.error(`[setup] ERROR: Missing ${FOUNDRY_VENDOR_DIR}`);
    console.error('[setup] Create vendor/foundry/ and place your FoundryVTT zip file(s) there.');
    process.exit(1);
  }

  const files = readdirSync(FOUNDRY_VENDOR_DIR)
    .filter(f => f.toLowerCase().endsWith('.zip'));

  const zips = files
    .map(f => {
      const match = f.match(/(\d+)\.\d+/);
      if (!match) return null;
      return { zipPath: join(FOUNDRY_VENDOR_DIR, f), foundryVersion: parseInt(match[1], 10) };
    })
    .filter(Boolean);

  if (zips.length === 0) {
    console.error(`[setup] ERROR: No versioned .zip file found in ${FOUNDRY_VENDOR_DIR}`);
    console.error('[setup] Place a FoundryVTT zip whose filename contains the version (e.g., FoundryVTT-13.351.zip).');
    process.exit(1);
  }

  return zips.sort((a, b) => a.foundryVersion - b.foundryVersion);
}

/**
 * Parse system IDs from environment
 */
function parseSystemIds(env) {
  const systemIdsRaw = env.TEST_SYSTEM_IDS || env.TEST_SYSTEM_ID || 'dnd5e';
  return systemIdsRaw.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Global Setup - Validation Only
 */
export default async function globalSetup() {
  console.log('============================================================');
  console.log('[setup] Simulacrum E2E Test Setup (Validation Only)');
  console.log('============================================================');
  
  // 1. Load and validate environment
  const env = loadEnv();
  const systemIds = parseSystemIds(env);
  
  console.log(`[setup] Systems to test: ${systemIds.join(', ')}`);
  
  // 2. Validate Foundry zips exist (one or more versions)
  const foundryZips = findFoundryZips();
  console.log(`[setup] Found ${foundryZips.length} Foundry zip(s):`);
  for (const { zipPath, foundryVersion } of foundryZips) {
    console.log(`  - v${foundryVersion}: ${zipPath}`);
  }

  // 3. Validate license key exists
  if (!env.FOUNDRY_LICENSE_KEY) {
    console.error('[setup] ERROR: FOUNDRY_LICENSE_KEY not set in .env.test');
    process.exit(1);
  }
  console.log('[setup] License key: ****' + env.FOUNDRY_LICENSE_KEY.slice(-4));

  // 4. Package the module once (this is safe to share between tests)
  console.log('[setup] Packaging Simulacrum module...');
  try {
    execSync('node tools/package-module.js', {
      cwd: ROOT,
      stdio: 'pipe',
      encoding: 'utf-8'
    });
    console.log('[setup] Module packaged successfully');
  } catch (e) {
    console.error('[setup] ERROR packaging module:', e.message);
    process.exit(1);
  }

  // 5. Pre-cache systems per Foundry version (a v13 system install isn't reusable for v14)
  for (const { zipPath, foundryVersion } of foundryZips) {
    const versionCacheDir = join(SYSTEM_CACHE_ROOT, `v${foundryVersion}`);
    const needsCaching = [];

    for (const systemId of systemIds) {
      const cachedSystem = join(versionCacheDir, systemId);
      if (existsSync(cachedSystem)) {
        console.log(`[setup] v${foundryVersion}/${systemId} already cached`);
      } else {
        needsCaching.push(systemId);
        console.log(`[setup] v${foundryVersion}/${systemId} needs caching`);
      }
    }

    if (needsCaching.length > 0) {
      console.log(`[setup] Pre-caching ${needsCaching.length} system(s) on Foundry v${foundryVersion}...`);
      await preCacheSystems(needsCaching, zipPath, foundryVersion, env);
    }
  }

  console.log('============================================================');
  console.log('[setup] Validation complete. Tests will each start their own Foundry instance.');
  console.log('============================================================');
}

async function preCacheSystems(systemIds, foundryZip, foundryVersion, env) {
  const versionCacheDir = join(SYSTEM_CACHE_ROOT, `v${foundryVersion}`);
  const tempDir = join(ROOT, `.foundry-cache-setup-v${foundryVersion}`);
  const dataDir = join(ROOT, `.foundry-cache-data-v${foundryVersion}`);
  const systemsDir = join(dataDir, 'Data', 'systems');
  const configDir = join(dataDir, 'Config');
  
  try {
    // Clean any existing temp dirs (use retry helper — Windows holds handles briefly)
    await rmDirWithRetry(tempDir);
    await rmDirWithRetry(dataDir);
    
    // Create directories
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(systemsDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    
    // Extract Foundry
    console.log('[cache] Extracting Foundry for system caching...');
    extractZip(foundryZip, tempDir);
    
    // Configure (per-version port avoids collisions if cache runs sequentially)
    const cachePort = 30090 + foundryVersion;
    const optionsJson = {
      dataPath: dataDir,
      port: cachePort,
      upnp: false,
      adminKey: env.FOUNDRY_ADMIN_KEY || 'cache-admin-key',
    };
    writeFileSync(join(configDir, 'options.json'), JSON.stringify(optionsJson, null, 2));

    const licenseJson = resolveLicenseJson();
    if (licenseJson) {
      writeFileSync(join(configDir, 'license.json'), licenseJson);
    } else {
      console.warn('[cache] No license.json found — Foundry will prompt for license/EULA');
    }

    const mainMjs = findFoundryEntryPoint(tempDir);
    console.log(`[cache] Starting temporary Foundry v${foundryVersion} server...`);
    const serverProcess = spawn('node', [mainMjs, `--dataPath=${dataDir}`, `--port=${cachePort}`], {
      cwd: dirname(mainMjs),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    // Wait for server to be ready
    const baseUrl = `http://localhost:${cachePort}`;
    await waitForServer(baseUrl, 60000);
    console.log('[cache] Server ready');
    
    // Use Playwright to install systems
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
      await page.goto(`${baseUrl}/setup`);
      await page.waitForLoadState('networkidle');
      
      // Handle license if needed
      const licenseInput = page.locator('input[name="licenseKey"]');
      if (await licenseInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('[cache] Entering license key...');
        await licenseInput.fill(env.FOUNDRY_LICENSE_KEY);
        await page.locator('button[type="submit"]').first().click();
        await page.waitForLoadState('networkidle');
        
        // Accept EULA
        const eulaCheckbox = page.locator('input[name="agree"], #eula-agree');
        if (await eulaCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
          await eulaCheckbox.check();
          await page.locator('button[data-action="accept"], button:has-text("Agree")').first().click();
          await page.waitForLoadState('networkidle');
        }
      }
      
      // Handle admin auth
      const adminKeyInput = page.locator('input[name="adminKey"], input[name="adminPassword"]');
      if (await adminKeyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await adminKeyInput.fill(env.FOUNDRY_ADMIN_KEY || 'cache-admin-key');
        await page.locator('button[type="submit"]').first().click();
        await page.waitForLoadState('networkidle');
      }
      
      await dismissBlockingDialogs(page);
      
      // Install each system
      for (const systemId of systemIds) {
        console.log(`[cache] Installing system: ${systemId}...`);
        await installSystemForCache(page, baseUrl, systemId, env.FOUNDRY_ADMIN_KEY || 'cache-admin-key');
        
        // Cache the installed system (per-version)
        const installedSystem = join(systemsDir, systemId);
        if (existsSync(installedSystem)) {
          mkdirSync(versionCacheDir, { recursive: true });
          cpSync(installedSystem, join(versionCacheDir, systemId), { recursive: true });
          console.log(`[cache] Cached system: ${systemId} (v${foundryVersion})`);
        } else {
          console.error(`[cache] WARNING: System ${systemId} not found after installation`);
        }
      }
      
    } finally {
      await context.close();
      await browser.close();
    }
    
    // Await full process exit; Windows holds file handles until then.
    console.log('[cache] Stopping temporary server...');
    await killAndWait(serverProcess, { escalateAfterMs: 2000, timeoutMs: 8000 });

  } finally {
    console.log('[cache] Cleaning up temporary directories...');
    await rmDirWithRetry(tempDir);
    await rmDirWithRetry(dataDir);
  }
}

async function rmDirWithRetry(dir, { attempts = 25, delayMs = 400 } = {}) {
  if (!existsSync(dir)) return;
  for (let i = 0; i < attempts; i++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      if (i === attempts - 1) {
        console.warn(`[cache] WARNING: failed to remove ${dir}: ${err.message}`);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Wait for server to respond
 */
async function waitForServer(baseUrl, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(baseUrl, { method: 'HEAD' });
      if (response.ok || response.status === 302) return;
    } catch (e) {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Server at ${baseUrl} did not start within ${timeout}ms`);
}

/**
 * Install a system via UI for caching
 */
// v14 surfaces additional permission/consent dialogs after auth that intercept
// pointer events on the setup tabs. Dismiss any open <dialog> before clicking.
async function dismissBlockingDialogs(page) {
  for (let i = 0; i < 5; i++) {
    const declineBtn = page.locator(
      'dialog[open] button[data-action="no"], ' +
      'dialog[open] button[data-action="decline"], ' +
      'dialog[open] button:has-text("Decline"), ' +
      'dialog[open] button:has-text("No")'
    ).first();
    if (await declineBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await declineBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(200);
      continue;
    }
    const anyOpenDialog = page.locator('dialog[open]').first();
    if (!(await anyOpenDialog.isVisible({ timeout: 200 }).catch(() => false))) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
}

async function installSystemForCache(page, baseUrl, systemId, adminKey, licenseKey) {
  await page.goto(`${baseUrl}/setup`);
  await page.waitForLoadState('networkidle');

  const licenseInput = page.locator('input[name="licenseKey"]');
  if (licenseKey && await licenseInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    await licenseInput.fill(licenseKey);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForLoadState('networkidle');

    const eulaCheckbox = page.locator('input[name="agree"], input[name="eula"], #eula-agree');
    if (await eulaCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
      await eulaCheckbox.check();
      await page.locator('button[data-action="accept"], button:has-text("Agree")')
        .first().click();
      await page.waitForLoadState('networkidle');
    }
  }

  const adminKeyInput = page.locator('input[name="adminKey"], input[name="adminPassword"]');
  if (await adminKeyInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    await adminKeyInput.fill(adminKey);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForLoadState('networkidle');
  }

  await dismissBlockingDialogs(page);

  const systemsTab = page.locator('[data-tab="systems"]').first();
  if (!(await systemsTab.isVisible({ timeout: 5000 }).catch(() => false))) {
    const shotPath = join(ROOT, `tests/e2e/test-results/cache-install-${systemId}-no-systems-tab.png`);
    try { await page.screenshot({ path: shotPath, fullPage: true }); } catch { /* best effort */ }
    throw new Error(
      `[cache] systems tab not found at ${page.url()} (saved screenshot: ${shotPath})`
    );
  }
  await systemsTab.click({ force: true });
  await page.waitForLoadState('networkidle');
  
  // Check if already installed
  const installed = page.locator(`[data-package-id="${systemId}"]`);
  if (await installed.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log(`[cache] System ${systemId} already installed`);
    return;
  }
  
  // Click Install System
  const installBtn = page.locator('section[data-tab="systems"] button[data-action="installPackage"]');
  await installBtn.click();
  await page.waitForTimeout(1000);
  
  // Use manifest URL
  const manifestUrls = {
    'dnd5e': 'https://raw.githubusercontent.com/foundryvtt/dnd5e/master/system.json',
    'pf2e': 'https://github.com/foundryvtt/pf2e/releases/latest/download/system.json',
  };
  
  const manifestUrl = manifestUrls[systemId];
  if (!manifestUrl) {
    console.error(`[cache] Unknown system: ${systemId}`);
    return;
  }
  
  const manifestInput = page.locator('input[name="manifestURL"], #install-package-manifestUrl');
  await manifestInput.fill(manifestUrl);
  await page.waitForTimeout(500);
  
  // Install
  const dialogInstallBtn = page.locator('#install-package footer button:has-text("Install")');
  await dialogInstallBtn.click({ force: true });
  
  // Wait for installation (poll for installed package)
  console.log(`[cache] Waiting for ${systemId} to install...`);
  for (let i = 0; i < 120; i++) { // 2 minute timeout
    await page.waitForTimeout(2000);
    await page.goto(`${baseUrl}/setup`);
    await page.waitForLoadState('networkidle');
    
    // Re-auth if needed
    if (await adminKeyInput.isVisible({ timeout: 500 }).catch(() => false)) {
      await adminKeyInput.fill(adminKey);
      await page.locator('button[type="submit"]').first().click();
      await page.waitForLoadState('networkidle');
    }
    
    await systemsTab.click();
    await page.waitForLoadState('networkidle');
    
    if (await installed.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`[cache] System ${systemId} installed successfully`);
      return;
    }
  }
  
  throw new Error(`System ${systemId} installation timed out`);
}
