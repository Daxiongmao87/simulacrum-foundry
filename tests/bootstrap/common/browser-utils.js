#!/usr/bin/env node

/**
 * @file tests/bootstrap/common/browser-utils.js
 * @description Common browser automation utilities for FoundryVTT testing
 */

import puppeteer from 'puppeteer';

/**
 * Launch a Puppeteer browser instance
 * @param {Object} config - Configuration object with puppeteer settings
 * @returns {Promise<import('puppeteer').Browser>} Puppeteer browser instance
 */
export async function launchBrowser(config) {
  const configuredArgs = Array.isArray(config?.puppeteer?.args) ? config.puppeteer.args : [];
  const launchArgs = Array.from(new Set([...configuredArgs, '--no-sandbox', '--disable-setuid-sandbox']));
  return await puppeteer.launch({ 
    headless: config?.puppeteer?.headless ?? true,
    args: launchArgs,
    defaultViewport: config?.puppeteer?.viewport ?? { width: 1366, height: 768 }
  });
}

/**
 * Create a new page with console and error handling
 * @param {import('puppeteer').Browser} browser - Puppeteer browser instance
 * @param {Object} config - Configuration object
 * @returns {Promise<import('puppeteer').Page>} Puppeteer page instance
 */
export async function createPageWithHandlers(browser, config) {
  const page = await browser.newPage();
  
  // Handle console messages and filter Chromium warnings
  page.on('console', async (msg) => {
    const text = msg.text();
    // Ignore Chromium version compatibility warnings
    if (text.includes('modern JavaScript features') && text.includes('Chromium version')) {
      console.log(`Simulacrum | [Browser Utils] [BROWSER] ${msg.type()}: ${text} (ignored)`);
      return;
    }
    
    // If the message contains JSHandle references, try to get the actual values
    if (text.includes('JSHandle@')) {
      try {
        const args = await Promise.all(msg.args().map(arg => arg.jsonValue().catch(() => 'Unable to serialize')));
        console.log(`Simulacrum | [Browser Utils] [BROWSER] ${msg.type()}:`, ...args);
      } catch (e) {
        console.log(`Simulacrum | [Browser Utils] [BROWSER] ${msg.type()}: ${text}`);
      }
    } else {
      console.log(`Simulacrum | [Browser Utils] [BROWSER] ${msg.type()}: ${text}`);
    }
  });
  
  // Handle page errors without terminating
  page.on('pageerror', (error) => {
    if (error.message.includes('modern JavaScript features') && error.message.includes('Chromium version')) {
      console.log(`Simulacrum | [Browser Utils] [BROWSER] pageerror: ${error.message} (ignored)`);
      return;
    }
    console.log(`Simulacrum | [Browser Utils] [BROWSER] pageerror: ${error.message}`);
  });
  
  return page;
}

/**
 * Navigate to a URL and wait for page to be ready
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} url - URL to navigate to
 * @param {Object} config - Configuration object with timeout settings
 * @returns {Promise<void>}
 */
export async function navigateToUrl(page, url, config) {
  await page.goto(url, { 
    waitUntil: 'domcontentloaded', 
    timeout: config.puppeteer.timeout 
  });
}

/**
 * Wait for a function to return true on the page
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {Function} fn - Function to evaluate on the page
 * @param {Object} options - Options including timeout
 * @param {...any} args - Arguments to pass to the function
 * @returns {Promise<any>} Result of the function
 */
export async function waitForPageFunction(page, fn, options, ...args) {
  return await page.waitForFunction(fn, options, ...args);
}

/**
 * Take a screenshot of the page
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} filename - Filename for the screenshot
 * @param {Object} options - Screenshot options
 * @returns {Promise<string>} Filename of the saved screenshot
 */
export async function takeScreenshot(page, filename, options = { fullPage: true }) {
  await page.screenshot({ path: filename, ...options });
  console.log(`Simulacrum | [Browser Utils] 📸 Screenshot saved: ${filename}`);
  return filename;
}

/**
 * Evaluate a function on the page
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {Function} fn - Function to evaluate
 * @param {...any} args - Arguments to pass to the function
 * @returns {Promise<any>} Result of the function
 */
export async function evaluateOnPage(page, fn, ...args) {
  return await page.evaluate(fn, ...args);
}

/**
 * Click an element on the page
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} selector - CSS selector for the element
 * @returns {Promise<void>}
 */
export async function clickElement(page, selector) {
  await page.click(selector);
}

/**
 * Type text into an input field
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} selector - CSS selector for the input field
 * @param {string} text - Text to type
 * @returns {Promise<void>}
 */
export async function typeText(page, selector, text) {
  await page.type(selector, text);
}

/**
 * Select an option from a dropdown
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} selector - CSS selector for the select element
 * @param {string} value - Value to select
 * @returns {Promise<void>}
 */
export async function selectOption(page, selector, value) {
  await page.select(selector, value);
}

/**
 * Wait for a specific amount of time
 * @param {number} milliseconds - Time to wait in milliseconds
 * @returns {Promise<void>}
 */
export async function wait(milliseconds) {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

/**
 * Get the current URL of the page
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @returns {Promise<string>} Current URL
 */
export async function getCurrentUrl(page) {
  return page.url();
}

/**
 * Check if an element exists on the page
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} selector - CSS selector for the element
 * @returns {Promise<boolean>} True if element exists
 */
export async function elementExists(page, selector) {
  const element = await page.$(selector);
  return element !== null;
}

/**
 * Get all elements matching a selector
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} selector - CSS selector for the elements
 * @returns {Promise<import('puppeteer').ElementHandle[]>} Array of element handles
 */
export async function getAllElements(page, selector) {
  return await page.$$(selector);
}

/**
 * Get text content of an element
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} selector - CSS selector for the element
 * @returns {Promise<string>} Text content
 */
export async function getElementText(page, selector) {
  return await page.$eval(selector, el => el.textContent || '');
}

/**
 * Get attribute value of an element
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} selector - CSS selector for the element
 * @param {string} attribute - Attribute name
 * @returns {Promise<string>} Attribute value
 */
export async function getElementAttribute(page, selector, attribute) {
  return await page.$eval(selector, (el, attr) => el.getAttribute(attr) || '', attribute);
}
