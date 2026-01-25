/**
 * Foundry VTT Playwright Test Helpers
 * 
 * Provides utilities for interacting with Foundry VTT in E2E tests:
 * - Authentication/Login
 * - System installation via UI
 * - World creation via UI
 * - Module configuration
 * - Common UI interactions
 */

import { expect } from '@playwright/test';
import { 
  pollUntil, 
  pollForElement, 
  pollUntilGone, 
  waitForUiSettle 
} from './poll-utils.js';

/**
 * Remove any tour overlays or tooltips that might intercept clicks
 * Based on Foundry v13 Tour class implementation:
 * - .tour-overlay = blocks input
 * - .tour-fadeout = fade element
 * - Tour.activeTour.exit() = proper API to exit tour
 * @param {import('@playwright/test').Page} page
 */
async function dismissTourOverlay(page) {
  await page.evaluate(() => {
    // Remove tour overlay elements directly (v13 class names)
    document.querySelectorAll('.tour-overlay, .tour-fadeout').forEach(el => el.remove());
    
    // Use Foundry v13 Tour API to exit any active tour
    try {
      // @ts-ignore - Foundry v13 Tour class
      if (typeof Tour !== 'undefined' && Tour.activeTour && typeof Tour.activeTour.exit === 'function') {
        // @ts-ignore
        Tour.activeTour.exit();
      }
    } catch (e) { /* ignore */ }
    
    // Also remove any tooltip that might be showing
    try {
      // @ts-ignore
      if (typeof game !== 'undefined' && game.tooltip) {
        // @ts-ignore
        game.tooltip.deactivate();
      }
    } catch (e) { /* ignore */ }
  });
}

/**
 * Login to Foundry VTT setup screen
 * @param {import('@playwright/test').Page} page
 * @param {string} adminKey - The admin password/key
 * @param {string} [baseUrl] - Optional base URL (e.g., 'http://localhost:30001')
 */
export async function loginAsAdmin(page, adminKey, baseUrl = '') {
  const setupUrl = baseUrl ? `${baseUrl}/setup` : '/setup';
  await page.goto(setupUrl);
  
  // Wait for the page to load
  await page.waitForLoadState('networkidle');
  
  // Check current URL - Foundry might redirect to /join if a world is active
  let currentUrl = page.url();
  console.log(`[helper] loginAsAdmin: URL is ${currentUrl}`);
  
  // If we're on the join page, the world is already running
  // Just stay here - launchWorld will detect this and skip the launch step
  if (currentUrl.includes('/join')) {
    console.log('[helper] loginAsAdmin: World is running (on /join). Will let launchWorld handle this.');
    // We're already authenticated if we can see the join page
    return;
  }
  
  // Check if we need to authenticate (setup admin password form)
  const adminKeyInput = page.locator('input[name="adminKey"], input[name="adminPassword"], #admin-password');
  
  if (await adminKeyInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await adminKeyInput.fill(adminKey);
    // Click the first visible submit button (should be the login/submit on the admin auth form)
    await page.locator('button[type="submit"]').first().click();
    await page.waitForLoadState('networkidle');
  }
  
  // Should now be on setup/world selection
  await expect(page.locator('body')).toBeVisible();
}

/**
 * Install a game system via Foundry's UI
 * @param {import('@playwright/test').Page} page
 * @param {string} systemId - The system ID to install (e.g., 'dnd5e', 'pf2e')
 * @param {string} [baseUrl] - Optional base URL (e.g., 'http://localhost:30001')
 */
export async function installSystem(page, systemId, baseUrl = '') {
  console.log(`[helper] Installing system via UI: ${systemId}`);
  
  // Navigate to setup page
  const setupUrl = baseUrl ? `${baseUrl}/setup` : '/setup';
  await page.goto(setupUrl);
  await page.waitForLoadState('networkidle');
  
  // Click on Game Systems tab
  const systemsTab = page.locator('nav a[data-tab="systems"], a:has-text("Game Systems")');
  await systemsTab.click();
  await page.waitForLoadState('networkidle');
  
  // Check if system is already installed
  const installedSystem = page.locator(`[data-package-id="${systemId}"]`);
  if (await installedSystem.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log(`[helper] System ${systemId} is already installed`);
    return true;
  }
  
  // Click "Install System" button
  const installButton = page.locator('button:has-text("Install System")');
  await installButton.click();
  
  // Wait for the package browser dialog
  await page.waitForLoadState('networkidle');
  const dialog = page.locator('.app.package-installer, .app.install-package, [id*="package"]');
  await expect(dialog).toBeVisible({ timeout: 10000 });
  
  // Search for the system
  const searchInput = dialog.locator('input[name="search"], input[type="search"], input.filter');
  await searchInput.fill(systemId);
  // Poll for search results to filter
  await pollForElement(page, `[data-package-id="${systemId}"], li:has-text("${systemId}")`, { timeout: 5000 }).catch(() => {});
  
  // Find and click the system in results
  const systemEntry = dialog.locator(`[data-package-id="${systemId}"], li:has-text("${systemId}")`).first();
  
  if (!await systemEntry.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.error(`[helper] System ${systemId} not found in package browser`);
    // Close dialog
    await page.keyboard.press('Escape');
    return false;
  }
  
  // Click the install button for this system
  const installSystemBtn = systemEntry.locator('button:has-text("Install"), button.install');
  await installSystemBtn.click();
  
  // Wait for installation to complete using polling
  console.log(`[helper] Waiting for ${systemId} installation...`);
  
  // Wait for the dialog to close or show success
  // Installation typically closes the dialog or shows a notification
  await page.waitForFunction(
    (sysId) => {
      // Check if system appears in the installed list
      const installed = document.querySelector(`[data-package-id="${sysId}"]`);
      return installed !== null;
    },
    systemId,
    { timeout: 120000 } // 2 minutes for large systems like pf2e
  );
  
  console.log(`[helper] System ${systemId} installed successfully`);
  return true;
}

/**
 * Create a new world via Foundry's UI
 * @param {import('@playwright/test').Page} page
 * @param {string} worldId - The world ID
 * @param {string} worldTitle - The world display title
 * @param {string} systemId - The system ID to use
 * @param {string} [baseUrl] - Optional base URL (e.g., 'http://localhost:30001')
 */
export async function createWorld(page, worldId, worldTitle, systemId, baseUrl = '') {
  console.log(`[helper] Creating world via UI: ${worldId} (${systemId})`);
  
  // Navigate to setup page
  const setupUrl = baseUrl ? `${baseUrl}/setup` : '/setup';
  await page.goto(setupUrl);
  await page.waitForLoadState('networkidle');
  
  // Click on Worlds tab
  const worldsTab = page.locator('nav a[data-tab="worlds"], a:has-text("Game Worlds")');
  await worldsTab.click();
  await page.waitForLoadState('networkidle');
  
  // Check if world already exists
  const existingWorld = page.locator(`[data-package-id="${worldId}"]`);
  if (await existingWorld.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log(`[helper] World ${worldId} already exists`);
    return worldId;
  }
  
  // Click "Create World" button
  const createButton = page.locator('button:has-text("Create World")');
  await createButton.click();
  
  // Wait for the create world dialog
  await page.waitForLoadState('networkidle');
  const dialog = page.locator('.app.world-config, .app.create-world, form#world-config');
  await expect(dialog).toBeVisible({ timeout: 10000 });
  
  // Fill in world details
  const titleInput = dialog.locator('input[name="title"]');
  await titleInput.fill(worldTitle);
  
  // Select the system
  const systemSelect = dialog.locator('select[name="system"]');
  await systemSelect.selectOption(systemId);
  
  // The world ID is often auto-generated from title, but we can set it if there's an input
  const idInput = dialog.locator('input[name="id"], input[name="name"]');
  if (await idInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    await idInput.clear();
    await idInput.fill(worldId);
  }
  
  // Submit the form
  const submitButton = dialog.locator('button[type="submit"], button:has-text("Create")');
  await submitButton.click();
  
  // Wait for world to be created using polling
  await pollForElement(page, `[data-package-id="${worldId}"]`, { timeout: 10000 });
  await page.waitForLoadState('networkidle');
  
  // Verify world was created
  const newWorld = page.locator(`[data-package-id="${worldId}"]`);
  await expect(newWorld).toBeVisible({ timeout: 5000 });
  
  console.log(`[helper] World ${worldId} created successfully`);
  return worldId;
}

/**
 * Enable a module in a world via Foundry's UI
 * @param {import('@playwright/test').Page} page
 * @param {string} worldId - The world to configure
 * @param {string} moduleId - The module to enable
 * @param {string} [baseUrl] - Optional base URL (e.g., 'http://localhost:30001')
 */
export async function enableModuleInWorld(page, worldId, moduleId, baseUrl = '') {
  console.log(`[helper] Enabling module ${moduleId} in world ${worldId}`);
  
  // Navigate to setup page
  const setupUrl = baseUrl ? `${baseUrl}/setup` : '/setup';
  await page.goto(setupUrl);
  await page.waitForLoadState('networkidle');
  
  // Click on Worlds tab
  const worldsTab = page.locator('nav a[data-tab="worlds"], a:has-text("Game Worlds")');
  await worldsTab.click();
  await page.waitForLoadState('networkidle');
  
  // Find the world and click its edit/configure button
  const worldCard = page.locator(`[data-package-id="${worldId}"]`);
  await worldCard.click();
  
  // Look for "Edit World" or module configuration
  const editButton = page.locator('button:has-text("Edit"), button:has-text("Configure")');
  if (await editButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await editButton.click();
    await page.waitForLoadState('networkidle');
  }
  
  // Find module checkbox
  const moduleCheckbox = page.locator(`input[name="modules.${moduleId}"], input[data-module="${moduleId}"]`);
  
  if (await moduleCheckbox.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Check the module if not already checked
    const isChecked = await moduleCheckbox.isChecked();
    if (!isChecked) {
      await moduleCheckbox.check();
    }
    
    // Save changes
    const saveButton = page.locator('button[type="submit"], button:has-text("Save")');
    await saveButton.click();
    await page.waitForLoadState('networkidle');
    
    console.log(`[helper] Module ${moduleId} enabled`);
  } else {
    // Module configuration might be on launch - we'll enable it there
    console.log(`[helper] Module checkbox not found in edit screen, will enable on launch`);
  }
}

/**
 * Launch a specific world
 * @param {import('@playwright/test').Page} page
 * @param {string} worldId - The world ID to launch
 * @param {string} [baseUrl] - Optional base URL (e.g., 'http://localhost:30001')
 */
export async function launchWorld(page, worldId, baseUrl = '') {
  // Check current URL first - if we're already on /join, world is already running
  const currentUrl = page.url();
  console.log(`[helper] launchWorld: Current URL is ${currentUrl}`);
  
  if (currentUrl.includes('/join')) {
    console.log(`[helper] launchWorld: Already on /join page, world is already running. Skipping launch.`);
    return; // World is already running, no need to launch
  }
  
  const setupUrl = baseUrl ? `${baseUrl}/setup` : '/setup';
  await page.goto(setupUrl);
  await page.waitForLoadState('networkidle');
  
  // Debug: Log current URL after navigation
  const urlAfterNav = page.url();
  console.log(`[helper] launchWorld: After goto /setup, URL is ${urlAfterNav}`);
  
  // If we got redirected to /join, world is already running
  if (urlAfterNav.includes('/join')) {
    console.log(`[helper] launchWorld: Redirected to /join, world is already running. Skipping launch.`);
    return;
  }
  
  // AGGRESSIVELY dismiss tour overlay (this blocks clicks!)
  await dismissTourOverlay(page);
  
  // Handle consent dialog or tour if present
  const consentNo = page.locator('button:has-text("No"), button:has-text("Disagree")');
  if (await consentNo.isVisible({ timeout: 500 }).catch(() => false)) {
    await consentNo.click();
    // Wait for dialog to disappear
    await consentNo.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {});
  }
  await page.keyboard.press('Escape'); // Dismiss any tour overlay
  await dismissTourOverlay(page); // Make SURE it's gone
  
  // Make sure we're on the Worlds tab
  const worldsTab = page.locator('[data-tab="worlds"]').first();
  console.log(`[helper] Looking for Worlds tab...`);
  if (await worldsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log(`[helper] Clicking Worlds tab...`);
    await dismissTourOverlay(page);
    await worldsTab.click({ force: true }); // Force click past overlays
    await page.waitForLoadState('networkidle');
    // Wait for worlds section to be visible
    await page.locator('section[data-tab="worlds"], .worlds-list, [data-package-id]').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  } else {
    console.log(`[helper] Worlds tab not found, checking current state...`);
    await page.screenshot({ path: `/tmp/foundry-no-worlds-tab-${worldId}.png`, fullPage: true });
  }
  
  // Dismiss tour again before interacting with world card
  await dismissTourOverlay(page);
  
  // Find the world card - try multiple selectors for different Foundry versions
  const worldCardSelectors = [
    `[data-world-id="${worldId}"]`,
    `[data-package-id="${worldId}"]`,
    `li[data-package-id="${worldId}"]`,
    `.world-item[data-package-id="${worldId}"]`,
    `.package:has-text("${worldId}")`,
    `li:has-text("${worldId}")`
  ];
  
  let worldCard = null;
  for (const selector of worldCardSelectors) {
    const card = page.locator(selector).first();
    if (await card.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log(`[helper] Found world card with selector: ${selector}`);
      worldCard = card;
      break;
    }
  }
  
  if (!worldCard) {
    console.log(`[helper] World ${worldId} not found, taking debug screenshot...`);
    await page.screenshot({ path: `/tmp/foundry-launch-debug-${worldId}.png`, fullPage: true });
    throw new Error(`World ${worldId} not found in setup page`);
  }
  
  // Dismiss any overlays before interacting
  await dismissTourOverlay(page);
  
  // Wait for tour overlay to be fully gone using polling
  await pollUntilGone(page, '.tour-overlay', { timeout: 3000 }).catch(async () => {
    // If still visible after polling, try dismissing again
    console.log(`[helper] Tour overlay persists, attempting additional dismissal...`);
    await dismissTourOverlay(page);
  });
  
  // Debug: Log the world card HTML structure
  const cardHtml = await worldCard.innerHTML().catch(() => 'Could not get HTML');
  console.log(`[helper] World card HTML (first 500 chars): ${cardHtml.substring(0, 500)}`);
  
  // First check if launch button exists in DOM
  let launchButton = worldCard.locator('[data-action="worldLaunch"], a.control.play').first();
  const buttonExists = await worldCard.locator('[data-action="worldLaunch"], a.control.play').count();
  console.log(`[helper] Launch buttons within card: ${buttonExists}`);
  
  // If button doesn't exist yet, try hover (but use JS to avoid overlay issues)
  if (buttonExists === 0) {
    console.log('[helper] Button not visible, triggering hover via JavaScript...');
    await page.evaluate((selector) => {
      const card = document.querySelector(selector);
      if (card) {
        card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      }
    }, `[data-package-id="${worldId}"]`);
    // Poll for button to appear after hover
    await pollForElement(page, '[data-action="worldLaunch"], a.control.play', { timeout: 2000 }).catch(() => {});
  }
  
  let buttonFound = await launchButton.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`[helper] Launch button visible: ${buttonFound}`);
  
  // If button exists, ALWAYS use JavaScript click since Playwright clicks are unreliable
  // even when the button reports as visible
  let worldLaunchTriggered = false;
  if (buttonExists > 0) {
    console.log(`[helper] Button exists, using JavaScript click (always more reliable)...`);
    try {
      // Use JavaScript click which bypasses visibility checks entirely
      const clicked = await page.evaluate(() => {
        const btn = document.querySelector('[data-action="worldLaunch"]');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      if (clicked) {
        console.log(`[helper] JavaScript click on launch button succeeded`);
        worldLaunchTriggered = true;
      } else {
        console.log(`[helper] JavaScript click failed - button not found in DOM`);
      }
    } catch (e) {
      console.log(`[helper] JavaScript click failed: ${e.message}`);
    }
  }
  
  // If button not found in card, try Details view approach
  if (!worldLaunchTriggered) {
    // Click the card to potentially reveal the button
    // This handles Details view where selection may be needed
    console.log(`[helper] Launch button not found in card, clicking card to select...`);
    await worldCard.click({ force: true });
    // Poll for launch button to appear after selection
    await pollForElement(page, '[data-action="worldLaunch"], button:has-text("Launch")', { timeout: 5000 }).catch(() => {});
  }

  // Take a debug screenshot before looking for launch button
  await page.screenshot({ path: `/tmp/foundry-before-launch-${worldId}.png`, fullPage: true });
  
  // Dismiss tour overlay one more time before clicking launch
  await dismissTourOverlay(page);
  
  // Only search for and click launch button if we haven't already triggered the launch
  if (!worldLaunchTriggered) {
    // Find and click the Launch button - try multiple selectors
    // In Foundry v13, it's an <a> element with data-action="worldLaunch"
    const launchSelectors = [
      '[data-action="worldLaunch"]',           // v13 - anchor with data-action
      'a[data-action="worldLaunch"]',          // v13 - explicit anchor
      'a.control.play',                        // v13 - play control link
      'button[data-action="worldLaunch"]',     // fallback button variant
      'button:has-text("Launch World")',
      'button:has-text("Launch")',
      '.launch-button',
      'footer button:has-text("Launch")'
    ];
    
    launchButton = null;
    for (const selector of launchSelectors) {
      const btn = page.locator(selector).first();
      // Increase timeout to 2s per selector to handle slow rendering
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`[helper] Found launch button with selector: ${selector}`);
        launchButton = btn;
        break;
      }
    }
  }
  
  // Final tour dismissal
  await dismissTourOverlay(page);
  
  // Only click if we haven't already triggered the launch via force click
  if (!worldLaunchTriggered) {
    if (!launchButton || !(await launchButton.isVisible({ timeout: 1000 }).catch(() => false))) {
      // Maybe the world card itself has a launch action?
      // Or try double-clicking the card
      console.log(`[helper] No launch button found or not visible, trying double-click on world card...`);
      await worldCard.dblclick({ force: true }); // Force past any overlays
    } else {
      console.log(`[helper] Clicking launch button...`);
      await launchButton.click({ force: true }); // Force past any overlays
    }
  }
  
  // Wait for redirect to join page (not /game - that happens after joining)
  // World loading can take 3-4 minutes for database connections, especially with dnd5e
  // loading 22 compendium databases + world data + package migrations
  await page.waitForURL(/join/, { timeout: 240000 });
  await page.waitForLoadState('networkidle');
  console.log(`[helper] World ${worldId} launched, now on join page`);
}

/**
 * Join a world as a user
 * @param {import('@playwright/test').Page} page
 * @param {string} userName - User name to join as
 * @param {string} [password] - Optional password
 */
export async function joinAsUser(page, userName, password = '') {
  await page.waitForLoadState('networkidle');
  
  // Look for user selection
  const userSelect = page.locator('select[name="userid"], #join-user');
  if (await userSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
    await userSelect.selectOption({ label: userName });
  }
  
  // Fill password if needed
  const passwordInput = page.locator('input[name="password"], #join-password');
  if (password && await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await passwordInput.fill(password);
  }
  
  // Click the Join Game Session button specifically (avoid Return to Setup button)
  const joinButton = page.locator('button[name="join"], button:has-text("Join Game Session"), button:has-text("Join")').first();
  await joinButton.click();
  
  // Wait for game to load
  await page.waitForFunction(() => {
    // @ts-ignore
    return typeof game !== 'undefined' && game.ready === true;
  }, { timeout: 60000 });
}

/**
 * Open module settings
 * @param {import('@playwright/test').Page} page
 * @param {string} moduleId - The module ID
 */
export async function openModuleSettings(page, moduleId) {
  // Open settings (Escape menu -> Configure Settings)
  await page.keyboard.press('Escape');
  
  const settingsButton = page.locator('#settings button:has-text("Configure Settings"), button:has-text("Configure Settings")');
  await settingsButton.click();
  
  // Click on Module Settings tab
  const moduleTab = page.locator('nav a:has-text("Module Settings"), .tabs a[data-tab="modules"]');
  await moduleTab.click();
  
  // Wait for settings to load
  await page.waitForLoadState('networkidle');
}

/**
 * Execute JavaScript in the Foundry context
 * @param {import('@playwright/test').Page} page
 * @param {Function} fn - Function to execute
 * @param {any[]} args - Arguments to pass
 */
export async function executeInFoundry(page, fn, ...args) {
  return page.evaluate(fn, ...args);
}

/**
 * Get game state
 * @param {import('@playwright/test').Page} page
 */
export async function getGameState(page) {
  return page.evaluate(() => {
    // @ts-ignore
    return {
      // @ts-ignore
      ready: game.ready,
      // @ts-ignore
      systemId: game.system?.id,
      // @ts-ignore
      worldId: game.world?.id,
      // @ts-ignore
      userId: game.user?.id,
      // @ts-ignore
      modules: Array.from(game.modules.entries()).map(([id, m]) => ({
        id,
        // @ts-ignore
        active: m.active,
        // @ts-ignore
        title: m.title
      }))
    };
  });
}

/**
 * Check if Simulacrum module is active
 * @param {import('@playwright/test').Page} page
 */
export async function isSimulacrumActive(page) {
  return page.evaluate(() => {
    // @ts-ignore
    const mod = game.modules.get('simulacrum');
    return mod?.active === true;
  });
}

/**
 * Enable a module via Foundry's Module Management dialog (in-game)
 * This opens the Module Management window and enables the specified module.
 * 
 * @param {import('@playwright/test').Page} page
 * @param {string} moduleId - The module ID to enable (e.g., 'simulacrum')
 * @returns {Promise<boolean>} - True if module was enabled successfully
 */
export async function enableModuleViaUI(page, moduleId = 'simulacrum') {
  console.log(`[helper] Enabling module ${moduleId} via Module Management UI`);
  
  try {
    // Check if module is already active
    const alreadyActive = await page.evaluate((modId) => {
      // @ts-ignore
      return game.modules.get(modId)?.active === true;
    }, moduleId);
    
    if (alreadyActive) {
      console.log(`[helper] Module ${moduleId} is already active`);
      return true;
    }
    
    // Open Module Management directly via API (most reliable method)
    // In Foundry v13, render() is async and returns a promise
    console.log(`[helper] Opening Module Management via API...`);
    await page.evaluate(async () => {
      // @ts-ignore - Foundry v13 uses namespaced class
      const mm = new foundry.applications.sidebar.apps.ModuleManagement();
      // Await the render promise to ensure dialog is fully rendered
      await mm.render({ force: true });
    });
    
    // Poll for dialog to appear rather than fixed wait
    await pollForElement(page, '#module-management', { timeout: 5000 }).catch(() => {});
    
    // Find the Module Management dialog - it has id="module-management"
    const moduleManagementDialog = page.locator('#module-management');
    
    // Wait for it to be attached to DOM
    await moduleManagementDialog.waitFor({ state: 'attached', timeout: 10000 }).catch(() => {
      console.log(`[helper] Dialog not attached to DOM`);
    });
    
    if (!await moduleManagementDialog.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log(`[helper] Module Management dialog not visible, taking debug screenshot`);
      await page.screenshot({ path: '/tmp/module-management-debug.png' });
      
      // Debug: List all open apps
      const openApps = await page.evaluate(() => {
        // @ts-ignore
        if (typeof foundry !== 'undefined' && foundry.applications) {
          // @ts-ignore
          const instances = Array.from(foundry.applications.instances?.values?.() || []);
          return instances.map(app => ({ id: app.id, class: app.constructor?.name }));
        }
        return [];
      });
      console.log(`[helper] Open apps: ${JSON.stringify(openApps)}`);
      return false;
    }
    
    console.log(`[helper] Module Management dialog is visible`);
    
    // Find the checkbox for our module
    // Foundry v13 template uses: <input type="checkbox" name="{{module.id}}" ...>
    // Inside a <li> with data-module-id="{{module.id}}"
    const moduleRow = moduleManagementDialog.locator(`li[data-module-id="${moduleId}"]`);
    
    if (!await moduleRow.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`[helper] Module row for ${moduleId} not found, listing visible modules...`);
      const visibleModules = await moduleManagementDialog.locator('li[data-module-id]').allInnerTexts();
      console.log(`[helper] Visible modules: ${visibleModules.map(t => t.substring(0, 50)).join(', ')}`);
      await page.screenshot({ path: '/tmp/module-management-debug.png' });
      return false;
    }
    
    const checkbox = moduleRow.locator(`input[type="checkbox"][name="${moduleId}"]`);
    
    // Take screenshot before attempting to check
    await page.screenshot({ path: '/tmp/module-before-check.png' });
    
    if (!await checkbox.isVisible({ timeout: 1000 }).catch(() => false)) {
      // Fallback: try any checkbox in the row
      const anyCheckbox = moduleRow.locator('input[type="checkbox"]');
      if (await anyCheckbox.isVisible({ timeout: 1000 }).catch(() => false)) {
        const isChecked = await anyCheckbox.isChecked();
        console.log(`[helper] Found checkbox (fallback), isChecked=${isChecked}`);
        if (!isChecked) {
          // Use click with force to bypass any overlays
          await anyCheckbox.click({ force: true });
          console.log(`[helper] Clicked module ${moduleId} checkbox (fallback)`);
        }
      } else {
        console.log(`[helper] Could not find any checkbox for ${moduleId}`);
        return false;
      }
    } else {
      const isChecked = await checkbox.isChecked();
      const isDisabled = await checkbox.isDisabled();
      console.log(`[helper] Found module checkbox, isChecked=${isChecked}, isDisabled=${isDisabled}`);
      if (!isChecked) {
        if (isDisabled) {
          console.log(`[helper] Checkbox is disabled, cannot enable module`);
          // Check for dependency issues
          const issues = await moduleRow.locator('.issues, .warning, .error').allTextContents();
          if (issues.length > 0) {
            console.log(`[helper] Module issues: ${issues.join(', ')}`);
          }
          return false;
        }
        
        // Use JavaScript click - most reliable method
        await page.evaluate((modId) => {
          const input = document.querySelector(`#module-management input[name="${modId}"]`);
          if (input) {
            input.click(); // Native click which properly triggers all events
          }
        }, moduleId);
        await waitForUiSettle(page, 300); // Brief settle for UI update
        
        // Verify the checkbox is now checked
        const nowChecked = await checkbox.isChecked();
        console.log(`[helper] After JS click: checkbox isChecked=${nowChecked}`);
        
        if (!nowChecked) {
          console.log(`[helper] WARNING: JS click did not work, trying direct property set + form change...`);
          // Force check and dispatch proper form events
          await page.evaluate((modId) => {
            const input = document.querySelector(`#module-management input[name="${modId}"]`);
            if (input && !input.checked) {
              input.checked = true;
              // Dispatch input and change events to notify form
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              // Also trigger form change detection
              const form = input.closest('form');
              if (form) {
                form.dispatchEvent(new Event('input', { bubbles: true }));
                form.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
          }, moduleId);
          const forcedCheck = await checkbox.isChecked();
          console.log(`[helper] After forced check: isChecked=${forcedCheck}`);
        }
      }
    }
    
    // Click the Save Changes / Submit button in the footer
    // Foundry v13 uses form-footer.hbs which has a submit button with type="submit"
    const footer = moduleManagementDialog.locator('footer.form-footer');
    
    // Dismiss any Tour overlay that might be blocking the Save button
    await dismissTourOverlay(page);
    
    // Take screenshot before clicking save
    await page.screenshot({ path: '/tmp/module-before-save.png' });
    
    // Find the submit button - Foundry v13 uses type="submit" in form-footer
    const saveBtn = footer.locator('button[type="submit"]').first();
    
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const btnText = await saveBtn.textContent();
      console.log(`[helper] Found save button: "${btnText}"`);
      console.log(`[helper] Clicking Save button via JavaScript...`);
      
      // Use JavaScript click for reliable form submission
      await page.evaluate(() => {
        const btn = document.querySelector('#module-management footer.form-footer button[type="submit"]');
        if (btn) {
          btn.click();
        }
      });
      console.log(`[helper] Save button clicked`);
      
      // Wait for the Module Management dialog to close or for confirmation using polling
      let dialogClosed = false;
      
      await pollUntil(
        async () => {
          // Check if Module Management dialog is still visible
          const stillVisible = await moduleManagementDialog.isVisible({ timeout: 100 }).catch(() => false);
          if (!stillVisible) {
            console.log(`[helper] Module Management dialog closed`);
            dialogClosed = true;
            return true;
          }
          
          // Check for confirmation dialog
          const confirmDialog = page.locator('.dialog.app:visible, .dialog-content');
          const confirmVisible = await confirmDialog.isVisible({ timeout: 100 }).catch(() => false);
          if (confirmVisible) {
            console.log(`[helper] Found confirmation dialog`);
            const confirmBtn = page.locator('.dialog button:has-text("Yes"), .dialog button:has-text("Reload"), .dialog button[data-button="yes"]').first();
            if (await confirmBtn.isVisible({ timeout: 500 }).catch(() => false)) {
              console.log(`[helper] Clicking confirmation button...`);
              await confirmBtn.click();
              await page.waitForLoadState('networkidle', { timeout: 60000 });
              await waitForFoundryReady(page);
              dialogClosed = true;
              return true;
            }
          }
          return false;
        },
        { timeout: 10000, pollInterval: 300 }
      ).catch(() => {
        console.log(`[helper] Polling for dialog close timed out`);
      });
      
      if (dialogClosed) {
        // Force a page reload to ensure module is activated
        console.log(`[helper] Reloading page to activate module...`);
        await page.reload({ waitUntil: 'networkidle' });
        await waitForFoundryReady(page);
        await dismissTourOverlay(page); // Tour reappears after reload
      } else {
        console.log(`[helper] Dialog didn't close, trying form submit via JavaScript...`);
        // Try submitting the form directly
        await page.evaluate(() => {
          const form = document.querySelector('#module-management form');
          if (form) {
            // Request submit which handles form validation
            form.requestSubmit();
          }
        });
        // Poll for form to process rather than fixed wait
        await waitForUiSettle(page, 500);
        
        // Force reload anyway
        await page.reload({ waitUntil: 'networkidle' });
        await waitForFoundryReady(page);
        await dismissTourOverlay(page); // Tour reappears after reload
      }
    } else {
      console.log(`[helper] No submit button found in footer`);
      // Debug: list buttons in footer
      const footerButtons = await footer.locator('button').allTextContents();
      console.log(`[helper] Footer buttons: ${footerButtons.join(', ')}`);
    }
    
    // Verify module is now active
    const nowActive = await page.evaluate((modId) => {
      // @ts-ignore
      return game.modules.get(modId)?.active === true;
    }, moduleId);
    
    console.log(`[helper] Module ${moduleId} active after enable: ${nowActive}`);
    return nowActive;
  } catch (error) {
    console.error(`[helper] Error enabling module via UI: ${error.message}`);
    await page.screenshot({ path: '/tmp/module-enable-error.png' });
    return false;
  }
}

/**
 * Open Simulacrum panel
 * @param {import('@playwright/test').Page} page
 */
export async function openSimulacrumPanel(page) {
  // Look for Simulacrum button in UI
  const panelButton = page.locator(
    'button[data-tool="simulacrum"], ' +
    '[data-module="simulacrum"] button, ' +
    'button:has-text("Simulacrum"), ' +
    '.simulacrum-toggle'
  );
  
  await panelButton.click();
  
  // Wait for panel to appear
  const panel = page.locator('.simulacrum-panel, [data-appid*="simulacrum"], .app.simulacrum');
  await expect(panel).toBeVisible({ timeout: 10000 });
  
  return panel;
}

/**
 * Wait for Foundry notification
 * @param {import('@playwright/test').Page} page
 * @param {string} text - Text to look for in notification
 * @param {'info' | 'warning' | 'error'} [type] - Notification type
 */
export async function waitForNotification(page, text, type) {
  const typeClass = type ? `.${type}` : '';
  const notification = page.locator(`#notifications .notification${typeClass}:has-text("${text}")`);
  await expect(notification).toBeVisible({ timeout: 10000 });
  return notification;
}

/**
 * Dismiss all notifications
 * @param {import('@playwright/test').Page} page
 */
export async function dismissNotifications(page) {
  const notifications = page.locator('#notifications .notification');
  const count = await notifications.count();
  
  for (let i = 0; i < count; i++) {
    try {
      await notifications.nth(i).click();
    } catch {
      // Notification might have auto-dismissed
    }
  }
}

/**
 * Take a screenshot with a descriptive name
 * @param {import('@playwright/test').Page} page
 * @param {string} name - Screenshot name
 */
export async function screenshot(page, name) {
  await page.screenshot({
    path: `tests/e2e/screenshots/${name}.png`,
    fullPage: true
  });
}

/**
 * Wait for Foundry to be fully ready
 * @param {import('@playwright/test').Page} page
 */
export async function waitForFoundryReady(page) {
  await page.waitForFunction(() => {
    // @ts-ignore
    return typeof game !== 'undefined' && 
           // @ts-ignore
           game.ready === true && 
           // @ts-ignore
           typeof ui !== 'undefined' &&
           // @ts-ignore
           ui.sidebar !== undefined;
  }, { timeout: 60000 });
  
  // Dismiss any tour overlays that appear on first game load
  await dismissTourOverlay(page);
}

/**
 * Return to setup screen (exit the current world)
 * NOTE: With per-test isolation, this is rarely needed as each test 
 * has its own Foundry instance that gets destroyed after the test.
 * @param {import('@playwright/test').Page} page
 * @param {string} [baseUrl] - Optional base URL (e.g., 'http://localhost:30001')
 */
export async function returnToSetup(page, baseUrl = '') {
  console.log('[helper] Returning to setup screen...');
  
  const setupUrl = baseUrl ? `${baseUrl}/setup` : '/setup';
  
  // Check if we're even in a world (game object exists and is ready)
  const inWorld = await page.evaluate(() => {
    // @ts-ignore
    return typeof game !== 'undefined' && game.ready === true;
  }).catch(() => false);
  
  if (!inWorld) {
    // Already not in a world, just navigate to setup
    await page.goto(setupUrl);
    await page.waitForLoadState('networkidle');
    console.log('[helper] Was not in world, navigated to /setup');
    return;
  }
  
  // Use Foundry's built-in return to setup functionality
  try {
    await page.evaluate(() => {
      // @ts-ignore - Foundry global
      return game.shutDown();
    });
    
    // Wait for navigation to setup page
    await page.waitForURL('**/setup', { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    console.log('[helper] Successfully returned to setup via game.shutDown()');
  } catch (err) {
    console.log(`[helper] game.shutDown() failed or timed out: ${err.message}`);
    
    // Check if we're already at setup (shutdown may have partially worked)
    const currentUrl = page.url();
    if (currentUrl.includes('/setup')) {
      console.log('[helper] Already at setup page');
      await page.waitForLoadState('networkidle').catch(() => {});
      return;
    }
    
    // Fallback: force navigate to setup
    try {
      await page.goto(setupUrl, { waitUntil: 'networkidle' });
      console.log('[helper] Fallback: navigated directly to /setup');
    } catch (navErr) {
      // Navigation interrupted - check if we're at setup now
      const finalUrl = page.url();
      if (finalUrl.includes('/setup')) {
        console.log('[helper] Navigation interrupted but arrived at /setup');
        await page.waitForLoadState('networkidle').catch(() => {});
      } else {
        console.log(`[helper] Failed to get to setup. Current URL: ${finalUrl}`);
      }
    }
  }
}
