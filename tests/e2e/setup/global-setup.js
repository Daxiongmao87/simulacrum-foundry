/**
 * Playwright Global Setup
 * 
 * Executes BEFORE all tests run:
 * 1. Validates Foundry zip exists in vendor/foundry/
 * 2. Unzips Foundry to .foundry-test/
 * 3. Packages the Simulacrum module
 * 4. Deploys module to .foundry-test/Data/modules/
 * 5. Configures and launches Foundry server
 * 6. Uses Playwright to install systems via Foundry UI
 * 7. Uses Playwright to create test worlds via Foundry UI
 * 8. Saves state for tests
 */

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
const TEST_ENV_PATH = join(ROOT, 'tests/e2e/.env.test');
const FOUNDRY_VENDOR_DIR = join(ROOT, 'vendor/foundry');
const FOUNDRY_TEST_DIR = join(ROOT, '.foundry-test');
// Data directory MUST be outside the application directory (Foundry restriction)
const FOUNDRY_DATA_DIR = join(ROOT, '.foundry-test-data');
// Foundry v13+ stores user data in a 'Data' subdirectory
const FOUNDRY_USER_DATA_DIR = join(FOUNDRY_DATA_DIR, 'Data');
const FOUNDRY_MODULES_DIR = join(FOUNDRY_USER_DATA_DIR, 'modules');
const FOUNDRY_WORLDS_DIR = join(FOUNDRY_USER_DATA_DIR, 'worlds');
const FOUNDRY_SYSTEMS_DIR = join(FOUNDRY_USER_DATA_DIR, 'systems');

// State file to communicate with teardown and tests
const STATE_FILE = join(__dirname, '.test-state.json');

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
 * Parse comma-separated system IDs from env
 */
function parseSystemIds(env) {
  const systemIdsRaw = env.TEST_SYSTEM_IDS || env.TEST_SYSTEM_ID || 'dnd5e';
  return systemIdsRaw.split(',').map(s => s.trim()).filter(Boolean);
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
  
  if (files.length > 1) {
    console.warn(`[setup] WARNING: Multiple zip files found, using: ${files[0]}`);
  }
  
  return join(FOUNDRY_VENDOR_DIR, files[0]);
}

/**
 * Unzip Foundry to test directory
 */
function unzipFoundry(zipPath) {
  console.log(`[setup] Extracting Foundry from ${zipPath}...`);
  
  if (existsSync(FOUNDRY_TEST_DIR)) {
    console.log('[setup] Cleaning existing test directory...');
    rmSync(FOUNDRY_TEST_DIR, { recursive: true, force: true });
  }
  
  // Also clean the separate data directory
  if (existsSync(FOUNDRY_DATA_DIR)) {
    console.log('[setup] Cleaning existing data directory...');
    rmSync(FOUNDRY_DATA_DIR, { recursive: true, force: true });
  }
  
  mkdirSync(FOUNDRY_TEST_DIR, { recursive: true });
  execSync(`unzip -q "${zipPath}" -d "${FOUNDRY_TEST_DIR}"`, { stdio: 'inherit' });
  
  // Create data directories (now separate from application directory)
  mkdirSync(FOUNDRY_MODULES_DIR, { recursive: true });
  mkdirSync(FOUNDRY_WORLDS_DIR, { recursive: true });
  mkdirSync(FOUNDRY_SYSTEMS_DIR, { recursive: true });
  
  console.log('[setup] Foundry extracted successfully.');
}

/**
 * Package the Simulacrum module
 */
function packageModule() {
  console.log('[setup] Packaging Simulacrum module...');
  execSync('node tools/package-module.js', { cwd: ROOT, stdio: 'inherit' });
  console.log('[setup] Module packaged.');
}

/**
 * Deploy module to Foundry test instance
 */
function deployModule() {
  console.log('[setup] Deploying Simulacrum to test instance...');
  
  const moduleJson = JSON.parse(readFileSync(join(ROOT, 'module.json'), 'utf-8'));
  const moduleId = moduleJson.id || 'simulacrum';
  const version = moduleJson.version || '0.0.0';
  
  const zipPath = join(ROOT, 'dist', `${moduleId}-${version}.zip`);
  const targetDir = join(FOUNDRY_MODULES_DIR, moduleId);
  
  if (!existsSync(zipPath)) {
    console.error(`[setup] ERROR: Module zip not found at ${zipPath}`);
    process.exit(1);
  }
  
  mkdirSync(targetDir, { recursive: true });
  execSync(`unzip -q -o "${zipPath}" -d "${targetDir}"`, { stdio: 'inherit' });
  
  console.log(`[setup] Module deployed to ${targetDir}`);
}

/**
 * Create Foundry options.json for headless operation
 */
function configureFoundry(env) {
  console.log('[setup] Configuring Foundry for testing...');
  
  const configDir = join(FOUNDRY_TEST_DIR, 'Config');
  mkdirSync(configDir, { recursive: true });
  
  const options = {
    dataPath: FOUNDRY_DATA_DIR,
    port: parseInt(env.FOUNDRY_PORT || '30000', 10),
    upnp: false,
    fullscreen: false,
    hostname: env.FOUNDRY_HOSTNAME || 'localhost',
    localHostname: null,
    routePrefix: null,
    sslCert: null,
    sslKey: null,
    awsConfig: null,
    proxySSL: false,
    proxyPort: null,
    minifyStaticFiles: false,
    updateChannel: 'stable',
    language: 'en.core',
    world: null,
    compressStatic: false,
    hotReload: false,
    telemetry: false,
    noBackups: true,
    noCdn: true,
    adminKey: env.FOUNDRY_ADMIN_KEY || 'test-admin-key'
  };
  
  writeFileSync(join(configDir, 'options.json'), JSON.stringify(options, null, 2));
  
  if (env.FOUNDRY_LICENSE_KEY) {
    const license = {
      license: env.FOUNDRY_LICENSE_KEY,
      host: env.FOUNDRY_HOSTNAME || 'localhost',
      version: '13.0.0',
      signature: null
    };
    writeFileSync(join(configDir, 'license.json'), JSON.stringify(license, null, 2));
  }
  
  console.log('[setup] Foundry configured.');
}

/**
 * Launch Foundry server
 */
function launchFoundry(env) {
  console.log('[setup] Launching Foundry server...');
  
  const nodeExecutable = process.execPath;
  
  const possibleMains = [
    join(FOUNDRY_TEST_DIR, 'resources', 'app', 'main.mjs'),
    join(FOUNDRY_TEST_DIR, 'resources', 'app', 'main.js'),
    join(FOUNDRY_TEST_DIR, 'main.mjs'),
    join(FOUNDRY_TEST_DIR, 'main.js'),
  ];
  
  let foundryMain = null;
  for (const p of possibleMains) {
    if (existsSync(p)) {
      foundryMain = p;
      break;
    }
  }
  
  if (!foundryMain) {
    console.error('[setup] ERROR: Could not find Foundry main script');
    console.error('[setup] Searched:', possibleMains);
    process.exit(1);
  }
  
  // Foundry v13 requires explicit --dataPath argument
  const foundryArgs = [
    foundryMain,
    `--dataPath=${FOUNDRY_DATA_DIR}`,
    `--port=${env.FOUNDRY_PORT || 30000}`,
  ];
  
  // Debug: Verify paths exist before launch
  console.log(`[setup] Verifying paths before launch:`);
  console.log(`[setup]   FOUNDRY_DATA_DIR: ${FOUNDRY_DATA_DIR}`);
  console.log(`[setup]   Exists: ${existsSync(FOUNDRY_DATA_DIR)}`);
  console.log(`[setup]   Parent exists: ${existsSync(join(FOUNDRY_DATA_DIR, '..'))}`);
  console.log(`[setup]   Modules dir: ${existsSync(FOUNDRY_MODULES_DIR)}`);
  console.log(`[setup]   Worlds dir: ${existsSync(FOUNDRY_WORLDS_DIR)}`);
  console.log(`[setup] Launching: node ${foundryArgs.join(' ')}`);
  
  // Determine real HOME path (workaround for VSCode snap virtualizing $HOME)
  // VSCode snap doesn't set SNAP env var, but does virtualize HOME to /home/user/snap/code/XXX
  const isSnapVirtualized = process.env.HOME?.includes('/snap/');
  const realHome = isSnapVirtualized ? '/home/' + process.env.USER : process.env.HOME;
  console.log(`[setup] Using HOME: ${realHome} (original: ${process.env.HOME}, snap virtualized: ${isSnapVirtualized})`);
  
  const foundryProcess = spawn(nodeExecutable, foundryArgs, {
    cwd: FOUNDRY_TEST_DIR,
    env: {
      ...process.env,
      HOME: realHome,  // Override snap's virtualized HOME
      FOUNDRY_VTT_DATA_PATH: FOUNDRY_DATA_DIR,
    },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  
  foundryProcess.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    // Always log data path related messages
    if (msg.includes('data') || msg.includes('Data') || msg.includes('path') || msg.includes('Path')) {
      console.log(`[foundry] ${msg}`);
    }
    if (env.DEBUG_FOUNDRY === 'true') {
      console.log(`[foundry] ${msg}`);
    }
  });
  
  foundryProcess.stderr.on('data', (data) => {
    console.error(`[foundry:err] ${data.toString().trim()}`);
  });
  
  foundryProcess.on('error', (err) => {
    console.error('[setup] Failed to start Foundry:', err);
    process.exit(1);
  });
  
  foundryProcess.unref();
  
  console.log(`[setup] Foundry server PID: ${foundryProcess.pid}`);
  return foundryProcess.pid;
}

/**
 * Wait for Foundry to be ready
 */
async function waitForFoundry(env, maxWaitMs = 60000) {
  const baseUrl = env.FOUNDRY_URL || `http://localhost:${env.FOUNDRY_PORT || 30000}`;
  const startTime = Date.now();
  
  console.log(`[setup] Waiting for Foundry at ${baseUrl}...`);
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch(baseUrl, { method: 'GET' });
      if (response.ok || response.status === 401 || response.status === 403) {
        console.log('[setup] Foundry is ready!');
        return true;
      }
    } catch {
      // Server not ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.error('[setup] ERROR: Foundry failed to start within timeout');
  return false;
}

/**
 * Use Playwright to install a game system via Foundry's UI
 * Updated for Foundry v13 UI structure
 */
async function installSystemViaUI(page, systemId, adminKey, baseUrl, licenseKey) {
  console.log(`[setup] Installing system via UI: ${systemId}`);
  
  // Navigate to setup
  await page.goto(`${baseUrl}/setup`);
  await page.waitForLoadState('networkidle');
  
  // Handle license page if this is first run
  if (page.url().includes('/license')) {
    console.log(`[setup] License page detected, checking page type...`);
    
    // Debug: Dump form elements on page
    const forms = await page.locator('form').count();
    console.log(`[setup] Found ${forms} forms on page`);
    const inputs = await page.locator('input').all();
    for (const input of inputs) {
      const name = await input.getAttribute('name');
      const type = await input.getAttribute('type');
      console.log(`[setup]   Input: name="${name}" type="${type}"`);
    }
    const buttons = await page.locator('button').all();
    for (const btn of buttons) {
      const text = await btn.textContent();
      const name = await btn.getAttribute('name');
      console.log(`[setup]   Button: "${text?.trim()}" name="${name}"`);
    }
    
    // Check if this is license KEY entry (input[name="licenseKey"])
    const licenseInput = page.locator('input[name="licenseKey"], #key');
    if (await licenseInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`[setup] Entering license key...`);
      await licenseInput.fill(licenseKey);
      await page.locator('button[value="enterKey"], button:has-text("Submit Key")').first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
    }
    
    // Check for EULA acceptance (checkbox with name="agree")
    const eulaCheckbox = page.locator('input[name="agree"]');
    if (await eulaCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log(`[setup] Accepting EULA...`);
      await eulaCheckbox.check();
      // Click the "Agree" button
      await page.locator('button[name="accept"], button[data-action="accept"]').first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }
  }
  
  // Navigate to setup again after license handling
  await page.goto(`${baseUrl}/setup`);
  await page.waitForLoadState('networkidle');
  
  // Authenticate if needed (Foundry v13 uses name="adminPassword")
  const adminKeyInput = page.locator('input[name="adminPassword"], input[name="adminKey"], #admin-password, #key');
  if (await adminKeyInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log(`[setup] Authenticating with admin key...`);
    await adminKeyInput.fill(adminKey);
    await page.locator('button[type="submit"]').click();
    await page.waitForLoadState('networkidle');
    // Wait a bit more for the setup page to load after auth
    await page.waitForTimeout(3000);
  }
  
  // Wait for setup page content to load (Foundry v13 has specific sections)
  console.log(`[setup] Waiting for setup page content...`);
  await page.waitForSelector('section[data-tab], nav.tabs, .package-list', { timeout: 15000 }).catch(() => {
    console.log(`[setup] Warning: Could not find expected setup page elements`);
  });
  
  // Handle consent/telemetry dialog if present (appears on first run)
  // This dialog asks about analytics/telemetry and blocks interaction with the setup page
  const consentDialog = page.locator('dialog.application.dialog:visible, .dialog:visible');
  if (await consentDialog.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log(`[setup] Found consent/telemetry dialog, dismissing...`);
    // Try to find and click "No" or dismiss button to decline telemetry
    const declineButton = page.locator('dialog button:has-text("No"), dialog button:has-text("Decline"), dialog button.default').first();
    if (await declineButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await declineButton.click();
      console.log(`[setup] Declined telemetry consent`);
    } else {
      // If no decline button, try to close the dialog with any available button
      const anyButton = page.locator('dialog button, .dialog button').first();
      if (await anyButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await anyButton.click();
        console.log(`[setup] Dismissed consent dialog`);
      }
    }
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  }
  
  // Handle "Getting Started" tour overlay (appears on first run in Foundry v13)
  // This overlay blocks all clicks until the tour is dismissed
  const tourOverlay = page.locator('.tour-overlay');
  if (await tourOverlay.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log(`[setup] Found tour overlay, dismissing tour...`);
    // The tour has an "Exit Tour" or "Skip" button, or we can press Escape
    const exitTourBtn = page.locator('button:has-text("Exit Tour"), button:has-text("Skip"), button.tour-skip, .tour-center-step button').first();
    if (await exitTourBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await exitTourBtn.click({ force: true });
      console.log(`[setup] Clicked exit tour button`);
    } else {
      // Fallback: press Escape to dismiss the tour
      await page.keyboard.press('Escape');
      console.log(`[setup] Pressed Escape to dismiss tour`);
    }
    await page.waitForTimeout(1000);
  }
  
  // Check if tour overlay is still present and try harder to dismiss
  if (await tourOverlay.isVisible({ timeout: 500 }).catch(() => false)) {
    console.log(`[setup] Tour overlay still present, trying harder to dismiss...`);
    // Some tours require clicking multiple times or using specific selectors
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Try clicking the overlay itself (some tours dismiss on overlay click)
    if (await tourOverlay.isVisible({ timeout: 500 }).catch(() => false)) {
      await tourOverlay.click({ force: true, position: { x: 10, y: 10 } }).catch(() => {});
      await page.waitForTimeout(500);
    }
  }
  
  // Debug: Take screenshot to see current state
  await page.screenshot({ path: '/tmp/foundry-setup-debug.png', fullPage: true });
  console.log(`[setup] Debug screenshot saved to /tmp/foundry-setup-debug.png`);
  
  // Debug: Log page URL and title
  console.log(`[setup] Current URL: ${page.url()}`);
  console.log(`[setup] Page title: ${await page.title()}`);
  
  // Debug: Log all visible tabs
  const allTabs = await page.locator('[data-tab]').all();
  console.log(`[setup] Found ${allTabs.length} elements with data-tab`);
  for (const tab of allTabs.slice(0, 5)) {
    const tabId = await tab.getAttribute('data-tab');
    const text = await tab.textContent();
    console.log(`[setup]   Tab: ${tabId} - "${text?.trim()}"`);
  }
  
  // Click Game Systems tab (Foundry v13 uses h2.divider with data-tab)
  const systemsTab = page.locator('[data-action="tab"][data-tab="systems"], [data-tab="systems"], nav a[data-tab="systems"]').first();
  await systemsTab.click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000); // Wait for tab content to load
  
  // Take screenshot after clicking systems tab
  await page.screenshot({ path: '/tmp/foundry-systems-tab.png', fullPage: true });
  console.log(`[setup] Screenshot after clicking systems tab: /tmp/foundry-systems-tab.png`);
  
  // Debug: Log available buttons in systems section
  const systemsSection = page.locator('section[data-tab="systems"], .systems-section, main');
  const allButtons = await page.locator('button').all();
  console.log(`[setup] Found ${allButtons.length} buttons on page:`);
  for (const btn of allButtons.slice(0, 10)) {
    const text = await btn.textContent();
    const dataAction = await btn.getAttribute('data-action');
    const isVisible = await btn.isVisible();
    console.log(`[setup]   Button: "${text?.trim().slice(0, 40)}" action="${dataAction}" visible=${isVisible}`);
  }
  
  // Check if already installed
  const installedSystem = page.locator(`[data-package-id="${systemId}"]`);
  if (await installedSystem.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log(`[setup] System ${systemId} already installed`);
    return true;
  }
  
  // Click Install System - try multiple selectors for Foundry v13
  // The button might be in the header of the systems section
  const installBtnSelectors = [
    'section[data-tab="systems"] button[data-action="installPackage"]',
    'section[data-tab="systems"] button:has-text("Install System")',
    'button[data-action="installPackage"]:visible',
    '.systems button[data-action="installPackage"]',
    'header button[data-action="installPackage"]',
    'h2[data-tab="systems"] ~ * button[data-action="installPackage"]'
  ];
  
  let installBtn = null;
  for (const selector of installBtnSelectors) {
    const btn = page.locator(selector).first();
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log(`[setup] Found install button with selector: ${selector}`);
      installBtn = btn;
      break;
    }
  }
  
  if (!installBtn) {
    console.log(`[setup] Could not find visible Install System button, trying fallback...`);
    // Fallback: just try clicking the first data-action="installPackage" and force it
    installBtn = page.locator('button[data-action="installPackage"]').first();
  }
  
  await installBtn.click({ force: true });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // Wait for dialog to appear
  
  // Take screenshot to see what dialog appeared
  await page.screenshot({ path: '/tmp/foundry-install-dialog.png', fullPage: true });
  console.log(`[setup] Screenshot after clicking Install: /tmp/foundry-install-dialog.png`);
  
  // Debug: Log all visible dialogs/windows
  const allDialogs = await page.locator('dialog, .window-app, .app, .application').all();
  console.log(`[setup] Found ${allDialogs.length} dialog/app elements`);
  for (const dlg of allDialogs.slice(0, 5)) {
    const classes = await dlg.getAttribute('class');
    const id = await dlg.getAttribute('id');
    const isVisible = await dlg.isVisible();
    console.log(`[setup]   Dialog: id="${id}" class="${classes?.slice(0, 80)}" visible=${isVisible}`);
  }
  
  // Wait for package browser dialog - try multiple selectors for Foundry v13
  // Note: #install-package is the actual package browser with the package list
  const dialogSelectors = [
    '#install-package',  // The actual package browser with packages
    '.application.category-browser',
    '.category-browser',
    '.install-package',
    '.window-app.install-package',
    '.app.install-package', 
    'dialog.install-package',
    '.window-app:has(input[type="search"])',
    '[id*="install"]'
  ];
  
  let dialog = null;
  for (const selector of dialogSelectors) {
    const dlg = page.locator(selector).first();
    if (await dlg.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`[setup] Found dialog with selector: ${selector}`);
      dialog = dlg;
      break;
    }
  }
  
  if (!dialog) {
    console.log(`[setup] No dialog found with predefined selectors, looking for any visible dialog...`);
    // Fallback: find any visible dialog/window-app
    dialog = page.locator('.window-app:visible, dialog:visible, .application:visible').first();
  }
  
  await dialog.waitFor({ timeout: 15000 });
  
  // Debug: Dump ALL .application elements to find where the package list is
  const allApps = await page.locator('.application').all();
  console.log(`[setup] Found ${allApps.length} .application elements:`);
  for (const app of allApps) {
    const id = await app.getAttribute('id');
    const classes = await app.getAttribute('class');
    const isVisible = await app.isVisible();
    const inputCount = await app.locator('input').count();
    const packageCount = await app.locator('[data-package-id]').count();
    console.log(`[setup]   App: id="${id}" visible=${isVisible} inputs=${inputCount} packages=${packageCount}`);
  }
  
  // Debug: Log dialog contents
  const dialogInputs = await dialog.locator('input').all();
  console.log(`[setup] Found ${dialogInputs.length} inputs in dialog:`);
  for (const input of dialogInputs.slice(0, 5)) {
    const type = await input.getAttribute('type');
    const name = await input.getAttribute('name');
    const placeholder = await input.getAttribute('placeholder');
    const isVisible = await input.isVisible();
    console.log(`[setup]   Input: type="${type}" name="${name}" placeholder="${placeholder}" visible=${isVisible}`);
  }
  
  // Debug: Dump ALL inputs on the page to find the search input
  const allPageInputs = await page.locator('input').all();
  console.log(`[setup] Found ${allPageInputs.length} inputs on entire page:`);
  for (const input of allPageInputs) {
    const id = await input.getAttribute('id');
    const type = await input.getAttribute('type');
    const placeholder = await input.getAttribute('placeholder');
    const isVisible = await input.isVisible();
    console.log(`[setup]   Input: id="${id}" type="${type}" placeholder="${placeholder}" visible=${isVisible}`);
  }
  
  // Debug: Get the HTML structure of the dialog
  const dialogHtml = await dialog.innerHTML();
  console.log(`[setup] Dialog HTML (first 500 chars): ${dialogHtml.substring(0, 500)}`);
  
  // Take screenshot after dialog opened
  await page.screenshot({ path: '/tmp/foundry-package-browser.png', fullPage: true });
  console.log(`[setup] Screenshot of package browser: /tmp/foundry-package-browser.png`);
  
  // Search for system - use the page-level search input specific to package browser
  // The search input is NOT inside the dialog, it's rendered in a header area
  const searchInput = page.locator('#install-package-search-filter, input#install-package-search-filter');
  const manifestInput = page.locator('#install-package-manifestUrl, input[name="manifestURL"]');
  
  // Try the manifest URL approach first - it's more reliable than searching virtualized lists
  // Standard manifest URLs for common systems
  const manifestUrls = {
    'dnd5e': 'https://raw.githubusercontent.com/foundryvtt/dnd5e/master/system.json',
    'pf2e': 'https://raw.githubusercontent.com/foundryvtt/pf2e/master/system.json',
    'swade': 'https://gitlab.com/api/v4/projects/22141195/packages/generic/swade/latest/system.json',
    'daggerheart': 'https://raw.githubusercontent.com/AshenMalachite/daggerheart-foundry-vtt/main/system.json',
    'shadowdark': 'https://github.com/Muttley/foundryvtt-shadowdark/releases/latest/download/system.json'
  };
  
  const manifestUrl = manifestUrls[systemId];
  
  if (manifestUrl && await manifestInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log(`[setup] Using manifest URL method for ${systemId}`);
    console.log(`[setup] Manifest URL: ${manifestUrl}`);
    
    // Clear and fill the manifest URL
    await manifestInput.clear();
    await manifestInput.fill(manifestUrl);
    await page.waitForTimeout(500);
    
    // Take screenshot after filling manifest URL
    await page.screenshot({ path: `/tmp/foundry-manifest-filled-${systemId}.png`, fullPage: true });
    console.log(`[setup] Screenshot after filling manifest URL: /tmp/foundry-manifest-filled-${systemId}.png`);
    
    // Find and click the Install button for manifest URL
    // In Foundry v13, the Install button should be near the manifest input
    // Look for buttons specifically in the form/footer area
    const manifestInstallBtnSelectors = [
      '#install-package footer button:has-text("Install")',
      '#install-package button[type="submit"]',
      '.category-browser footer button:has-text("Install")',
      '#install-package .form-footer button:has-text("Install")',
      '#install-package button.install-package',
      'button.install:visible',
      '#install-package button:has-text("Install"):visible'
    ];
    
    let manifestInstallBtn = null;
    for (const selector of manifestInstallBtnSelectors) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        console.log(`[setup] Found manifest Install button with selector: ${selector}`);
        manifestInstallBtn = btn;
        break;
      }
    }
    
    if (manifestInstallBtn) {
      console.log(`[setup] Clicking manifest Install button...`);
      await manifestInstallBtn.click();
    } else {
      // Try pressing Enter in the manifest input as fallback
      console.log(`[setup] No manifest Install button found, pressing Enter to submit...`);
      await manifestInput.press('Enter');
    }
    
    // Wait for installation to start
    await page.waitForTimeout(3000);
    
    // Take screenshot to see installation progress
    await page.screenshot({ path: `/tmp/foundry-installing-${systemId}.png`, fullPage: true });
    console.log(`[setup] Screenshot during installation: /tmp/foundry-installing-${systemId}.png`);
  } else {
    // Fallback: Search method
    console.log(`[setup] Manifest URL not available, using search method for: ${systemId}`);
    await searchInput.waitFor({ state: 'visible', timeout: 10000 });
    await searchInput.clear();
    await searchInput.fill(systemId);
    
    // The search filter is reactive - changes on keyup. Force a keyup event
    await searchInput.press('Space');
    await searchInput.press('Backspace');
    
    // Wait for network to settle and for the package list to update
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Wait for search results to filter
    
    // Take a screenshot of the search results
    await page.screenshot({ path: `/tmp/foundry-search-${systemId}.png`, fullPage: true });
    console.log(`[setup] Screenshot of search results: /tmp/foundry-search-${systemId}.png`);
    
    // Find and install the system
    // The package browser uses a virtualized list - elements exist in DOM but may not be rendered
    // The search should filter to show only matching packages
    const packageArea = page.locator('#install-package, .category-browser');
    
    // Find the scrollable container for the package list
    const scrollContainer = packageArea.locator('.window-content, .scrollable, [class*="scroll"]').first();
    
    // Try to find the target package - it should be near the top after searching
    let systemEntry = packageArea.locator(`[data-package-id="${systemId}"]`).first();
    let found = false;
    
    // Strategy 1: Check if already visible after search filtering
    if (await systemEntry.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`[setup] Found ${systemId} visible after search`);
      found = true;
    }
    
    // Strategy 2: Scroll the container to find the element
    if (!found) {
      console.log(`[setup] Target not immediately visible, scrolling to find it...`);
      
      // Get the scroll container's handle for scrolling
      const scrollHandle = await scrollContainer.elementHandle().catch(() => null);
      if (scrollHandle) {
        // Scroll in increments and look for the target
        for (let scrollPos = 0; scrollPos < 10000; scrollPos += 300) {
          await scrollHandle.evaluate((el, pos) => {
            el.scrollTop = pos;
          }, scrollPos);
          await page.waitForTimeout(200); // Let virtual list render
          
          // Check if target is now visible
          if (await systemEntry.isVisible({ timeout: 100 }).catch(() => false)) {
            console.log(`[setup] Found ${systemId} after scrolling to ${scrollPos}px`);
            found = true;
            break;
          }
        }
      }
    }
    
    // Strategy 3: Try by text content if data-package-id not found
    if (!found) {
      console.log(`[setup] Trying to find by text content...`);
      const altEntry = packageArea.locator(`li:has-text("${systemId}"), .package:has-text("${systemId}"), [class*="package"]:has-text("${systemId}")`).first();
      if (await altEntry.isVisible({ timeout: 3000 }).catch(() => false)) {
        systemEntry = altEntry;
        found = true;
        console.log(`[setup] Found ${systemId} by text content`);
      }
    }
    
    // Strategy 4: Use keyboard to navigate the list
    if (!found) {
      console.log(`[setup] Trying keyboard navigation...`);
      // Focus the search input and tab to the list
      await searchInput.focus();
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
      
      // Press Down to highlight first result
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(200);
        
        // Check if we found our target
        const focusedPackage = packageArea.locator('[data-package-id]:focus, [data-package-id].focused, [data-package-id].selected').first();
        const pkgId = await focusedPackage.getAttribute('data-package-id').catch(() => null);
        if (pkgId === systemId) {
          systemEntry = focusedPackage;
          found = true;
          console.log(`[setup] Found ${systemId} via keyboard navigation`);
          break;
        }
      }
    }
    
    if (!found) {
      console.error(`[setup] System ${systemId} not found in package browser after all strategies`);
      await page.screenshot({ path: `/tmp/foundry-notfound-${systemId}.png`, fullPage: true });
      await page.keyboard.press('Escape');
      return false;
    }
    
    // Click the install button
    const installButton = systemEntry.locator('button:has-text("Install"), button[data-action="installPackage"]').first();
    await installButton.scrollIntoViewIfNeeded();
    await installButton.click({ timeout: 5000 });
  }
  
  // Wait for installation (can take a while for large systems like pf2e)
  console.log(`[setup] Waiting for ${systemId} to install...`);
  
  // Wait for dialog to close or progress to complete
  await page.waitForTimeout(5000);
  
  // Check if system is now installed (poll until ready)
  for (let i = 0; i < 30; i++) { // Wait up to 1 minute (reduced from 2)
    await page.goto(`${baseUrl}/setup`);
    await page.waitForLoadState('networkidle');
    
    // Authenticate if needed (session might have expired)
    if (await adminKeyInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await adminKeyInput.fill(adminKey);
      await page.locator('button[type="submit"]').click();
      await page.waitForLoadState('networkidle');
    }
    
    const sysTab = page.locator('[data-action="tab"][data-tab="systems"], [data-tab="systems"]').first();
    await sysTab.click();
    await page.waitForLoadState('networkidle');
    
    const installed = page.locator(`[data-package-id="${systemId}"]`);
    if (await installed.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`[setup] System ${systemId} installed successfully`);
      return true;
    }
    
    // Log progress every 5 iterations
    if (i % 5 === 0) {
      console.log(`[setup] Polling for ${systemId} installation (attempt ${i + 1}/30)...`);
      // Check what systems are visible in the list
      const visibleSystems = await page.locator('[data-package-id]').all();
      const systemIds = await Promise.all(visibleSystems.slice(0, 5).map(s => s.getAttribute('data-package-id')));
      console.log(`[setup]   Visible systems: ${systemIds.join(', ')}`);
    }
    
    await page.waitForTimeout(2000);
  }
  
  console.error(`[setup] System ${systemId} installation timed out`);
  return false;
}

/**
 * Use Playwright to create a world via Foundry's UI
 * Updated for Foundry v13 UI structure
 */
async function createWorldViaUI(page, worldId, worldTitle, systemId, adminKey, baseUrl) {
  console.log(`[setup] Creating world via UI: ${worldId} (${systemId})`);
  
  // Navigate to setup
  await page.goto(`${baseUrl}/setup`);
  await page.waitForLoadState('networkidle');
  
  // Authenticate if needed
  const adminKeyInput = page.locator('input[name="adminKey"], input[name="adminPassword"]');
  if (await adminKeyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await adminKeyInput.fill(adminKey);
    await page.locator('button[type="submit"]').click();
    await page.waitForLoadState('networkidle');
  }
  
  // Click Worlds tab (Foundry v13 uses data-action="tab")
  const worldsTab = page.locator('[data-action="tab"][data-tab="worlds"], [data-tab="worlds"]').first();
  await worldsTab.click();
  await page.waitForLoadState('networkidle');
  
  // Always create world - we start from a clean Foundry install each time
  // Click Create World (Foundry v13 uses data-action="worldCreate")
  const createBtn = page.locator('button[data-action="worldCreate"], button:has-text("Create World")').first();
  await createBtn.click();
  await page.waitForLoadState('networkidle');
  
  // Wait for dialog
  const dialog = page.locator('.window-app.world-config, .app.world-config, form#world-config').first();
  await dialog.waitFor({ timeout: 10000 });
  
  // Take screenshot of the world creation dialog
  await page.screenshot({ path: '/tmp/foundry-world-create-dialog.png', fullPage: true });
  console.log(`[setup] World creation dialog screenshot: /tmp/foundry-world-create-dialog.png`);
  
  // Fill title
  const titleInput = page.locator('input[name="title"]');
  await titleInput.fill(worldTitle);
  
  // Fill world ID (folder name) - this is REQUIRED in Foundry v13
  const idInput = page.locator('input[name="id"]');
  if (await idInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await idInput.fill(worldId);
    console.log(`[setup] Filled world ID: ${worldId}`);
  } else {
    console.log(`[setup] WARNING: World ID input not visible`);
  }
  
  // Select system
  const systemSelect = page.locator('select[name="system"]');
  await systemSelect.selectOption(systemId);
  
  // Take screenshot after filling form
  await page.screenshot({ path: '/tmp/foundry-world-form-filled.png', fullPage: true });
  console.log(`[setup] World form filled screenshot: /tmp/foundry-world-form-filled.png`);
  
  // Debug: Log all buttons in the dialog
  const dialogButtons = await page.locator('.window-app button, .app button, form#world-config button').all();
  console.log(`[setup] Found ${dialogButtons.length} buttons in dialog:`);
  for (const btn of dialogButtons) {
    const text = await btn.textContent().catch(() => '');
    const type = await btn.getAttribute('type').catch(() => null);
    const action = await btn.getAttribute('data-action').catch(() => null);
    const visible = await btn.isVisible().catch(() => false);
    console.log(`[setup]   Button: "${text.trim()}" type=${type} action=${action} visible=${visible}`);
  }
  
  // Submit - look for button with type=submit OR the footer submit button
  const submitBtn = page.locator('button[type="submit"], .form-footer button[type="submit"], .window-content button[type="submit"]').first();
  const submitVisible = await submitBtn.isVisible().catch(() => false);
  const submitText = await submitBtn.textContent().catch(() => '');
  console.log(`[setup] Submit button: "${submitText.trim()}" visible=${submitVisible}`);
  
  // Capture console errors during submission
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  
  // Try submitting with evaluation for better error capture
  try {
    await submitBtn.click();
    console.log(`[setup] Clicked submit button`);
    
    // Wait for response - try to detect world creation
    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle');
    
    // Check if dialog is still open (submit failed)
    const dialogStillOpen = await page.locator('.window-app.world-config, .app.world-config').isVisible({ timeout: 1000 }).catch(() => false);
    console.log(`[setup] Dialog still open after submit: ${dialogStillOpen}`);
    
    if (dialogStillOpen) {
      // Look for validation errors in the dialog
      const formError = await page.locator('.form-group.error, .error-message, p.notes.error, .notification.error').first().textContent().catch(() => null);
      if (formError) {
        console.log(`[setup] Form validation error: ${formError}`);
      }
    }
    
    if (consoleErrors.length > 0) {
      console.log(`[setup] Console errors during submit: ${consoleErrors.join('; ')}`);
    }
  } catch (e) {
    console.log(`[setup] Error during world submission: ${e.message}`);
  }
  
  // Wait for potential error dialogs
  await page.waitForTimeout(1000);
  
  // Check for error notifications
  const errorNotice = page.locator('.notification.error, .notifications .error');
  if (await errorNotice.isVisible({ timeout: 1000 }).catch(() => false)) {
    const errorText = await errorNotice.textContent().catch(() => '');
    console.log(`[setup] ERROR: World creation failed with: ${errorText}`);
  }
  
  await page.waitForTimeout(2000);
  await page.waitForLoadState('networkidle');
  
  // Take screenshot after submit
  await page.screenshot({ path: '/tmp/foundry-world-after-submit.png', fullPage: true });
  console.log(`[setup] World after submit screenshot: /tmp/foundry-world-after-submit.png`);
  
  // Check if world folder was created
  const worldFolderPath = join(FOUNDRY_WORLDS_DIR, worldId);
  const worldJsonPath = join(worldFolderPath, 'world.json');
  console.log(`[setup] Checking for world folder at: ${worldFolderPath}`);
  console.log(`[setup] World folder exists: ${existsSync(worldFolderPath)}`);
  console.log(`[setup] World JSON exists: ${existsSync(worldJsonPath)}`);
  
  // List worlds directory
  const worldsDir = FOUNDRY_WORLDS_DIR;
  if (existsSync(worldsDir)) {
    const contents = readdirSync(worldsDir);
    console.log(`[setup] Worlds directory contents: ${JSON.stringify(contents)}`);
  }

  console.log(`[setup] World ${worldId} created`);
  return worldId;
}

/**
 * Enable the Simulacrum module for a world
 * 
 * In Foundry v13, module activation requires TWO things:
 * 1. Add module to world.json relationships.requires (for dependency declaration)
 * 2. Write to settings.db with core.modules setting (for actual activation)
 */
function enableModuleForWorld(worldId) {
  console.log(`[setup] Enabling Simulacrum module for world: ${worldId}`);
  
  const worldFolderPath = join(FOUNDRY_WORLDS_DIR, worldId);
  const worldJsonPath = join(worldFolderPath, 'world.json');
  const settingsDbPath = join(worldFolderPath, 'data', 'settings.db');
  
  if (!existsSync(worldJsonPath)) {
    console.error(`[setup] WARNING: World JSON not found at ${worldJsonPath}`);
    return false;
  }
  
  try {
    // Step 1: Update world.json with module dependency
    const worldJson = JSON.parse(readFileSync(worldJsonPath, 'utf-8'));
    
    // Foundry v13 uses 'modules' array or 'relationships.modules'
    // For v13, we add to relationships.requires array
    if (!worldJson.relationships) {
      worldJson.relationships = {};
    }
    if (!worldJson.relationships.requires) {
      worldJson.relationships.requires = [];
    }
    
    // Check if already added
    const hasSimulacrum = worldJson.relationships.requires.some(
      r => r.id === 'simulacrum'
    );
    
    if (!hasSimulacrum) {
      worldJson.relationships.requires.push({
        id: 'simulacrum',
        type: 'module',
        manifest: null,
        compatibility: {}
      });
    }
    
    writeFileSync(worldJsonPath, JSON.stringify(worldJson, null, 2));
    console.log(`[setup] World.json updated with Simulacrum dependency`);
    
    // NOTE: We do NOT write to settings.db here because Foundry's bundled nedb
    // is incompatible with Node 17+ (uses deprecated util.isDate() which was removed).
    // Instead, the module will be enabled via UI in the test fixture after world launch.
    // The world.json dependency ensures Foundry knows about the module relationship,
    // and the test fixture will handle actual activation via Module Management dialog.
    
    console.log(`[setup] Simulacrum module dependency configured for world: ${worldId}`);
    console.log(`[setup] NOTE: Module will be activated via UI during test fixture setup`);
    return true;
  } catch (e) {
    console.error(`[setup] Error enabling module for world: ${e.message}`);
    console.error(e.stack);
    return false;
  }
}

/**
 * Main setup function
 */
export default async function globalSetup() {
  console.log('='.repeat(60));
  console.log('[setup] Simulacrum E2E Test Setup');
  console.log('='.repeat(60));
  
  // Load environment
  const env = loadEnv();
  const systemIds = parseSystemIds(env);
  const adminKey = env.FOUNDRY_ADMIN_KEY || 'test-admin-key';
  const licenseKey = env.FOUNDRY_LICENSE_KEY || '';
  const baseUrl = env.FOUNDRY_URL || `http://localhost:${env.FOUNDRY_PORT || 30000}`;
  // Use timestamp-based world ID to avoid conflicts with cached Foundry state
  const timestamp = Date.now();
  const baseWorldId = env.TEST_WORLD_ID || `test-world-${timestamp}`;
  const baseWorldTitle = env.TEST_WORLD_TITLE || 'Simulacrum Test World';
  
  console.log(`[setup] Systems to install: ${systemIds.join(', ')}`);
  console.log(`[setup] World ID: ${baseWorldId}`);  
  // Find and extract Foundry
  const foundryZip = findFoundryZip();
  unzipFoundry(foundryZip);
  
  // Configure Foundry
  configureFoundry(env);
  
  // Package and deploy module
  packageModule();
  deployModule();
  
  // Launch Foundry server
  const pid = launchFoundry(env);
  
  // Wait for server to be ready
  const ready = await waitForFoundry(env);
  if (!ready) {
    console.error('[setup] Aborting tests - Foundry not available');
    process.exit(1);
  }
  
  // Use Playwright to install systems and create worlds via UI
  console.log('[setup] Using Playwright to install systems via Foundry UI...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },  // Foundry requires minimum 1366x768
  });
  const page = await context.newPage();
  
  const worlds = {};
  
  try {
    // Install each system via UI
    for (const systemId of systemIds) {
      const success = await installSystemViaUI(page, systemId, adminKey, baseUrl, licenseKey);
      if (!success) {
        console.error(`[setup] Failed to install system: ${systemId}`);
        // Continue anyway - test might still work if system was pre-installed
      }
    }
    
    // Create worlds for each system via UI
    for (const systemId of systemIds) {
      const suffix = systemIds.length > 1 ? systemId : '';
      const worldId = suffix ? `${baseWorldId}-${suffix}` : baseWorldId;
      const worldTitle = suffix ? `${baseWorldTitle} (${systemId})` : baseWorldTitle;
      
      await createWorldViaUI(page, worldId, worldTitle, systemId, adminKey, baseUrl);
      worlds[systemId] = worldId;
    }
  } finally {
    await browser.close();
  }
  
  // Enable Simulacrum module for each world AFTER browser closes
  // (world.json is written by Foundry after UI actions complete)
  for (const worldId of Object.values(worlds)) {
    enableModuleForWorld(worldId);
  }
  
  // Save state for teardown and tests
  const state = {
    pid,
    foundryDir: FOUNDRY_TEST_DIR,
    systemIds,
    worlds,
    env: {
      FOUNDRY_URL: baseUrl,
      FOUNDRY_ADMIN_KEY: adminKey,
    }
  };
  
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  
  // Set environment variables for tests
  process.env.FOUNDRY_URL = baseUrl;
  process.env.FOUNDRY_ADMIN_KEY = adminKey;
  process.env.TEST_SYSTEM_IDS = systemIds.join(',');
  process.env.TEST_WORLDS_MAP = JSON.stringify(worlds);
  
  console.log('='.repeat(60));
  console.log('[setup] Setup complete!');
  console.log(`[setup] Foundry URL: ${baseUrl}`);
  console.log(`[setup] Systems: ${systemIds.join(', ')}`);
  console.log(`[setup] Worlds: ${JSON.stringify(worlds)}`);
  console.log('='.repeat(60));
}
