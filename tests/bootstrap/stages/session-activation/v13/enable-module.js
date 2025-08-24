/**
 * Enable module module for v13
 * Extracted from working monolithic bootstrap-runner.js
 */

export class EnableModuleV13 {
  static meta = { name: 'enable-module', description: 'Enable Simulacrum module' };
  async enableModule(page, config) {
    try {
      // Step 37: Click the settings button
      console.log('[V13 Module] 📍 Clicking settings button...');
      await page.click('.ui-control.plain.icon.fa-solid.fa-gears');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Step 38: Click "Manage Modules" button
      console.log('[V13 Module] 📍 Clicking Manage Modules...');
      const manageModulesClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const manageModulesButton = buttons.find(btn => 
          btn.textContent && btn.textContent.includes('Manage Modules')
        );
        if (manageModulesButton) {
          manageModulesButton.click();
          return true;
        }
        return false;
      });
      
      if (!manageModulesClicked) {
        throw new Error('Could not find Manage Modules button');
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Step 39: Enable simulacrum module checkbox
      console.log('[V13 Module] 📍 Enabling Simulacrum module checkbox...');
      const moduleEnabled = await page.evaluate(() => {
        const simulacrumCheckbox = document.querySelector('input[name="simulacrum"]');
        if (simulacrumCheckbox) {
          simulacrumCheckbox.checked = true;
          simulacrumCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      });
      
      if (!moduleEnabled) {
        throw new Error('Could not find or enable Simulacrum module checkbox');
      }
      
      // Step 40: Click "Save Module Settings" button
      console.log('[V13 Module] 📍 Saving module settings...');
      const saveClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const saveButton = buttons.find(btn => 
          btn.textContent && btn.textContent.includes('Save Module Settings')
        );
        if (saveButton) {
          saveButton.click();
          return true;
        }
        return false;
      });
      
      if (!saveClicked) {
        throw new Error('Could not find Save Module Settings button');
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Step 41: Click "Yes" to confirm - this will trigger a full page reload!
      console.log('[V13 Module] 📍 Confirming module activation (this will reload the page)...');
      const confirmClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const yesButton = buttons.find(btn => 
          btn.textContent && btn.textContent.trim() === 'Yes'
        );
        if (yesButton) {
          yesButton.click();
          return true;
        }
        return false;
      });
      
      if (!confirmClicked) {
        throw new Error('Could not find Yes confirmation button');
      }
      
      // Wait for the page to reload and FoundryVTT to reinitialize
      console.log('[V13 Module] 📍 Waiting for FoundryVTT to reinitialize after module activation...');
      
      // Set up console log listener for FoundryVTT initialization
      const foundryLoadedPromise = new Promise((resolve) => {
        const listener = (msg) => {
          const text = msg.text();
          if (text.includes('Foundry VTT | Drawing game canvas for scene')) {
            console.log('[V13 Module] ✅ FoundryVTT game canvas ready - full initialization complete');
            page.off('console', listener);
            resolve();
          }
        };
        page.on('console', listener);
        setTimeout(() => {
          page.off('console', listener);
          console.log('[V13 Module] ⚠️ Timeout waiting for FoundryVTT initialization log');
          resolve();
        }, 30000);
      });
      
      await foundryLoadedPromise;
      
      // 10 second grace period for everything to settle
      console.log('[V13 Module] 📍 Waiting 10 seconds grace period for full initialization...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      console.log('[V13 Module] ✅ Module activation reload complete');
      console.log('[V13 Module] ✅ Simulacrum module enabled in settings - module initialization will be verified by integration tests');
      return { success: true };
      
    } catch (error) {
      console.error('❌ Failed to enable Simulacrum module:', error.message);
      return { success: false, error: error.message };
    }
  }
}
