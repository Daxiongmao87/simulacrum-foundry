/**
 * License submission module for v13
 * Extracted from working monolithic bootstrap-runner.js
 */

export class LicenseSubmissionV13 {
  async submitLicense(page, licenseKey) {
    console.log('[V13 License] 🔑 Submitting license key...');
    
    try {
      // Submit license via form submission (like POC)
      const result = await page.evaluate(async (licenseKey) => {
        try {
          // Look for license input field
          const licenseInput = document.querySelector('input[name="licenseKey"], input[type="text"], input[placeholder*="license"]');
          if (licenseInput) {
            licenseInput.value = licenseKey;
            console.log('[V13 License] License key entered in input field');
          }
          
          // Look for submit button
          const submitButton = document.querySelector('button[type="submit"], input[type="submit"]');
          if (submitButton) {
            submitButton.click();
            console.log('[V13 License] Submit button clicked');
            return { success: true, method: 'form_submit' };
          }
          
          // Look for button with text content
          const buttons = Array.from(document.querySelectorAll('button'));
          const textButton = buttons.find(btn => 
            btn.textContent && (btn.textContent.includes('Submit') || btn.textContent.includes('Continue'))
          );
          if (textButton) {
            textButton.click();
            console.log('[V13 License] Text-based submit button clicked');
            return { success: true, method: 'text_button' };
          }
          
          // Fallback to fetch if no form found
          const response = await fetch('/license', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              licenseKey: licenseKey
            })
          });
          
          if (response.redirected || response.status === 302) {
            return { success: true, redirected: true, url: response.url };
          }
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          return { success: true, method: 'fetch' };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }, licenseKey);
      
      if (result.success) {
        // Wait for page to actually navigate after license submission
        console.log('[V13 License] Waiting for page navigation after license submission...');
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log('[V13 License] Page navigation completed');
      }
      
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
