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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
const FOUNDRY_VENDOR_DIR = join(ROOT, 'vendor/foundry');
const SYSTEM_CACHE_DIR = join(ROOT, '.foundry-system-cache');
const MODULE_DIST_DIR = join(ROOT, 'dist');

/**
 * Find the Foundry zip file
 */
function findFoundryZip() {
  if (!existsSync(FOUNDRY_VENDOR_DIR)) {
    throw new Error(`Missing ${FOUNDRY_VENDOR_DIR}`);
  }
  
  const files = execSync(`ls -1 "${FOUNDRY_VENDOR_DIR}"`, { encoding: 'utf-8' })
    .split('\n')
    .filter(f => f.toLowerCase().endsWith('.zip'));
  
  if (files.length === 0) {
    throw new Error(`No .zip file found in ${FOUNDRY_VENDOR_DIR}`);
  }
  
  return join(FOUNDRY_VENDOR_DIR, files[0]);
}

/**
 * Setup an isolated Foundry instance for a single test
 * 
 * @param {Object} options
 * @param {string} options.testId - Unique test identifier
 * @param {string} options.systemId - Game system to install (e.g., 'dnd5e')
 * @param {string} options.adminKey - Admin password
 * @param {string} options.licenseKey - Foundry license key
 * @param {number} options.port - Port to run on
 * @returns {Promise<Object>} Server info for test use
 */
export async function setupIsolatedFoundry(options) {
  const { testId, systemId, adminKey, licenseKey, port } = options;
  
  // Unique directories for this test
  const testDir = join(ROOT, `.foundry-test-${testId}`);
  const dataDir = join(ROOT, `.foundry-data-${testId}`);
  const userDataDir = join(dataDir, 'Data');
  const modulesDir = join(userDataDir, 'modules');
  const worldsDir = join(userDataDir, 'worlds');
  const systemsDir = join(userDataDir, 'systems');
  const configDir = join(dataDir, 'Config');
  
  console.log(`[setup:${testId}] Creating isolated Foundry instance`);
  
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
  const foundryZip = findFoundryZip();
  console.log(`[setup:${testId}] Extracting Foundry...`);
  execSync(`unzip -q "${foundryZip}" -d "${testDir}"`, { stdio: 'pipe' });
  
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
  
  // 5. Copy cached system if available
  const cachedSystem = join(SYSTEM_CACHE_DIR, systemId);
  if (existsSync(cachedSystem)) {
    console.log(`[setup:${testId}] Using cached system: ${systemId}`);
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
  
  // 7. FORCE KILL any process already using this port (cleanup from failed previous runs)
  console.log(`[setup:${testId}] Pre-cleanup: ensuring port ${port} is free...`);
  try {
    execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: 'pipe' });
    // Wait a moment for the port to be released
    await new Promise(resolve => setTimeout(resolve, 500));
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
        await page.locator('button:has-text("Agree"), button[name="accept"], button[data-action="accept"]').first().click();
        await page.waitForLoadState('networkidle');
      }
    }
    
    // Dismiss any consent/usage data dialogs
    const consentDialog = page.locator('dialog, .dialog, [role="dialog"]');
    const declineSharingBtn = page.locator('button:has-text("Decline Sharing"), button:has-text("Decline"), button:has-text("No")');
    if (await declineSharingBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`[setup:${testId}] Dismissing consent/usage dialog`);
      await declineSharingBtn.click();
      await page.waitForTimeout(500);
    }
    
    // Dismiss tour if present
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Install system if not cached
    if (!existsSync(join(systemsDir, systemId))) {
      console.log(`[setup:${testId}] Installing system: ${systemId}`);
      try {
        await installSystemViaUI(page, baseUrl, systemId, adminKey);
      } catch (installError) {
        console.error(`[setup:${testId}] System installation failed: ${installError.message}`);
        throw installError;
      }
      
      // Cache the installed system for future tests
      const installedSystem = join(systemsDir, systemId);
      if (existsSync(installedSystem)) {
        mkdirSync(SYSTEM_CACHE_DIR, { recursive: true });
        cpSync(installedSystem, join(SYSTEM_CACHE_DIR, systemId), { recursive: true });
        console.log(`[setup:${testId}] Cached system: ${systemId}`);
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
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
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
  
  // Wait for port to be free
  for (let i = 0; i < 10; i++) {
    try {
      const result = execSync(`ss -tlnp | grep :${port} || true`, { encoding: 'utf-8' });
      if (!result.trim()) {
        console.log(`[teardown:${testId}] Port ${port} is now free`);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (e) {
      break; // If ss fails, assume port is free
    }
  }
  
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
 * Wait for server to respond
 */
async function waitForServer(baseUrl, timeout) {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(baseUrl, { method: 'HEAD' });
      if (response.ok || response.status === 302) {
        return;
      }
    } catch (e) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  throw new Error(`Server at ${baseUrl} did not start within ${timeout}ms`);
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
    await page.waitForTimeout(500);
  }
  
  // Dismiss tour overlay if present
  const tourOverlay = page.locator('.tour-overlay, .tour');
  if (await tourOverlay.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log(`[install] Dismissing tour overlay`);
    // Try multiple methods to dismiss tour
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    // Try clicking end tour button
    const endTourBtn = page.locator('button:has-text("End Tour"), button:has-text("Skip"), .tour-end');
    if (await endTourBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await endTourBtn.click();
    }
    await page.waitForTimeout(500);
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
  await page.waitForTimeout(1000);
  
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
  await page.waitForTimeout(500);
  
  // Click install
  console.log(`[install] Clicking Install button in dialog...`);
  const dialogInstallBtn = page.locator('#install-package footer button:has-text("Install")');
  await dialogInstallBtn.click({ force: true });
  
  // Wait a bit for installation to start
  console.log(`[setup] Waiting for ${systemId} to install (this may take a while)...`);
  await page.waitForTimeout(3000); // Give it 3 seconds to start downloading
  
  // Wait for installation by checking for progress/completion
  // The install package dialog should close when done OR show completion
  const progressBar = page.locator('.progress-bar, .install-progress, [data-progress]');
  
  for (let i = 0; i < 180; i++) { // 3 minute timeout (180 * 1000ms)
    // Check if we see the installed system now (installation completed)
    // Navigate to setup and check systems tab
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
        await page.waitForTimeout(500);
        
        // Check if installed
        const installed = page.locator(`[data-package-id="${systemId}"]`);
        if (await installed.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log(`[install] System ${systemId} installed successfully`);
          return;
        }
      }
    } catch (e) {
      console.log(`[install] Error during check (iteration ${i}): ${e.message}`);
    }
    
    await page.waitForTimeout(1000);
  }
  
  throw new Error(`System ${systemId} installation timed out after 3 minutes`);
}

/**
 * Create a world via Foundry UI
 */
async function createWorldViaUI(page, baseUrl, worldId, systemId, adminKey) {
  await page.goto(`${baseUrl}/setup`);
  await page.waitForLoadState('networkidle');
  
  // Authenticate if needed
  const adminKeyInput = page.locator('input[name="adminKey"], input[name="adminPassword"]');
  if (await adminKeyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await adminKeyInput.fill(adminKey);
    await page.locator('button[type="submit"]').click();
    await page.waitForLoadState('networkidle');
  }
  
  // Click Worlds tab
  const worldsTab = page.locator('[data-action="tab"][data-tab="worlds"], [data-tab="worlds"]').first();
  await worldsTab.click({ force: true });
  await page.waitForLoadState('networkidle');
  
  // Click Create World button
  const createBtn = page.locator('button[data-action="worldCreate"]');
  await createBtn.click();
  await page.waitForTimeout(1000);
  
  // Fill world form
  const titleInput = page.locator('input[name="title"]');
  await titleInput.fill(`Test World ${worldId}`);
  
  // Select system
  const systemSelect = page.locator('select[name="system"]');
  await systemSelect.selectOption(systemId);
  
  // Submit
  const submitBtn = page.locator('button[type="submit"]:has-text("Create World")');
  await submitBtn.click();
  
  await page.waitForLoadState('networkidle');
  console.log(`[setup] World ${worldId} created`);
}
