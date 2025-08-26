/**
 * EULA handling module for v12
 * Extracted from working monolithic bootstrap-runner.js
 */

export class EULAHandlingV12 {
  static meta = { name: 'eula-handling', description: 'Accept EULA if present' };
  async handleEULA(page) {
    console.log('[V12 EULA] 📝 Checking for EULA...');
    
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
      
      console.log(`[V12 EULA] 📍 EULA check:`, JSON.stringify(eulaCheck, null, 2));
      
      if (eulaCheck.detected) {
        console.log('[V12 EULA] 📍 EULA detected, accepting agreement...');
        
        // Accept EULA (same logic as working POC)
        const result = await page.evaluate(() => {
          try {
            // Look for the EULA agreement checkbox
            const eulaCheckbox = document.querySelector('#eula-agree, input[name="eula-agree"], input[type="checkbox"]');
            if (eulaCheckbox) {
              eulaCheckbox.checked = true;
              console.log('[V12 EULA] EULA checkbox checked');
            }
            
            // Look for the sign/accept button
            const signButton = document.querySelector('#sign, button[name="sign"], button[data-action*="sign"]');
            if (signButton) {
              signButton.click();
              console.log('[V12 EULA] EULA sign button clicked');
              return { success: true, method: 'button_click' };
            }
            
            // Try to find any button that might accept the EULA
            const buttons = Array.from(document.querySelectorAll('button'));
            for (const button of buttons) {
              const text = button.textContent.toLowerCase();
              if (text.includes('sign') || text.includes('accept') || text.includes('agree') || text.includes('continue')) {
                button.click();
                console.log(`[V12 EULA] EULA button clicked: ${button.textContent}`);
                return { success: true, method: 'text_search_click' };
              }
            }
            
            return { success: false, reason: 'no_eula_button_found' };
          } catch (error) {
            return { success: false, reason: error.message };
          }
        });
        
        if (result.success) {
          console.log('[V12 EULA] ✅ EULA accepted successfully');
          
          // Wait for EULA processing
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          return result;
        } else {
          return result;
        }
      } else {
        return { success: false, error: 'No EULA detected when it should be present' };
      }
      
    } catch (error) {
      return { success: false, error: `EULA check failed: ${error.message}` };
    }
  }

  async handleEULAOnSetupPage(page, config) {
    console.log('[V12 EULA] 📝 Checking for EULA on setup page...');
    
    try {
      // Wait for EULA to appear dynamically on setup page (like POC does)
      await page.waitForFunction(() => {
        const bodyText = document.body.textContent || '';
        return bodyText.includes('End User License Agreement') || 
               bodyText.includes('EULA') || 
               bodyText.includes('License Agreement') ||
               bodyText.includes('please sign the End User License Agreement');
      }, { timeout: config?.bootstrap?.timeouts?.eulaSetupPage ?? 30000 });
      
      console.log('[V12 EULA] 📍 EULA appeared on setup page, accepting agreement...');
      
      // Wait for EULA form to be fully rendered
      const eulaFormTimeout = config?.bootstrap?.timeouts?.eulaFormRender ?? 2000;
      await new Promise(resolve => setTimeout(resolve, eulaFormTimeout));
      
      // Handle EULA agreement on setup page
      const eulaResult = await this.handleEULA(page, config);
      if (eulaResult.success) {
        console.log('[V12 EULA] ✅ EULA accepted on setup page');
        
        // Wait for EULA processing
        const eulaProcessingTimeout = config?.bootstrap?.timeouts?.eulaProcessing ?? 5000;
        await new Promise(resolve => setTimeout(resolve, eulaProcessingTimeout));
        
        return { success: true };
      } else {
        return { success: false, error: eulaResult.error };
      }
    } catch (e) {
      return { success: false, error: 'No EULA appeared on setup page when it should be present' };
    }
  }
}
