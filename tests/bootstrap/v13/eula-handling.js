/**
 * EULA handling module for v13
 * Extracted from working monolithic bootstrap-runner.js
 */

export class EULAHandlingV13 {
  async handleEULA(page) {
    console.log('[V13 EULA] 📝 Checking for EULA...');
    
    try {
      // Check if EULA text appears in body content (like working POC)
      const eulaCheck = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        const hasEulaText = bodyText.includes('End User License Agreement') || 
                           bodyText.includes('EULA') || 
                           bodyText.includes('License Agreement') ||
                           bodyText.includes('please sign the End User License Agreement');
        
        return {
          detected: hasEulaText,
          currentUrl: window.location.href,
          pageTitle: document.title
        };
      });
      
      console.log(`[V13 EULA] 📍 EULA check:`, JSON.stringify(eulaCheck, null, 2));
      
      if (eulaCheck.detected) {
        console.log('[V13 EULA] 📍 EULA detected, accepting agreement...');
        
        // Accept EULA (same logic as working POC)
        const result = await page.evaluate(() => {
          try {
            // Look for the EULA agreement checkbox
            const eulaCheckbox = document.querySelector('#eula-agree, input[name="eula-agree"], input[type="checkbox"]');
            if (eulaCheckbox) {
              eulaCheckbox.checked = true;
              console.log('[V13 EULA] EULA checkbox checked');
            }
            
            // Look for the sign/accept button
            const signButton = document.querySelector('#sign, button[name="sign"], button[data-action*="sign"]');
            if (signButton) {
              signButton.click();
              console.log('[V13 EULA] EULA sign button clicked');
              return { success: true, method: 'button_click' };
            }
            
            // Try to find any button that might accept the EULA
            const buttons = Array.from(document.querySelectorAll('button'));
            for (const button of buttons) {
              const text = button.textContent.toLowerCase();
              if (text.includes('sign') || text.includes('accept') || text.includes('agree') || text.includes('continue')) {
                button.click();
                console.log(`[V13 EULA] EULA button clicked: ${button.textContent}`);
                return { success: true, method: 'text_search_click' };
              }
            }
            
            return { success: false, reason: 'no_eula_button_found' };
          } catch (error) {
            return { success: false, reason: error.message };
          }
        });
        
        if (result.success) {
          console.log('[V13 EULA] ✅ EULA accepted successfully');
          
          // Wait for EULA processing
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          return result;
        } else {
          console.log(`[V13 EULA] ⚠️ EULA acceptance failed: ${result.reason}`);
          return result;
        }
      } else {
        console.log('[V13 EULA] 📍 No EULA detected, continuing to setup...');
        return { success: true, method: 'no_eula' };
      }
      
    } catch (error) {
      console.log(`[V13 EULA] ⚠️ EULA check failed: ${error.message}, continuing...`);
      return { success: true, method: 'error_continue' };
    }
  }

  async handleEULAOnSetupPage(page, config) {
    console.log('[V13 EULA] 📝 Checking for EULA on setup page...');
    
    try {
      // Wait for EULA to appear dynamically on setup page (like POC does)
      await page.waitForFunction(() => {
        const bodyText = document.body.textContent || '';
        return bodyText.includes('End User License Agreement') || 
               bodyText.includes('EULA') || 
               bodyText.includes('License Agreement') ||
               bodyText.includes('please sign the End User License Agreement');
      }, { timeout: config?.bootstrap?.timeouts?.eulaSetupPage ?? 30000 });
      
      console.log('[V13 EULA] 📍 EULA appeared on setup page, accepting agreement...');
      
      // Wait for EULA form to be fully rendered
      const eulaFormTimeout = config?.bootstrap?.timeouts?.eulaFormRender ?? 2000;
      await new Promise(resolve => setTimeout(resolve, eulaFormTimeout));
      
      // Handle EULA agreement on setup page
      const eulaResult = await this.handleEULA(page, config);
      if (eulaResult.success) {
        console.log('[V13 EULA] ✅ EULA accepted on setup page');
        
        // Wait for EULA processing
        const eulaProcessingTimeout = config?.bootstrap?.timeouts?.eulaProcessing ?? 5000;
        await new Promise(resolve => setTimeout(resolve, eulaProcessingTimeout));
        
        return { success: true };
      } else {
        console.log(`[V13 EULA] ⚠️ EULA acceptance failed: ${eulaResult.error}`);
        return { success: false, error: eulaResult.error };
      }
    } catch (e) {
      console.log('[V13 EULA] 📍 No EULA appeared on setup page, continuing...');
      return { success: true, noEula: true };
    }
  }
}
