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

      // Join page handling: wait for join UI or /game
      console.log('[V12 Launch] ⏳ Waiting for join page or game...');
      await page.waitForFunction(() => {
        const onGame = window.location.pathname.includes('/game');
        const hasJoinSelect = !!document.querySelector('select[name="userid"]');
        const hasJoinForm = !!document.querySelector('#join-game-form');
        return onGame || hasJoinSelect || hasJoinForm;
      }, { timeout: 120000 });

      // If we are on join, select a user and submit
      const onGameAlready = await page.evaluate(() => window.location.pathname.includes('/game'));
      if (!onGameAlready) {
        console.log('[V12 Launch] 👤 Join screen detected, selecting user and submitting...');
        const joined = await page.evaluate(() => {
          const select = document.querySelector('select[name="userid"]');
          if (!select) return { success: false, reason: 'no_user_select' };
          // Pick the first non-disabled option with value
          const option = Array.from(select.options).find(o => o.value && !o.disabled) || select.options[0];
          if (!option || !option.value) return { success: false, reason: 'no_valid_option' };
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          // Find form and submit
          const form = document.querySelector('#join-game-form') || select.closest('form');
          const button = form?.querySelector('button[type="submit"], button[name="join"]');
          if (form && form.requestSubmit) { form.requestSubmit(); return { success: true, method: 'requestSubmit' }; }
          if (button instanceof HTMLElement) { button.click(); return { success: true, method: 'button_click' }; }
          if (form) { form.submit(); return { success: true, method: 'form_submit' }; }
          return { success: false, reason: 'no_submit' };
        });
        console.log('[V12 Launch] 📊 Join submit result:', JSON.stringify(joined, null, 2));
      }

      // Wait for navigation into the game route or canvas readiness
      await Promise.race([
        page.waitForFunction(() => window.location.pathname.includes('/game'), { timeout: 120000 }),
        new Promise((resolve) => {
          const listener = (msg) => {
            try { const text = msg.text(); if (text.includes('Drawing game canvas')) { resolve(); } } catch {}
          };
          page.on('console', listener);
          setTimeout(() => { page.off('console', listener); resolve(); }, 120000);
        })
      ]);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
