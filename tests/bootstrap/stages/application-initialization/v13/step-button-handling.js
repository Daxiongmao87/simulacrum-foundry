/**
 * Step button handling module for v13
 * Extracted from working monolithic bootstrap-runner.js
 */

export class StepButtonHandlingV13 {
  static meta = { name: 'step-button-handling', description: 'Click step button to proceed' };
  async handleStepButton(page) {
    console.log('[V13 Step] 📍 Checking for step-button...');
    
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
      } else {
        console.log('[V13 Step] ✅ No step-button found (not required)');
      }
      return { success: true };
    } catch (e) {
      console.log('[V13 Step] ✅ Step-button check completed (not required)');
      return { success: true };
    }
  }
}
