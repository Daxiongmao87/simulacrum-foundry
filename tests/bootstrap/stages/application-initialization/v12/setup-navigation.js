/**
 * Setup navigation module for v12
 * Extracted from working monolithic bootstrap-runner.js
 */

export class SetupNavigationV12 {
  static meta = { name: 'setup-navigation', description: 'Navigate to setup page' };
  async navigateToSetup(page, port, config) {
    console.log('[V12 Setup] 📍 Navigating to setup page...');
    
    try {
      // Navigate to setup page (EXACTLY like working POC)
      await page.goto(`http://localhost:${port}/setup`, { 
        waitUntil: 'domcontentloaded', 
        timeout: config.puppeteer.timeout 
      });
      console.log('[V12 Setup] 📍 Navigated to setup page');
      
      // Wait for setup page to be ready (EXACTLY like working POC)
      console.log('[V12 Setup] 📍 Waiting for setup page to be ready...');
      await page.waitForFunction(() => {
        // Check for any setup-related elements
        const hasSetupElements = !!document.querySelector('.setup-menu, .setup-packages, [data-tab], .setup-packages-systems, .setup-packages-worlds');
        const hasGameObject = typeof window.game !== 'undefined';
        const hasAnyContent = document.body.textContent && document.body.textContent.length > 100;
        
        return hasSetupElements || hasGameObject || hasAnyContent;
      }, { timeout: config.bootstrap.timeouts.setupPageReady });
      
      console.log('[V12 Setup] ✅ FoundryVTT setup page is ready');
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
