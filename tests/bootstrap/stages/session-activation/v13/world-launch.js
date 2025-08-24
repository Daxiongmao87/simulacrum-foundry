/**
 * World launch module for v13
 * Extracted from working monolithic bootstrap-runner.js
 */

export class WorldLaunchV13 {
  static meta = { name: 'world-launch', description: 'Launch created world' };
  async launchWorld(page, worldId, port, config) {
    console.log(`[V13 Launch] 🚀 Launching world: ${worldId}`);
    
    try {
      // Navigate back to worlds tab (exactly like working POC)
      console.log('[V13 Launch] 📍 Navigating back to worlds tab...');
      await page.click('[data-tab="worlds"]');
      
      // Wait for worlds tab content and ensure we're actually on the worlds tab
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify we're on the worlds tab by checking for world-specific elements
      const onWorldsTab = await page.evaluate(() => {
        // Look for elements that indicate we're on the worlds tab
        const worldsTabActive = document.querySelector('[data-tab="worlds"].active');
        const worldElements = document.querySelectorAll('.world-item, [data-package-type="world"]');
        const hasWorldsContent = document.body.textContent?.includes('Create World') || 
                                document.body.textContent?.includes('Launch World');
        
        return {
          tabActive: !!worldsTabActive,
          worldElementsCount: worldElements.length,
          hasWorldsContent,
          currentUrl: window.location.href
        };
      });
      
      console.log('[V13 Launch] 📊 Worlds tab verification:', JSON.stringify(onWorldsTab, null, 2));
      
      // Now find and click the launch button for the specific world (exactly like working POC)
      console.log(`[V13 Launch] 📍 Looking for Launch World button for ${worldId}...`);
      
      const launchClicked = await page.evaluate((worldId) => {
        // Find the world element for the specific world - be more flexible in searching
        const worldElements = Array.from(document.querySelectorAll('[data-package-id], .package-tile, .world-item, .package'));
        
        // First try to find by exact world ID
        let targetWorldElement = worldElements.find(el => 
          el.getAttribute('data-package-id') === worldId
        );
        
        // If not found, try to find by text content containing "Test World"
        if (!targetWorldElement) {
          targetWorldElement = worldElements.find(el => 
            el.textContent?.includes('Test World') && 
            (el.textContent?.includes('v13-dnd5e') || el.textContent?.includes('v13-pf2e'))
          );
        }
        
        // If still not found, try to find any element with the world ID in text
        if (!targetWorldElement) {
          targetWorldElement = worldElements.find(el => 
            el.textContent?.includes(worldId)
          );
        }
        
        if (targetWorldElement) {
          // Look for the launch button within this world element or its parent
          const launchButton = targetWorldElement.querySelector('[data-action="worldLaunch"]') ||
                              targetWorldElement.parentElement?.querySelector('[data-action="worldLaunch"]') ||
                              targetWorldElement.closest('.package')?.querySelector('[data-action="worldLaunch"]');
          
          if (launchButton) {
            launchButton.click();
            console.log(`[V13 Launch] Found and clicked worldLaunch button for ${worldId}`);
            return true;
          } else {
            console.log(`[V13 Launch] ${worldId} element found but no worldLaunch button found within it`);
            console.log(`[V13 Launch] Element HTML: ${targetWorldElement.outerHTML.substring(0, 200)}`);
            return false;
          }
        } else {
          console.log(`[V13 Launch] ${worldId} element not found in DOM`);
          return false;
        }
      }, worldId);
      
      if (launchClicked) {
        console.log(`[V13 Launch] ✅ Launch World button clicked for ${worldId}`);
        
        // Wait for game world to load
        console.log('[V13 Launch] 📍 Waiting for game world to load...');
        
        // Set up console log listener for game canvas ready
        const gameLoadedPromise = new Promise((resolve) => {
          const listener = (msg) => {
            const text = msg.text();
            if (text.includes('Foundry VTT | Drawing game canvas for scene')) {
              console.log('[V13 Launch] ✅ Game canvas ready - world fully loaded');
              page.off('console', listener);
              resolve();
            }
          };
          page.on('console', listener);
          
          // Timeout fallback after 60 seconds
          setTimeout(() => {
            page.off('console', listener);
            console.log('[V13 Launch] ⚠️ Timeout waiting for game canvas - continuing anyway');
            resolve();
          }, 60000);
        });
        
        await gameLoadedPromise;
        
        return { success: true };
      } else {
        console.log(`[V13 Launch] ⚠️ Launch World button not found for ${worldId}`);
        
        // Debug what world elements actually exist (exactly like working POC)
        const worldDebug = await page.evaluate(() => {
          const worldElements = Array.from(document.querySelectorAll('[data-package-id], .package-tile, .world-item, .package'));
          return worldElements.map(el => ({
            tagName: el.tagName,
            id: el.id,
            className: el.className,
            dataPackageId: el.getAttribute('data-package-id'),
            textContent: el.textContent?.substring(0, 100),
            launchButtons: Array.from(el.querySelectorAll('[data-action="worldLaunch"]')).length
          }));
        });
        
        console.log('[V13 Launch] 📊 Available world elements:', JSON.stringify(worldDebug, null, 2));
        throw new Error(`Could not find Launch World button for ${worldId}`);
      }
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
