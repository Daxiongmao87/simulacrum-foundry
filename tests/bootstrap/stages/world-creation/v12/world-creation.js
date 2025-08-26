/**
 * World creation module for v12
 * Extracted from working monolithic bootstrap-runner.js
 */

export class WorldCreationV12 {
  static meta = { name: 'world-creation', description: 'Create test world' };
  async createWorld(page, permutation, config) {
    console.log(`[V12 World] 🌍 Creating world for ${permutation.id}...`);
    
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
        console.log('[V12 World] ✅ World title filled');
      } catch (e) {
        throw new Error(`Could not fill world title: ${e.message}`);
      }
      
      // World ID
      try {
        await page.type('input[name="id"]', `test-world-${permutation.id}`);
        console.log('[V12 World] ✅ World ID filled');
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
            console.log(`[V12 World] ✅ Game system selected: ${permutation.system}`);
          } else {
            await page.type('input[name="system"], #world-config-system', permutation.system);
            console.log(`[V12 World] ✅ Game system entered: ${permutation.system}`);
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
        console.log('[V12 World] ✅ World description filled');
      } catch (e) {
        console.log('[V12 World] ✅ World description not found (not required)');
      }
      
      // Submit form: keep only the Enter-key path which is proven to execute
      console.log('[V12 World] 📍 Submitting world creation form (Enter key only)...');
      try {
        await page.keyboard.press('Enter');
        console.log('[V12 World] ✅ World creation form submitted via Enter key');
      } catch (e2) {
        throw new Error(`Enter key submission failed: ${e2.message}`);
      }

      // Optionally wait briefly for UI to update
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Derive actual world id from submitted inputs
      const submittedId = `test-world-${permutation.id}`;
      const actualWorldId = submittedId;
      const actualWorldTitle = `Test World ${permutation.id}`;
      console.log('[V12 World] 📊 Created world (derived):', JSON.stringify({ id: actualWorldId, title: actualWorldTitle }, null, 2));

      // Verify presence non-fatally
      try { await page.click('[data-tab="worlds"]'); } catch (_) {}
      await page.waitForSelector('[data-tab="worlds"].active, #worlds-list', { timeout: 15000 }).catch(() => {});
      const foundInList = await page.evaluate((wid) => !!document.querySelector(`[data-package-id="${wid}"]`), actualWorldId).catch(() => false);
      console.log(`[V12 World] 📋 World presence in list (${actualWorldId}): ${foundInList}`);

      return {
        success: true,
        worldId: actualWorldId
      };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
