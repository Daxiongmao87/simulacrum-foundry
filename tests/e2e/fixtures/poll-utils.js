/**
 * Polling Utilities
 * 
 * Replaces fixed waits with efficient polling that exits as soon as
 * conditions are met, with a master timeout as safety.
 */

/**
 * Poll until a condition is met or timeout expires.
 * @param {Function} conditionFn - Async function returning truthy when condition is met
 * @param {Object} options - Configuration options
 * @param {number} options.timeout - Master timeout in ms (default: 30000)
 * @param {number} options.interval - Polling interval in ms (default: 100)
 * @param {string} options.description - Description for error messages
 * @returns {Promise<any>} - Result from conditionFn when truthy
 * @throws {Error} - If timeout expires before condition is met
 */
export async function pollUntil(conditionFn, options = {}) {
  const {
    timeout = 30000,
    interval = 100,
    description = 'condition'
  } = options;

  const startTime = Date.now();
  let lastError = null;

  while (Date.now() - startTime < timeout) {
    try {
      const result = await conditionFn();
      if (result) {
        return result;
      }
    } catch (err) {
      lastError = err;
      // Continue polling - condition might not be ready yet
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  const elapsed = Date.now() - startTime;
  throw new Error(
    `Timeout after ${elapsed}ms waiting for ${description}` +
    (lastError ? `: ${lastError.message}` : '')
  );
}

/**
 * Poll until an element is visible on the page.
 * @param {import('playwright').Page} page - Playwright page
 * @param {string} selector - CSS selector
 * @param {Object} options - Poll options (timeout, interval)
 * @returns {Promise<import('playwright').Locator>}
 */
export async function pollForElement(page, selector, options = {}) {
  const { timeout = 10000, interval = 100 } = options;
  
  return pollUntil(
    async () => {
      const element = page.locator(selector).first();
      if (await element.isVisible().catch(() => false)) {
        return element;
      }
      return null;
    },
    { timeout, interval, description: `element "${selector}"` }
  );
}

/**
 * Poll until an element is NOT visible on the page.
 * @param {import('playwright').Page} page - Playwright page
 * @param {string} selector - CSS selector
 * @param {Object} options - Poll options (timeout, interval)
 * @returns {Promise<void>}
 */
export async function pollUntilGone(page, selector, options = {}) {
  const { timeout = 10000, interval = 100 } = options;
  
  return pollUntil(
    async () => {
      const isVisible = await page.locator(selector).first().isVisible().catch(() => false);
      return !isVisible;
    },
    { timeout, interval, description: `element "${selector}" to disappear` }
  );
}

/**
 * Poll until network is idle or timeout.
 * @param {import('playwright').Page} page - Playwright page
 * @param {Object} options - Poll options
 * @returns {Promise<void>}
 */
export async function pollForNetworkIdle(page, options = {}) {
  const { timeout = 10000 } = options;
  
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch {
    // Network may never go fully idle - that's often okay
  }
}

/**
 * Poll until a URL matches a pattern.
 * @param {import('playwright').Page} page - Playwright page
 * @param {string|RegExp} pattern - URL pattern to match
 * @param {Object} options - Poll options
 * @returns {Promise<string>} - The matching URL
 */
export async function pollForUrl(page, pattern, options = {}) {
  const { timeout = 30000, interval = 100 } = options;
  
  return pollUntil(
    async () => {
      const url = page.url();
      if (pattern instanceof RegExp) {
        return pattern.test(url) ? url : null;
      }
      return url.includes(pattern) ? url : null;
    },
    { timeout, interval, description: `URL matching "${pattern}"` }
  );
}

/**
 * Poll a server endpoint until it responds.
 * @param {string} url - URL to poll
 * @param {Object} options - Poll options
 * @returns {Promise<boolean>}
 */
export async function pollForServer(url, options = {}) {
  const { timeout = 60000, interval = 500 } = options;
  
  return pollUntil(
    async () => {
      try {
        const response = await fetch(url, { 
          method: 'GET',
          signal: AbortSignal.timeout(2000)
        });
        return response.ok || response.status === 403;
      } catch {
        return false;
      }
    },
    { timeout, interval, description: `server at ${url}` }
  );
}

/**
 * Wait briefly for UI to settle, but exit early if possible.
 * Use this instead of fixed waitForTimeout for UI animations.
 * @param {import('playwright').Page} page - Playwright page
 * @param {number} maxWait - Maximum wait time in ms (default: 500)
 */
export async function waitForUiSettle(page, maxWait = 500) {
  const startTime = Date.now();
  const checkInterval = 50;
  
  // Wait for any animations to complete
  while (Date.now() - startTime < maxWait) {
    // Check if there are any ongoing animations
    const hasAnimations = await page.evaluate(() => {
      return document.getAnimations?.().some(a => a.playState === 'running') ?? false;
    }).catch(() => false);
    
    if (!hasAnimations) {
      // Small buffer for any micro-tasks
      await new Promise(r => setTimeout(r, 50));
      return;
    }
    
    await new Promise(r => setTimeout(r, checkInterval));
  }
}

/**
 * Dismiss any modal dialog blocking interaction.
 * Polls for common dialog patterns and dismisses them.
 * @param {import('playwright').Page} page - Playwright page
 * @param {Object} options - Options
 * @returns {Promise<boolean>} - True if a dialog was dismissed
 */
export async function dismissBlockingDialog(page, options = {}) {
  const { timeout = 2000 } = options;
  
  const dialogSelectors = [
    // Usage data dialog
    'dialog button[data-action="no"]',
    // Generic decline/close buttons
    'dialog button:has-text("Decline")',
    'dialog button:has-text("No")',
    'dialog button:has-text("Close")',
    'dialog button[data-action="close"]',
    // Tour overlay
    '.tour-overlay .step-button:has-text("Skip")',
    '.tour-center-step button:has-text("Skip")',
  ];
  
  for (const selector of dialogSelectors) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 100 }).catch(() => false)) {
        await btn.click({ timeout: 1000 });
        await waitForUiSettle(page, 300);
        return true;
      }
    } catch {
      // Continue to next selector
    }
  }
  
  return false;
}
