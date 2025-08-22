/**
 * Step button handling module for v13
 * Extracted from working monolithic bootstrap-runner.js
 */

export class StepButtonHandlingV13 {
  async handleStepButton(page) {
    console.log('[V13 Step] 📍 Clicking step-button to proceed...');
    
    try {
      const stepButtonClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('.step-button:not(.disabled)'));
        const button = buttons[0];
        if (button) {
          button.click();
          return true;
        }
        return false;
      });
      
      if (stepButtonClicked) {
        console.log('[V13 Step] ✅ Step-button clicked');
        return { success: true };
      } else {
        console.log('[V13 Step] ⚠️ Step-button not found, proceeding...');
        return { success: true, reason: 'button_not_found' };
      }
    } catch (e) {
      console.log('[V13 Step] ⚠️ Step-button not found, proceeding...');
      return { success: true, reason: 'error_continue' };
    }
  }
}
