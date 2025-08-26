/**
 * World creation module for v13
 * Extracted from working monolithic bootstrap-runner.js
 */

export class WorldCreationV13 {
  static meta = { name: 'world-creation', description: 'Create test world' };
  async createWorld(page, permutation, config) {
    console.log(`[V13 World] 🌍 Creating world for ${permutation.id}...`);
    
    try {
      // Navigate to worlds tab
      await page.click('[data-tab="worlds"]');
      
      // Click Create World (using working POC approach)
      const createWorldClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const button = buttons.find(btn => btn.textContent?.includes('Create World'));
        if (button) {
          button.click();
          return true;
        }
        return false;
      });
      
      if (!createWorldClicked) {
        throw new Error('Create World button not found');
      }
      
      // Wait for form to appear
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Fill world form (exactly like working POC)
      
      // World Title
      try {
        await page.type('input[name="title"]', `Test World ${permutation.id}`);
        console.log('[V13 World] ✅ World title filled');
      } catch (e) {
        throw new Error(`Could not fill world title: ${e.message}`);
      }
      
      // World ID
      try {
        await page.type('input[name="id"]', `test-world-${permutation.id}`);
        console.log('[V13 World] ✅ World ID filled');
      } catch (e) {
        throw new Error(`Could not fill world ID: ${e.message}`);
      }
      
      // Game System - critical for world creation
      try {
        const systemField = await page.$('select[name="system"], input[name="system"], #world-config-system');
        if (systemField) {
          const tagName = await page.evaluate(el => el.tagName, systemField);
          if (tagName === 'SELECT') {
            await page.select('select[name="system"], #world-config-system', permutation.system);
            console.log(`[V13 World] ✅ Game system selected: ${permutation.system}`);
          } else {
            await page.type('input[name="system"], #world-config-system', permutation.system);
            console.log(`[V13 World] ✅ Game system entered: ${permutation.system}`);
          }
        } else {
          throw new Error('Game system field not found');
        }
      } catch (e) {
        throw new Error(`Could not set game system: ${e.message}`);
      }
      
      // Description - optional field
      try {
        await page.type('textarea[name="description"], textarea[placeholder*="description"], textarea[placeholder*="Description"], textarea[name="desc"]', `Test world for ${permutation.description}`);
        console.log('[V13 World] ✅ World description filled');
      } catch (e) {
        console.log('[V13 World] ✅ World description not found (not required)');
      }
      
      // Submit form (exactly like working POC)
      console.log('[V13 World] 📍 Submitting world creation form...');
      
      const submitClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        
        // Look for submit button by type
        let submitButton = buttons.find(btn => btn.type === 'submit');
        if (submitButton) {
          submitButton.click();
          return { success: true, method: 'type_submit' };
        }
        
        // Look for submit button by text
        submitButton = buttons.find(btn => 
          btn.textContent?.includes('Create') || 
          btn.textContent?.includes('Submit') || 
          btn.textContent?.includes('Save')
        );
        if (submitButton) {
          submitButton.click();
          return { success: true, method: 'text_search' };
        }
        
        // Look for button with form attribute
        submitButton = buttons.find(btn => btn.form || btn.getAttribute('form'));
        if (submitButton) {
          submitButton.click();
          return { success: true, method: 'form_attribute' };
        }
        
        return { success: false, reason: 'no_submit_button_found' };
      });
      
      if (submitClicked.success) {
        console.log(`[V13 World] ✅ World creation form submitted via ${submitClicked.method}`);
      } else {
        throw new Error(`Submit button not found: ${submitClicked.reason}`);
      }
      
      // Wait for world creation to complete (exactly like working POC)
      console.log('[V13 World] 📍 Waiting for world creation to complete...');
      await new Promise(resolve => setTimeout(resolve, 45000));
      
      // Check for creation success or error messages (exactly like working POC)
      const creationResult = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        return {
          hasSuccess: bodyText.includes('created') || bodyText.includes('successfully') || bodyText.includes('success'),
          hasError: bodyText.includes('error') || bodyText.includes('failed') || bodyText.includes('invalid'),
          currentUrl: window.location.href,
          bodyLength: bodyText.length
        };
      });
      
      console.log('[V13 World] 📊 World creation result check:', JSON.stringify(creationResult, null, 2));
      
      // Get the actual world ID that was created by looking at the form data
      const actualWorldId = await page.evaluate((permutationId) => {
        // Try to get the world ID from the form that was just submitted
        const titleInput = document.querySelector('input[name="title"]');
        const idInput = document.querySelector('input[name="id"]');
        
        if (titleInput && idInput) {
          return {
            title: titleInput.value,
            id: idInput.value
          };
        }
        
        // If form is gone, try to find the created world in the worlds list
        const worldElements = Array.from(document.querySelectorAll('[data-package-id], .package-tile, .world-item'));
        const createdWorld = worldElements.find(el => 
          el.textContent?.includes('Test World') && 
          el.textContent?.includes(permutationId)
        );
        
        if (createdWorld) {
          return {
            title: createdWorld.textContent?.substring(0, 100),
            id: createdWorld.getAttribute('data-package-id') || 'unknown'
          };
        }
        
        return null;
      }, permutation.id);
      
      console.log('[V13 World] 📊 Actual world ID found:', JSON.stringify(actualWorldId, null, 2));
      
      if (!actualWorldId || !actualWorldId.id) {
        throw new Error('Could not determine the actual world ID that was created');
      }
      
      return { 
        success: true, 
        worldId: actualWorldId.id 
      };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
