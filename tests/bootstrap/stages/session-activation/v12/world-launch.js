/**
 * World launch module for v12
 * Extracted from working monolithic bootstrap-runner.js
 */

export class WorldLaunchV12 {
  static meta = { name: 'world-launch', description: 'Launch created world' };
  async launchWorld(page, worldId, port, config) {
    console.log(`[V12 Launch] 🚀 Launching world: ${worldId}`);
    
    try {
      // Always normalize to the Setup page which owns the Worlds list
      const setupUrl = `http://localhost:${port}/setup`;
      console.log(`[V12 Launch] 📍 Navigating to setup: ${setupUrl}`);
      await page.goto(setupUrl, { waitUntil: 'domcontentloaded' });

      // Wait for the SetupPackages app to be rendered and tabs available
      await page.waitForSelector('#setup-packages', { timeout: 30000 });
      await page.waitForSelector('[data-tab="worlds"]', { timeout: 30000 });

      // Ensure Worlds tab is active
      console.log('[V12 Launch] 📍 Activating Worlds tab...');
      await page.evaluate(() => {
        const worldsTab = document.querySelector('[data-tab="worlds"]');
        (worldsTab instanceof HTMLElement) && worldsTab.click();
      });

      // Wait for worlds list container and item structure (per v12 source)
      await page.waitForSelector('#worlds-list, #worlds', { timeout: 30000 });

      // Verify the worlds app state and list contents
      const worldsState = await page.evaluate(() => {
        const worldsList = document.getElementById('worlds-list');
        const worldsSection = document.getElementById('worlds');
        const tiles = Array.from((worldsList || worldsSection)?.querySelectorAll('[data-package-id]') || [])
          .map(e => e.getAttribute('data-package-id'));
        return {
          hasWorldsList: !!worldsList,
          hasWorldsSection: !!worldsSection,
          packageIds: tiles
        };
      });
      console.log('[V12 Launch] 📊 Worlds state:', JSON.stringify(worldsState, null, 2));

      // Click the Launch button for the specific world using canonical selectors
      console.log(`[V12 Launch] 📍 Looking for worldLaunch button for ${worldId}...`);
      const clicked = await page.evaluate((id) => {
        const list = document.getElementById('worlds-list') || document.getElementById('worlds');
        if (!list) return false;
        const tile = list.querySelector(`.world[data-package-id="${id}"]`) || list.querySelector(`[data-package-id="${id}"]`);
        if (!tile) return false;
        const btn = tile.querySelector('[data-action="worldLaunch"]');
        if (!btn) return false;
        (btn instanceof HTMLElement) && btn.click();
        return true;
      }, worldId);

      if (!clicked) {
        const debug = await page.evaluate(() => {
          const list = document.getElementById('worlds-list') || document.getElementById('worlds');
          const html = (list?.outerHTML || '').slice(0, 4000);
          const entries = Array.from(list?.querySelectorAll('[data-package-id]') || []).map(e => ({
            id: e.getAttribute('data-package-id'),
            hasLaunch: !!e.querySelector('[data-action="worldLaunch"]'),
            className: e.className
          }));
          return { html, entries };
        });
        console.log('[V12 Launch] 🔍 Worlds list debug:', JSON.stringify(debug, null, 2));
        throw new Error(`Launch button not found for ${worldId}`);
      }

      console.log(`[V12 Launch] ✅ Launch World clicked for ${worldId}`);

      // Wait for join page to appear (but don't authenticate - let User Authentication step handle that)
      console.log('[V12 Launch] ⏳ Waiting for join page to appear...');
      await page.waitForFunction(() => {
        const hasJoinSelect = !!document.querySelector('select[name="userid"]');
        const hasJoinForm = !!document.querySelector('#join-game-form');
        return hasJoinSelect || hasJoinForm;
      }, { timeout: 120000 });

      console.log('[V12 Launch] ✅ Join page detected, ready for user authentication step');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
