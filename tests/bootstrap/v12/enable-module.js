/**
 * Enable module module for v12
 * Extracted from working monolithic bootstrap-runner.js
 */

export class EnableModuleV12 {
  async enableModule(page, config) {
    try {
      // Open Settings sidebar tab
      console.log('[V12 Module] 📍 Opening Settings sidebar tab...');
      await page.waitForSelector('#sidebar-tabs a[data-tab="settings"]', { timeout: 20000 });
      await page.evaluate(() => {
        const tab = document.querySelector('#sidebar-tabs a[data-tab="settings"]');
        (tab instanceof HTMLElement) && tab.click();
      });
      await page.waitForSelector('#settings', { timeout: 20000 });

      // Click "Manage Modules"
      console.log('[V12 Module] 📍 Clicking Manage Modules...');
      await page.waitForSelector('#settings button[data-action="modules"]', { timeout: 20000 });
      await page.evaluate(() => {
        const btn = document.querySelector('#settings button[data-action="modules"]');
        (btn instanceof HTMLElement) && btn.click();
      });

      // Wait for Module Management window
      await page.waitForSelector('#module-management', { timeout: 30000 });
      await page.waitForSelector('#module-management #module-list', { timeout: 30000 });

      // Filter to simulacrum to be safe
      console.log('[V12 Module] 🔎 Filtering for simulacrum module...');
      await page.evaluate(() => {
        const input = document.querySelector('#module-management input[name="search"]');
        if (input) {
          input.value = 'simulacrum';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      // Check the simulacrum module checkbox
      console.log('[V12 Module] 📍 Enabling Simulacrum module checkbox...');
      const moduleEnabled = await page.evaluate(() => {
        const row = document.querySelector('#module-management [data-module-id="simulacrum"]');
        const checkbox = row?.querySelector('input.active[name="simulacrum"]');
        if (!checkbox) return { found: false };
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        return { found: true };
      });

      if (!moduleEnabled.found) {
        throw new Error('Simulacrum module checkbox not found in Module Management');
      }

      // Save module settings
      console.log('[V12 Module] 💾 Saving module settings...');
      const saveClicked = await page.evaluate(() => {
        const btn = document.querySelector('#module-management button[type="submit"]');
        if (btn instanceof HTMLElement) { btn.click(); return true; }
        return false;
      });
      if (!saveClicked) throw new Error('Save Module Settings button not found');

      // Reload confirmation is mandatory in v12
      console.log('[V12 Module] 🔁 Waiting for reload confirmation dialog...');
      const confirmAppeared = await page.waitForFunction(() => !!document.getElementById('reload-world-confirm'), { timeout: 15000 }).then(() => true).catch(() => false);
      if (!confirmAppeared) {
        throw new Error('Reload confirmation dialog not detected');
      }

      console.log('[V12 Module] 📍 Confirming reload (Yes)...');
      const clickedYes = await page.evaluate(() => {
        const dlg = document.getElementById('reload-world-confirm');
        const yesBtn = dlg?.querySelector('button[data-action="yes"]');
        if (yesBtn instanceof HTMLElement) { yesBtn.click(); return true; }
        return false;
      });
      if (!clickedYes) throw new Error('Failed to click Yes on reload confirmation');

      // Wait for Foundry to reinitialize (mirror v13 approach)
      console.log('[V12 Module] ⏳ Waiting for FoundryVTT to reinitialize after module activation...');
      const foundryLoadedPromise = new Promise((resolve) => {
        const listener = (msg) => {
          try {
            const text = msg.text();
            if (text.includes('Foundry VTT | Drawing game canvas for scene')) {
              console.log('[V12 Module] ✅ FoundryVTT game canvas ready - full initialization complete');
              page.off('console', listener);
              resolve();
            }
          } catch {}
        };
        page.on('console', listener);
        setTimeout(() => { page.off('console', listener); resolve(); }, 30000);
      });
      await foundryLoadedPromise;

      // Grace period like v13
      console.log('[V12 Module] 📍 Waiting 10 seconds grace period for full initialization...');
      await new Promise(resolve => setTimeout(resolve, 10000));

      console.log('[V12 Module] ✅ Module activation reload complete (mandatory-confirm)');
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to enable Simulacrum module:', error.message);
      return { success: false, error: error.message };
    }
  }
}
