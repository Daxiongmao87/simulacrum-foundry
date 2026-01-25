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
import { existsSync, mkdirSync, readFileSync, cpSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
const TEST_ENV_PATH = join(ROOT, 'tests/e2e/.env.test');
const FOUNDRY_VENDOR_DIR = join(ROOT, 'vendor/foundry');
const SYSTEM_CACHE_DIR = join(ROOT, '.foundry-system-cache');

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

/**
 * Find the Foundry zip file in vendor/foundry/
 */
function findFoundryZip() {
  if (!existsSync(FOUNDRY_VENDOR_DIR)) {
    console.error(`[setup] ERROR: Missing ${FOUNDRY_VENDOR_DIR}`);
    console.error('[setup] Create vendor/foundry/ and place your FoundryVTT zip file there.');
    process.exit(1);
  }
  
  const files = execSync(`ls -1 "${FOUNDRY_VENDOR_DIR}"`, { encoding: 'utf-8' })
    .split('\n')
    .filter(f => f.toLowerCase().endsWith('.zip'));
  
  if (files.length === 0) {
    console.error(`[setup] ERROR: No .zip file found in ${FOUNDRY_VENDOR_DIR}`);
    console.error('[setup] Download FoundryVTT and place the zip file in vendor/foundry/');
    process.exit(1);
  }
  
  return join(FOUNDRY_VENDOR_DIR, files[0]);
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
  
  // 2. Validate Foundry zip exists
  const foundryZip = findFoundryZip();
  console.log(`[setup] Foundry zip: ${foundryZip}`);
  
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
  
  // 5. Pre-cache systems (speeds up per-test setup significantly)
  const needsCaching = [];
  for (const systemId of systemIds) {
    const cachedSystem = join(SYSTEM_CACHE_DIR, systemId);
    if (existsSync(cachedSystem)) {
      console.log(`[setup] System ${systemId} already cached`);
    } else {
      needsCaching.push(systemId);
      console.log(`[setup] System ${systemId} needs caching`);
    }
  }
  
  if (needsCaching.length > 0) {
    console.log(`[setup] Pre-caching ${needsCaching.length} system(s)...`);
    await preCacheSystems(needsCaching, foundryZip, env);
  }
  
  console.log('============================================================');
  console.log('[setup] Validation complete. Tests will each start their own Foundry instance.');
  console.log('============================================================');
}

/**
 * Pre-cache game systems by temporarily starting Foundry
 */
async function preCacheSystems(systemIds, foundryZip, env) {
  const tempDir = join(ROOT, '.foundry-cache-setup');
  const dataDir = join(ROOT, '.foundry-cache-data');
  const systemsDir = join(dataDir, 'Data', 'systems');
  const configDir = join(dataDir, 'Config');
  
  try {
    // Clean any existing temp dirs
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
    
    // Create directories
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(systemsDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    
    // Extract Foundry
    console.log('[cache] Extracting Foundry for system caching...');
    execSync(`unzip -q "${foundryZip}" -d "${tempDir}"`, { stdio: 'pipe' });
    
    // Configure
    const optionsJson = {
      dataPath: dataDir,
      port: 30099, // Use a different port for caching
      upnp: false,
      adminKey: env.FOUNDRY_ADMIN_KEY || 'cache-admin-key',
    };
    writeFileSync(join(configDir, 'options.json'), JSON.stringify(optionsJson, null, 2));
    
    // Start server
    console.log('[cache] Starting temporary Foundry server...');
    const mainMjs = join(tempDir, 'main.mjs');
    const serverProcess = spawn('node', [mainMjs, `--dataPath=${dataDir}`, '--port=30099'], {
      cwd: tempDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    // Wait for server to be ready
    const baseUrl = 'http://localhost:30099';
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
      
      // Dismiss dialogs
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      
      // Install each system
      for (const systemId of systemIds) {
        console.log(`[cache] Installing system: ${systemId}...`);
        await installSystemForCache(page, baseUrl, systemId, env.FOUNDRY_ADMIN_KEY || 'cache-admin-key');
        
        // Cache the installed system
        const installedSystem = join(systemsDir, systemId);
        if (existsSync(installedSystem)) {
          mkdirSync(SYSTEM_CACHE_DIR, { recursive: true });
          cpSync(installedSystem, join(SYSTEM_CACHE_DIR, systemId), { recursive: true });
          console.log(`[cache] Cached system: ${systemId}`);
        } else {
          console.error(`[cache] WARNING: System ${systemId} not found after installation`);
        }
      }
      
    } finally {
      await context.close();
      await browser.close();
    }
    
    // Kill server
    console.log('[cache] Stopping temporary server...');
    serverProcess.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!serverProcess.killed) serverProcess.kill('SIGKILL');
    
    // Also force kill on port
    try {
      execSync('fuser -k 30099/tcp 2>/dev/null || true', { stdio: 'pipe' });
    } catch (e) {}
    
  } finally {
    // Cleanup temp dirs
    console.log('[cache] Cleaning up temporary directories...');
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
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
async function installSystemForCache(page, baseUrl, systemId, adminKey) {
  await page.goto(`${baseUrl}/setup`);
  await page.waitForLoadState('networkidle');
  
  // Re-auth if needed
  const adminKeyInput = page.locator('input[name="adminKey"], input[name="adminPassword"]');
  if (await adminKeyInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    await adminKeyInput.fill(adminKey);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForLoadState('networkidle');
  }
  
  // Click Systems tab
  const systemsTab = page.locator('[data-tab="systems"]').first();
  await systemsTab.click();
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
