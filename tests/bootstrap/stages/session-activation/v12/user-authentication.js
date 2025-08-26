/**
 * User authentication module for v12
 * Extracted from working monolithic bootstrap-runner.js
 */

export class UserAuthenticationV12 {
  static meta = { name: 'user-authentication', description: 'Authenticate Gamemaster if needed' };
  async authenticateIfNeeded(page, config) {
    console.log('Simulacrum | [V12 Auth] 📍 Checking if user authentication is required...');
    
    try {
      // Check if we're already in the game
      const onGameAlready = await page.evaluate(() => window.location.pathname.includes('/game'));
      if (onGameAlready) {
        console.log('Simulacrum | [V12 Auth] ✅ Already in game, no authentication needed');
        return { success: true };
      }

      // Check if we're on a join page
      const joinPageUrl = page.url();
      if (joinPageUrl.includes('/join') || document.querySelector('select[name="userid"]')) {
        console.log('Simulacrum | [V12 Auth] 📍 Join page detected, handling user authentication...');
        
        // Use the working logic from World Launch script
        console.log('Simulacrum | [V12 Auth] 👤 Join screen detected, selecting user and submitting...');
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
          
          if (form && form.requestSubmit) { 
            form.requestSubmit(); 
            return { success: true, method: 'requestSubmit' }; 
          }
          if (button instanceof HTMLElement) { 
            button.click(); 
            return { success: true, method: 'button_click' }; 
          }
          if (form) { 
            form.submit(); 
            return { success: true, method: 'form_submit' }; 
          }
          
          return { success: false, reason: 'no_submit' };
        });
        
        console.log('Simulacrum | [V12 Auth] 📊 Join submit result:', JSON.stringify(joined, null, 2));
        
        if (!joined.success) {
          throw new Error(`Join submission failed: ${joined.reason}`);
        }

        // Wait for navigation into the game route or canvas readiness (same as World Launch)
        console.log('Simulacrum | [V12 Auth] ⏳ Waiting for navigation to game...');
        await Promise.race([
          page.waitForFunction(() => window.location.pathname.includes('/game'), { timeout: 120000 }),
          new Promise((resolve) => {
            const listener = (msg) => {
              try { 
                const text = msg.text(); 
                if (text.includes('Drawing game canvas')) { 
                  resolve(); 
                } 
              } catch {}
            };
            page.on('console', listener);
            setTimeout(() => { page.off('console', listener); resolve(); }, 120000);
          })
        ]);

        console.log('Simulacrum | [V12 Auth] ✅ Successfully authenticated and navigated to game world');
        return { success: true };
        
      } else {
        // Not on join page and not in game - this might be an error
        console.log('Simulacrum | [V12 Auth] ⚠️ Not on join page and not in game, checking current state...');
        const currentState = await page.evaluate(() => ({
          url: window.location.href,
          pathname: window.location.pathname,
          hasUserSelect: !!document.querySelector('select[name="userid"]'),
          hasJoinForm: !!document.querySelector('#join-game-form'),
          inGame: window.location.pathname.includes('/game')
        }));
        console.log('Simulacrum | [V12 Auth] 📊 Current page state:', JSON.stringify(currentState, null, 2));
        
        // If we're somehow already authenticated, return success
        if (currentState.inGame) {
          console.log('Simulacrum | [V12 Auth] ✅ Already in game, no authentication needed');
          return { success: true };
        }
        
        return { success: false, error: `Unexpected page state: ${currentState.pathname}` };
      }
      
    } catch (error) {
      console.error('[V12 Auth] ❌ Authentication error:', error);
      return { success: false, error: error.message };
    }
  }
}
