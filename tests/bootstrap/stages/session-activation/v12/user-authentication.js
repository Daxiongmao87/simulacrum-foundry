/**
 * User authentication module for v12
 * Extracted from working monolithic bootstrap-runner.js
 */

export class UserAuthenticationV12 {
  static meta = { name: 'user-authentication', description: 'Authenticate Gamemaster if needed' };
  async authenticateIfNeeded(page, config) {
    console.log('[V12 Auth] 📍 Checking if user authentication is required...');
    
    try {
      const joinPageUrl = page.url();
      if (joinPageUrl.includes('/join')) {
        console.log('[V12 Auth] 📍 Join page detected, handling user authentication...');
        
        // Wait for join form to load with retry
        console.log('[V12 Auth] 📍 Waiting for join form to load...');
        let userSelect = null;
        for (let i = 0; i < 10; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          userSelect = await page.$('select[name="userid"]');
          if (userSelect) {
            console.log(`[V12 Auth] ✅ User dropdown found after ${i + 1} attempts`);
            break;
          }
          console.log(`[V12 Auth] 🔄 Attempt ${i + 1}: User dropdown not found, retrying...`);
        }
        
        // Look for user selection dropdown (exactly like working POC)
        console.log('[V12 Auth] 📍 Looking for user selection dropdown...');
        
        // Debug what's actually on the page
        const pageContent = await page.evaluate(() => {
          return {
            url: window.location.href,
            hasUserSelect: !!document.querySelector('select[name="userid"]'),
            allSelects: Array.from(document.querySelectorAll('select')).map(s => ({
              name: s.name,
              id: s.id,
              className: s.className
            })),
            bodyText: document.body.innerText.slice(0, 500)
          };
        });
        console.log('[V12 Auth] 📊 Page debug info:', JSON.stringify(pageContent, null, 2));
        
        // userSelect already found in retry loop above
        
        if (userSelect) {
          console.log('[V12 Auth] ✅ User selection dropdown found, selecting GameMaster...');
          // Get available users and select GameMaster if available (exactly like working POC)
          const userOptions = await page.evaluate(() => {
            const select = document.querySelector('select[name="userid"]');
            if (select) {
              return Array.from(select.options).map(opt => ({
                value: opt.value,
                text: opt.textContent?.trim(),
                disabled: opt.disabled
              }));
            }
            return [];
          });
          
          console.log('[V12 Auth] 📊 Available users:', JSON.stringify(userOptions, null, 2));
          
          // Look for GameMaster user (exactly like working POC)
          const gameMasterOption = userOptions.find(opt => 
            opt.text?.toLowerCase().includes('gamemaster') || 
            opt.text?.toLowerCase().includes('game master') ||
            opt.text?.toLowerCase().includes('gm')
          );
          
          if (gameMasterOption) {
            await page.select('select[name="userid"]', gameMasterOption.value);
            console.log(`[V12 Auth] ✅ Selected user: ${gameMasterOption.text}`);
          } else {
            // Select first available user (exactly like working POC)
            const firstUser = userOptions.find(opt => opt.value && !opt.disabled);
            if (firstUser) {
              await page.select('select[name="userid"]', firstUser.value);
              console.log(`[V12 Auth] ✅ Selected first available user: ${firstUser.text}`);
            } else {
              throw new Error('No available users found in dropdown');
            }
          }
        } else {
          throw new Error('User selection dropdown not found');
        }
        
        // Fill in password (empty for default setup) (exactly like working POC)
        await page.type('input[name="password"], input[type="password"]', '');
        console.log('[V12 Auth] ✅ Password filled (empty)');
        
        // Submit the form (exactly like working POC)
        const authSubmitClicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const button = buttons.find(btn => 
            btn.type === 'submit' || 
            btn.textContent?.includes('Join') || 
            btn.textContent?.includes('Enter')
          );
          if (button) {
            button.click();
            return true;
          }
          return false;
        });
        
        if (authSubmitClicked) {
          console.log('[V12 Auth] ✅ Authentication form submitted');
        } else {
          throw new Error('Authentication submit button not found');
        }
        
        // Wait for authentication to process (exactly like working POC)
        await new Promise(resolve => setTimeout(resolve, 60000));
        
        // Check if we were redirected to the game (exactly like working POC)
        const newUrl = page.url();
        if (newUrl.includes('/game')) {
          console.log('[V12 Auth] ✅ Successfully authenticated and redirected to game world');
        } else {
          console.log(`[V12 Auth] 📍 Still on ${newUrl}, waiting longer for authentication...`);
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
        
        return { success: true };
      } else {
        return { success: false, error: 'Not on join page when authentication should be required' };
      }
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
