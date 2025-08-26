/**
 * Enable module module for v12
 * Extracted from working monolithic bootstrap-runner.js
 */

export class EnableModuleV12 {
  static meta = { name: 'enable-module', description: 'Enable Simulacrum module' };
  async enableModule(page, config) {
    try {
      console.log('[V12 Module] 🚀 Starting module enable process...');
      
      // Open Settings sidebar tab
      console.log('[V12 Module] 📍 Opening Settings sidebar tab...');
      await page.waitForSelector('#sidebar-tabs a[data-tab="settings"]', { timeout: 20000 });
      console.log('[V12 Module] ✅ Settings tab selector found');
      
      await page.evaluate(() => {
        const tab = document.querySelector('#sidebar-tabs a[data-tab="settings"]');
        (tab instanceof HTMLElement) && tab.click();
      });
      console.log('[V12 Module] ✅ Settings tab clicked');
      
      await page.waitForSelector('#settings', { timeout: 20000 });
      console.log('[V12 Module] ✅ Settings panel loaded');

      // Click "Manage Modules"
      console.log('[V12 Module] 📍 Clicking Manage Modules...');
      await page.waitForSelector('#settings button[data-action="modules"]', { timeout: 20000 });
      console.log('[V12 Module] ✅ Manage Modules button found');
      
      await page.evaluate(() => {
        const btn = document.querySelector('#settings button[data-action="modules"]');
        (btn instanceof HTMLElement) && btn.click();
      });
      console.log('[V12 Module] ✅ Manage Modules button clicked');

      // Wait for Module Management window
      console.log('[V12 Module] 📍 Waiting for Module Management window...');
      await page.waitForSelector('#module-management', { timeout: 30000 });
      console.log('[V12 Module] ✅ Module Management window loaded');
      
      await page.waitForSelector('#module-management #module-list', { timeout: 30000 });
      console.log('[V12 Module] ✅ Module list loaded');

      // Filter to simulacrum to be safe
      console.log('[V12 Module] 🔎 Filtering for simulacrum module...');
      const filterResult = await page.evaluate(() => {
        const input = document.querySelector('#module-management input[name="search"]');
        if (input) {
          input.value = 'simulacrum';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return { found: true, value: input.value };
        }
        return { found: false };
      });
      console.log('[V12 Module] ✅ Filter applied:', filterResult);

      // Check the simulacrum module checkbox
      console.log('[V12 Module] 📍 Enabling Simulacrum module checkbox...');
      const moduleEnabled = await page.evaluate(() => {
        const row = document.querySelector('#module-management [data-module-id="simulacrum"]');
        console.log('[V12 Module] 🔍 Looking for module row:', row);
        
        if (!row) {
          // Try alternative selectors
          const altRow = document.querySelector('#module-management tr:has(input[name="simulacrum"])');
          console.log('[V12 Module] 🔍 Alternative row selector:', altRow);
          
          if (altRow) {
            const checkbox = altRow.querySelector('input.active[name="simulacrum"]');
            console.log('[V12 Module] 🔍 Found checkbox via alt selector:', checkbox);
            if (checkbox) {
              checkbox.checked = true;
              checkbox.dispatchEvent(new Event('change', { bubbles: true }));
              return { found: true, method: 'alternative' };
            }
          }
          
          // List all available modules for debugging
          const allModules = Array.from(document.querySelectorAll('#module-management tr')).map(tr => {
            const id = tr.getAttribute('data-module-id') || 'no-id';
            const name = tr.textContent.trim().substring(0, 50);
            return { id, name };
          });
          console.log('[V12 Module] 🔍 All available modules:', allModules);
          
          return { found: false, availableModules: allModules };
        }
        
        const checkbox = row.querySelector('input.active[name="simulacrum"]');
        console.log('[V12 Module] 🔍 Found checkbox via primary selector:', checkbox);
        
        if (!checkbox) {
          // Try to find any checkbox in the row
          const anyCheckbox = row.querySelector('input[type="checkbox"]');
          console.log('[V12 Module] 🔍 Any checkbox in row:', anyCheckbox);
          if (anyCheckbox) {
            anyCheckbox.checked = true;
            anyCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
            return { found: true, method: 'any-checkbox' };
          }
        } else {
          checkbox.checked = true;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          return { found: true, method: 'primary' };
        }
        
        return { found: false };
      });

      console.log('[V12 Module] ✅ Module enable attempt result:', moduleEnabled);

      if (!moduleEnabled.found) {
        throw new Error(`Simulacrum module checkbox not found in Module Management. Available modules: ${JSON.stringify(moduleEnabled.availableModules || [])}`);
      }

      // Save module settings
      console.log('[V12 Module] 💾 Saving module settings...');
      const saveClicked = await page.evaluate(() => {
        const btn = document.querySelector('#module-management button[type="submit"]');
        console.log('[V12 Module] 🔍 Save button found:', btn);
        if (btn instanceof HTMLElement) { 
          btn.click(); 
          return true; 
        }
        return false;
      });
      console.log('[V12 Module] ✅ Save button clicked:', saveClicked);
      
      if (!saveClicked) throw new Error('Save Module Settings button not found');

      // Reload confirmation is mandatory in v12
      console.log('[V12 Module] 🔁 Waiting for reload confirmation dialog...');
      const confirmAppeared = await page.waitForFunction(() => !!document.getElementById('reload-world-confirm'), { timeout: 15000 }).then(() => true).catch(() => false);
      console.log('[V12 Module] ✅ Reload confirmation dialog appeared:', confirmAppeared);
      
      if (!confirmAppeared) {
        throw new Error('Reload confirmation dialog not detected');
      }

      console.log('[V12 Module] 📍 Confirming reload (Yes)...');
      const clickedYes = await page.evaluate(() => {
        const dlg = document.getElementById('reload-world-confirm');
        const yesBtn = dlg?.querySelector('button[data-action="yes"]');
        console.log('[V12 Module] 🔍 Yes button found:', yesBtn);
        if (yesBtn instanceof HTMLElement) { 
          yesBtn.click(); 
          return true; 
        }
        return false;
      });
      console.log('[V12 Module] ✅ Yes button clicked:', clickedYes);
      
      if (!clickedYes) throw new Error('Failed to click Yes on reload confirmation');

      // Wait for Foundry to reinitialize (mirror v13 approach)
      console.log('[V12 Module] ⏳ Waiting for FoundryVTT to reinitialize after module activation...');
      const foundryLoadedPromise = new Promise((resolve) => {
        const listener = (msg) => {
          try {
            const text = msg.text();
            console.log('[V12 Module] 📝 Console message:', text);
            if (text.includes('Foundry VTT | Drawing game canvas for scene')) {
              console.log('[V12 Module] ✅ FoundryVTT game canvas ready - full initialization complete');
              page.off('console', listener);
              resolve();
            }
          } catch {}
        };
        page.on('console', listener);
        setTimeout(() => { 
          console.log('[V12 Module] ⏰ Timeout reached for FoundryVTT initialization');
          page.off('console', listener); 
          resolve(); 
        }, 30000);
      });
      await foundryLoadedPromise;

      // Grace period like v13
      console.log('[V12 Module] 📍 Waiting 10 seconds grace period for full initialization...');
      await new Promise(resolve => setTimeout(resolve, 10000));

      console.log('[V12 Module] ✅ Module activation reload complete (mandatory-confirm)');
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to enable Simulacrum module:', error.message);
      console.error('❌ Full error details:', error);
      return { success: false, error: error.message };
    }
  }
}
