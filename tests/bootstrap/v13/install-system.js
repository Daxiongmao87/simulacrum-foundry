/**
 * Install system module for v13
 * Extracted from working monolithic bootstrap-runner.js
 */

export class SystemInstallerV13 {
  static meta = { name: 'install-system', description: 'Install configured game system' };
  async installSystem(page, system) {
    console.log(`[V13 System] 🎲 Installing system: ${system}`);
    
    try {
      // Step 1: Wait for setup page to be fully ready (exactly like working POC)
      console.log('[V13 System] 📍 Waiting for setup page to be fully ready...');
      
      // Wait for setup page to load - be more flexible about what constitutes "ready" (exactly like working POC)
      await page.waitForFunction(() => {
        // Check for any setup-related elements (exactly like working POC)
        const hasSetupElements = !!document.querySelector('.setup-menu, .setup-packages, [data-tab], .setup-packages-systems, .setup-packages-worlds');
        const hasGameObject = typeof window.game !== 'undefined';
        const hasAnyContent = document.body.textContent && document.body.textContent.length > 100;
        
        return hasSetupElements || hasGameObject || hasAnyContent;
      }, { timeout: 60000 });
      
      console.log('[V13 System] ✅ FoundryVTT setup page is ready');
      
      // Step 2: Click "Install System" button (exactly like working POC)
      console.log('[V13 System] 📍 Step 4: Clicking Install System button...');
      
      // First, let's see what buttons are actually available (exactly like working POC)
      const availableButtons = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.map(btn => ({
          text: btn.textContent?.trim(),
          className: btn.className,
          id: btn.id,
          type: btn.type
        }));
      });
      console.log('[V13 System] 📊 Available buttons:', JSON.stringify(availableButtons, null, 2));
      
      const installSystemClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const button = buttons.find(btn => btn.textContent?.includes('Install System'));
        if (button) {
          button.click();
          return true;
        }
        return false;
      });
      
      if (installSystemClicked) {
        console.log('[V13 System] ✅ Install System button clicked');
      } else {
        throw new Error('Install System button not found');
      }
      
      // Wait for system installation dialog
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Step 3: Look for available packages (no search filter needed)
      console.log(`[V13 System] 📍 Looking for available packages...`);
      
      // Wait a moment for packages to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Debug: Show all available packages after search
      const allPackages = await page.evaluate(() => {
        const packageElements = Array.from(document.querySelectorAll('[data-package-id], .package, .package-tile'));
        return packageElements.map(el => ({
          packageId: el.getAttribute('data-package-id'),
          textContent: el.textContent?.substring(0, 100),
          className: el.className
        }));
      });
      console.log(`[V13 System] 📊 All packages found after searching for "${system}":`, JSON.stringify(allPackages, null, 2));
      
      // Step 4: Find and click Install button for the specific system
      console.log(`[V13 System] 📍 Looking for ${system} package specifically...`);
      
      const packageResult = await page.evaluate((systemName) => {
        // Look for package elements that might contain the system
        const packageElements = Array.from(document.querySelectorAll('[data-package-id], .package, .package-tile'));
        
        for (const element of packageElements) {
          const text = element.textContent || '';
          const packageId = element.getAttribute('data-package-id');
          
          // Look for the specific system
          if (text.toLowerCase().includes(systemName.toLowerCase()) || 
              packageId === systemName) {
            
            // Find the install button within this package
            const installButton = element.querySelector('button.install-package, button[data-action*="install"]');
            
            if (installButton) {
              return {
                found: true,
                packageId: packageId,
                title: text.substring(0, 100),
                installButton: true
              };
            }
          }
        }
        
        return { found: false };
      }, system);
      
      console.log(`[V13 System] 📊 ${system} package search result:`, JSON.stringify(packageResult, null, 2));
      
      if (!packageResult.found) {
        throw new Error(`${system} package not found in search results`);
      }
      
      // Step 5: Click the install button
      console.log(`[V13 System] 📍 Clicking Install button for ${system}...`);
      
      const installClicked = await page.evaluate((systemName) => {
        const packageElements = Array.from(document.querySelectorAll('[data-package-id], .package, .package-tile'));
        
        for (const element of packageElements) {
          const text = element.textContent || '';
          const packageId = element.getAttribute('data-package-id');
          
          if (text.toLowerCase().includes(systemName.toLowerCase()) || 
              packageId === systemName) {
            
            const installButton = element.querySelector('button.install-package, button[data-action*="install"]');
            
            if (installButton) {
              installButton.click();
              return true;
            }
          }
        }
        
        return false;
      }, system);
      
      if (!installClicked) {
        throw new Error(`Could not click install button for ${system}`);
      }
      
      console.log(`[V13 System] ✅ Install button clicked for ${system}`);
      
      // Step 6: Wait for installation to complete
      console.log(`[V13 System] ⏳ Waiting for ${system} installation to complete...`);
      
      await page.waitForFunction((systemName) => {
        const bodyText = document.body.textContent || '';
        return bodyText.includes(`System ${systemName} was installed successfully`) ||
               bodyText.includes(`${systemName} was installed successfully`) ||
               bodyText.includes('was installed successfully');
      }, { timeout: 900000 }, system);
      
      console.log(`[V13 System] ✅ ${system} system installed successfully`);
      
      // Step 7: Close dialog
      try {
        await page.click('.header-control.icon.fa-solid.fa-xmark');
        console.log('[V13 System] ✅ Dialog closed');
      } catch (e) {
        console.log('[V13 System] ⚠️ Could not close dialog, continuing...');
      }
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
