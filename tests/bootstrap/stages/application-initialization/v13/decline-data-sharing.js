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
        return { success: false, error: 'Decline Sharing button not found' };
      }
    } catch (e) {
      return { success: false, error: `Decline data sharing failed: ${e.message}` };
    }
  }
}
