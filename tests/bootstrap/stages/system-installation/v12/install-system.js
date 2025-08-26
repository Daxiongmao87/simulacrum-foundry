/**
 * Install system module for v12
 * Extracted from working monolithic bootstrap-runner.js
 */

export class SystemInstallerV12 {
  static meta = { name: 'install-system', description: 'Install configured game system' };
  async installSystem(page, system) {
    console.log(`[V12 System] 🎲 Installing system: ${system}`);
    
    try {
      // Step 1: Wait for setup page to be fully ready
      console.log('[V12 System] 📍 Waiting for setup page to be fully ready...');
      
      await page.waitForFunction(() => {
        const hasSetupElements = !!document.querySelector('.setup-menu, .setup-packages, [data-tab], .setup-packages-systems, .setup-packages-worlds');
        const hasGameObject = typeof window.game !== 'undefined';
        const hasAnyContent = document.body.textContent && document.body.textContent.length > 100;
        
        return hasSetupElements || hasGameObject || hasAnyContent;
      }, { timeout: 60000 });
      
      console.log('[V12 System] ✅ FoundryVTT setup page is ready');

      // Step 1.5: Activate Systems tab (default is Worlds)
      console.log('[V12 System] 📍 Activating Systems tab...');
      await page.evaluate(() => {
        const tab = document.querySelector('[data-tab="systems"]');
        (tab instanceof HTMLElement) && tab.click();
      });
      // Wait for the systems section controls to be available
      await page.waitForSelector('#systems button[data-action="installPackage"]', { timeout: 20000 });
      
      // Step 2: Click "Install System" button
      console.log('[V12 System] 📍 Clicking Install System button...');
      
      const installSystemClicked = await page.evaluate(() => {
        // Prefer the data-action selector as per source template
        const installButton = document.querySelector('#systems button[data-action="installPackage"]');
        if (installButton) {
          (installButton instanceof HTMLElement) && installButton.click();
          return true;
        }
        // Fallback: any button with the text
        const buttons = Array.from(document.querySelectorAll('#systems button'));
        const button = buttons.find(btn => btn.textContent?.includes('Install System'));
        if (button) {
          (button instanceof HTMLElement) && button.click();
          return true;
        }
        return false;
      });
      
      if (!installSystemClicked) throw new Error('Install System button not found');
      console.log('[V12 System] ✅ Install System button clicked');
      
      // Step 3: Wait for InstallPackage dialog (#install-package) and its content
      console.log('[V12 System] ⏳ Waiting for install package dialog (#install-package)...');
      await page.waitForSelector('#install-package', { timeout: 15000 });
      await page.waitForSelector('#install-package .entry-list', { timeout: 30000 });
      await page.waitForFunction(() => !!document.querySelector('#install-package input[name="filter"]'), { timeout: 15000 });
      
      // Step 4: Use the dialog filter to search for the specific system id
      console.log(`[V12 System] 🔎 Filtering dialog for package id: ${system} ...`);
      await page.evaluate((systemName) => {
        const dialog = document.querySelector('#install-package');
        const input = dialog?.querySelector('input[name="filter"]');
        if (!input) return false;
        input.value = systemName;
        const evt = new Event('input', { bubbles: true, cancelable: true });
        input.dispatchEvent(evt);
        return true;
      }, system);
      
      // Wait for the filtered entry to appear
      const selectorForEntry = `#install-package .entry-list [data-package-id="${system}"]`;
      console.log(`[V12 System] ⏳ Waiting for entry selector: ${selectorForEntry}`);
      const entryAppeared = await page.waitForFunction((sel) => !!document.querySelector(sel), { timeout: 60000 }, selectorForEntry)
        .then(() => true)
        .catch(() => false);
      
      if (!entryAppeared) {
        const debug = await page.evaluate(() => {
          const dialog = document.querySelector('#install-package');
          const entryList = dialog?.querySelector('.entry-list');
          const ids = Array.from(entryList?.querySelectorAll('[data-package-id]') || []).map(e => e.getAttribute('data-package-id'));
          return {
            hasDialog: !!dialog,
            hasEntryList: !!entryList,
            packageIds: ids,
            firstEntriesPreview: (entryList?.innerText || '').slice(0, 800)
          };
        });
        console.log('[V12 System] 📊 Dialog debug (no entry found):', JSON.stringify(debug, null, 2));
        throw new Error(`${system} package not present in dialog after filtering`);
      }
      
      // Step 5: Click the install button within the specific entry
      console.log(`[V12 System] 📍 Clicking install within entry [data-package-id="${system}"] ...`);
      const clicked = await page.evaluate((sys) => {
        const entry = document.querySelector(`#install-package .entry-list [data-package-id="${sys}"]`);
        if (!entry) return false;
        const btn = entry.querySelector('button.install');
        if (!btn) return false;
        (btn instanceof HTMLElement) && btn.click();
        return true;
      }, system);
      if (!clicked) throw new Error(`Could not click install button for ${system}`);
      console.log(`[V12 System] ✅ Install clicked for ${system}`);

      // Step 6: Wait for install to complete: entry acquires installed class
      console.log(`[V12 System] ⏳ Waiting for installed state in dialog entry...`);
      const installedInDialog = await page.waitForFunction((sys) => {
        const entry = document.querySelector(`#install-package .entry-list [data-package-id="${sys}"]`);
        return !!entry && entry.classList.contains('installed');
      }, { timeout: 600000 }, system) // up to 10 minutes
      .then(() => true)
      .catch(() => false);

      if (!installedInDialog) {
        const diagState = await page.evaluate((sys) => {
          const entry = document.querySelector(`#install-package .entry-list [data-package-id="${sys}"]`);
          return {
            hasEntry: !!entry,
            entryClasses: entry?.className || null,
            buttonDisabled: !!entry?.querySelector('button.install')?.disabled
          };
        }, system);
        throw new Error(`Dialog did not report installed state: ${JSON.stringify(diagState, null, 2)}`);
      }

      // Step 7: Cross-verify on Systems tab
      console.log('[V12 System] 🔄 Verifying installed state on Systems tab...');
      await page.evaluate(() => {
        const systemsTab = document.querySelector('[data-tab="systems"]');
        (systemsTab instanceof HTMLElement) && systemsTab.click();
      });
      await new Promise(r => setTimeout(r, 2000));
      const systemsHasInstalled = await page.evaluate((sys) => {
        const el = document.querySelector(`#systems [data-package-id="${sys}"]`);
        return { present: !!el, classes: el?.className || null };
      }, system);
      console.log('[V12 System] 📊 Systems tab installed check:', JSON.stringify(systemsHasInstalled, null, 2));

      if (!systemsHasInstalled.present) {
        throw new Error(`${system} installation may not have reflected in Systems tab`);
      }

      console.log(`[V12 System] ✅ ${system} system installed and verified`);
      
      // Attempt to close the dialog if still open
      try {
        await page.evaluate(() => {
          const win = document.querySelector('#install-package');
          const close = win?.querySelector('.header-button, .header-control, .close, [data-action="close"]');
          (close instanceof HTMLElement) && close.click();
        });
      } catch {}
      
      return { success: true };
      
    } catch (error) {
      // Log scoped dialog HTML for postmortem
      try {
        const snapshot = await page.evaluate(() => {
          const dialog = document.querySelector('#install-package');
          const html = dialog?.outerHTML || null;
          return html ? html.slice(0, 5000) : null;
        });
        if (snapshot) console.log('[V12 System] 🧩 Dialog HTML snapshot (truncated):', snapshot);
      } catch {}
      return { success: false, error: error.message };
    }
  }
}
