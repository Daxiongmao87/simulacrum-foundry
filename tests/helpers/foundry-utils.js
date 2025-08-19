/**
 * @file tests/helpers/foundry-utils.js
 * @description Generic FoundryVTT utility functions for testing
 * 
 * These utilities provide common functionality for checking FoundryVTT
 * availability and status across all test types.
 */

import puppeteer from 'puppeteer';

/**
 * Check if FoundryVTT is available and ready for testing
 * @param {string} url - FoundryVTT URL to check
 * @returns {Promise<boolean>} True if FoundryVTT is ready
 */
export async function checkFoundryGameWorld(url) {
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto(url, { timeout: 10000 });
    
    // Check if we're in a game world
    const isInGameWorld = await page.evaluate(() => {
      return window.game?.ready && 
             window.game?.view === 'game' && 
             window.canvas?.ready;
    });
    
    await browser.close();
    return isInGameWorld;
  } catch (error) {
    return false;
  }
}

/**
 * Get FoundryVTT environment status
 * @param {string} url - FoundryVTT URL to check
 * @returns {Promise<Object>} Environment status information
 */
export async function getFoundryEnvironmentStatus(url) {
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto(url, { timeout: 10000 });
    
    const status = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        hasGame: !!window.game,
        gameReady: window.game?.ready || false,
        gameView: window.game?.view || 'unknown',
        hasCanvas: !!window.canvas,
        canvasReady: window.canvas?.ready || false,
        hasWorld: !!window.game?.world,
        hasUser: !!window.game?.user,
        systemId: window.game?.system?.id || 'unknown'
      };
    });
    
    await browser.close();
    return { success: true, ...status };
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      url 
    };
  }
}
