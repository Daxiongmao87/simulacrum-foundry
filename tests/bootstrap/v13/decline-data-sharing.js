/**
 * Decline data sharing module for v13
 * Extracted from working monolithic bootstrap-runner.js
 */

export class DeclineDataSharingV13 {
  static meta = { name: 'decline-data-sharing', description: 'Click Decline Sharing if prompted' };
  async handleDeclineSharing(page) {
    console.log('[V13 Decline] 📍 Looking for Decline Sharing button...');
    
    try {
      const declineButton = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const button = buttons.find(btn => btn.textContent?.includes('Decline Sharing'));
        if (button) {
          button.click();
          return true;
        }
        return false;
      });
      
      if (declineButton) {
        console.log('[V13 Decline] ✅ Decline Sharing button clicked');
        return { success: true };
      } else {
        console.log('[V13 Decline] ⚠️ Decline Sharing button not found, proceeding...');
        return { success: true, reason: 'button_not_found' };
      }
    } catch (e) {
      console.log('[V13 Decline] ⚠️ Decline Sharing button not found, proceeding...');
      return { success: true, reason: 'error_continue' };
    }
  }
}
