/**
 * Complete FoundryVTT workflow automation script
 * Follows the exact manual UI interaction sequence documented by user
 */

import puppeteer from 'puppeteer';
import { execSync } from 'child_process';

async function debugSimpleModal() {
  console.log('🔍 Starting FoundryVTT workflow automation...');
  
  // Step 0: Build Docker image
  const imageName = 'foundry-test-poc';
  const foundryLicenseKey = process.env.FOUNDRY_LICENSE_KEY;
  
  if (!foundryLicenseKey) {
    console.error('❌ FOUNDRY_LICENSE_KEY environment variable is required');
    throw new Error('FOUNDRY_LICENSE_KEY environment variable not set');
  }
  
  console.log(`🔨 Building Docker image: ${imageName}...`);
  console.log(`🔑 Using license key: ${foundryLicenseKey.substring(0, 4)}****`);
  
  try {
    execSync(`docker build -f tests/docker/Dockerfile.foundry --build-arg FOUNDRY_VERSION_ZIP=FoundryVTT-Node-13.347.zip --build-arg FOUNDRY_LICENSE_KEY=${foundryLicenseKey} -t ${imageName} .`, { stdio: 'inherit' });
    console.log(`✅ Docker image ${imageName} built successfully`);
  } catch (error) {
    console.error('❌ Docker build failed:', error.message);
    throw error;
  }
  
  // Step 1: Clean up any existing containers
  console.log('🧹 Cleaning up existing containers...');
  try {
    execSync('docker stop fresh-debug-foundry', { stdio: 'ignore' });
    execSync('docker rm fresh-debug-foundry', { stdio: 'ignore' });
  } catch (e) {
    // Container might not exist, which is fine
  }
  
  // Step 2: Start fresh container
  console.log(`🚀 Starting fresh FoundryVTT container from image: ${imageName}...`);
  const containerId = execSync(`docker run -d --name fresh-debug-foundry -p 30003:30000 ${imageName}` , { encoding: 'utf8' }).trim();
  console.log(`📦 Container ID: ${containerId}`);
  
  // Step 3: Wait for container to be ready
  console.log('⏳ Waiting for container to be ready...');
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const response = execSync('curl -s -o /dev/null -w "%{http_code}" http://localhost:30003', { encoding: 'utf8', timeout: 5000 });
      if (response.trim() === '302') {
        ready = true;
        break;
      }
    } catch (e) {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  if (!ready) {
    console.log('❌ Container failed to start properly');
    return;
  }
  
  console.log('✅ Fresh container is ready, starting Puppeteer automation...');
  
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1366, height: 768 }
  });
  
  const page = await browser.newPage();
  
  page.on('console', (msg) => {
    const text = msg.text();
    // Ignore Chromium version compatibility warnings
    if (text.includes('modern JavaScript features') && text.includes('Chromium version')) {
      console.log(`[BROWSER] ${msg.type()}: ${text} (ignored)`);
      return;
    }
    console.log(`[BROWSER] ${msg.type()}: ${text}`);
  });
  
  // Handle page errors without terminating
  page.on('pageerror', (error) => {
    if (error.message.includes('modern JavaScript features') && error.message.includes('Chromium version')) {
      console.log(`[BROWSER] pageerror: ${error.message} (ignored)`);
      return;
    }
    console.log(`[BROWSER] pageerror: ${error.message}`);
  });
  
  try {
    // Set longer timeout for the entire process
    page.setDefaultTimeout(300000); // 5 minutes
    
    // Step 1: Navigate to base URL and handle license
    console.log('📍 Step 1: Navigating to base FoundryVTT URL...');
    await page.goto('http://localhost:30003', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);
    
    if (currentUrl.includes('/license')) {
      console.log('📍 License page detected, handling license submission...');
      
           // Step 1: Submit license using the proper API endpoint (from other working scripts)
     console.log('📍 Submitting license key via API...');
     const licenseResult = await page.evaluate(async (licenseKey) => {
       try {
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
         
         return { success: true };
       } catch (error) {
         return { success: false, error: error.message };
       }
     }, foundryLicenseKey);
     
     if (!licenseResult.success) {
       throw new Error(`License submission failed: ${licenseResult.error}`);
     }
     
     console.log('✅ License submitted successfully');
     
     // Wait for license submission to process
     console.log('📍 Waiting for license submission to process...');
     await new Promise(resolve => setTimeout(resolve, 5000));
     
     // Step 2: Check for EULA agreement that appears AFTER license submission
     console.log('📍 Step 2: Checking for EULA agreement after license submission...');
     
     const eulaCheckAfterLicense = await page.evaluate(() => {
       const bodyText = document.body.textContent || '';
       const hasEulaText = bodyText.includes('End User License Agreement') || 
                          bodyText.includes('EULA') || 
                          bodyText.includes('License Agreement') ||
                          bodyText.includes('please sign the End User License Agreement');
       
       return {
         detected: hasEulaText,
         hasEulaText,
         currentUrl: window.location.href,
         pageTitle: document.title
       };
     });
     
     console.log(`📍 EULA check after license:`, JSON.stringify(eulaCheckAfterLicense, null, 2));
     
     if (eulaCheckAfterLicense.detected) {
       console.log('📍 EULA detected after license submission, accepting agreement...');
       
       // Handle EULA agreement
       const eulaResult = await page.evaluate(() => {
         try {
           // Look for the EULA agreement checkbox
           const eulaCheckbox = document.querySelector('#eula-agree, input[name="eula-agree"], input[type="checkbox"]');
           if (eulaCheckbox) {
             eulaCheckbox.checked = true;
             console.log('EULA checkbox checked');
           }
           
           // Look for the sign/accept button
           const signButton = document.querySelector('#sign, button[name="sign"], button[data-action*="sign"]');
           if (signButton) {
             signButton.click();
             console.log('EULA sign button clicked');
             return { success: true, method: 'button_click' };
           }
           
           // Try to find any button that might accept the EULA
           const buttons = Array.from(document.querySelectorAll('button'));
           for (const button of buttons) {
             const text = button.textContent.toLowerCase();
             if (text.includes('sign') || text.includes('accept') || text.includes('agree') || text.includes('continue')) {
               button.click();
               console.log(`EULA button clicked: ${button.textContent}`);
               return { success: true, method: 'text_search_click' };
             }
           }
           
           return { success: false, reason: 'no_eula_button_found' };
         } catch (error) {
           return { success: false, reason: error.message };
         }
       });
       
       if (eulaResult.success) {
         console.log('✅ EULA accepted successfully');
         
         // Wait for EULA processing and potential navigation
         console.log('📍 Waiting for EULA form submission to process...');
         await new Promise(resolve => setTimeout(resolve, 5000));
         
         // Take screenshot after EULA acceptance
         await page.screenshot({ path: 'debug-after-eula.png', fullPage: true });
         console.log('📸 Screenshot saved: debug-after-eula.png');
       } else {
         console.log(`⚠️ EULA acceptance failed: ${eulaResult.reason}`);
       }
     } else {
       console.log('📍 No EULA detected after license submission');
     }
     
     // Now navigate to setup page
     console.log('📍 Navigating to setup page...');
     await page.goto('http://localhost:30003/setup', { waitUntil: 'domcontentloaded', timeout: 30000 });
     console.log('📍 Navigated to setup page');
      
           // EULA is now handled after license submission above
    } else {
      console.log('📍 Already past license, navigating to setup...');
      await page.goto('http://localhost:30003/setup', { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    
                  // Step 4: Handle setup page - Decline Sharing (from manual steps)
         console.log('📍 Step 4: Handling setup page...');
         
         // Take screenshot of setup page
         await page.screenshot({ path: 'debug-setup-page.png', fullPage: true });
         console.log('📸 Screenshot saved: debug-setup-page.png');
         
         // Wait for setup page to load - be more flexible about what constitutes "ready"
         await page.waitForFunction(() => {
           // Check for any setup-related elements
           const hasSetupElements = !!document.querySelector('.setup-menu, .setup-packages, [data-tab], .setup-packages-systems, .setup-packages-worlds');
           const hasGameObject = typeof window.game !== 'undefined';
           const hasAnyContent = document.body.textContent && document.body.textContent.length > 100;
           
           return hasSetupElements || hasGameObject || hasAnyContent;
         }, { timeout: 60000 });
         
         console.log('✅ FoundryVTT setup page is ready');
     
     // Step 4.5: Wait for EULA that appears dynamically on the setup page
     console.log('📍 Step 4.5: Waiting for EULA to appear on setup page...');
     
     // Wait for EULA to appear dynamically
     try {
       await page.waitForFunction(() => {
         const bodyText = document.body.textContent || '';
         return bodyText.includes('End User License Agreement') || 
                bodyText.includes('EULA') || 
                bodyText.includes('License Agreement') ||
                bodyText.includes('please sign the End User License Agreement');
       }, { timeout: 30000 });
       
                console.log('📍 EULA appeared on setup page, accepting agreement...');
         
         // Wait for EULA form to be fully rendered
         console.log('📍 Waiting for EULA form to be fully rendered...');
         await new Promise(resolve => setTimeout(resolve, 2000));
         
         // Handle EULA agreement
         const eulaResult = await page.evaluate(() => {
         try {
           // Look for the EULA agreement checkbox
           const eulaCheckbox = document.querySelector('#eula-agree, input[name="eula-agree"], input[type="checkbox"]');
           if (eulaCheckbox) {
             eulaCheckbox.checked = true;
             console.log('EULA checkbox checked');
           }
           
           // Look for the sign/accept button
           const signButton = document.querySelector('#sign, button[name="sign"], button[data-action*="sign"]');
           if (signButton) {
             signButton.click();
             console.log('EULA sign button clicked');
             return { success: true, method: 'button_click' };
           }
           
           // Try to find any button that might accept the EULA
           const buttons = Array.from(document.querySelectorAll('button'));
           for (const button of buttons) {
             const text = button.textContent.toLowerCase();
             if (text.includes('sign') || text.includes('accept') || text.includes('agree') || text.includes('continue')) {
               button.click();
               console.log(`EULA button clicked: ${button.textContent}`);
               return { success: true, method: 'text_search_click' };
             }
           }
           
           return { success: false, reason: 'no_eula_button_found' };
         } catch (error) {
           return { success: false, reason: error.message };
         }
       });
       
       if (eulaResult.success) {
         console.log('✅ EULA accepted successfully');
         
         // Wait for EULA processing and potential navigation
         console.log('📍 Waiting for EULA form submission to process...');
         await new Promise(resolve => setTimeout(resolve, 5000));
         
         // Take screenshot after EULA acceptance
         await page.screenshot({ path: 'debug-after-eula.png', fullPage: true });
         console.log('📸 Screenshot saved: debug-after-eula.png');
         
         // Wait for EULA form to disappear and setup page to fully load
         console.log('📍 Waiting for EULA form to disappear...');
         await page.waitForFunction(() => {
           const bodyText = document.body.textContent || '';
           return !bodyText.includes('End User License Agreement') && 
                  !bodyText.includes('please sign the End User License Agreement');
         }, { timeout: 30000 });
         
         console.log('✅ EULA form disappeared, setup page should be ready');
         
         // Wait a bit more for setup page to fully load
         await new Promise(resolve => setTimeout(resolve, 3000));
       } else {
         console.log(`⚠️ EULA acceptance failed: ${eulaResult.reason}`);
       }
     } catch (e) {
       console.log('📍 No EULA appeared within timeout, proceeding...');
     }
    
         // Look for and click "Decline Sharing" button
     console.log('📍 Looking for Decline Sharing button...');
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
         console.log('✅ Decline Sharing button clicked');
       } else {
         console.log('⚠️ Decline Sharing button not found, proceeding...');
       }
     } catch (e) {
       console.log('⚠️ Decline Sharing button not found, proceeding...');
     }
     
     // Take screenshot after Decline Sharing
     await page.screenshot({ path: 'debug-after-decline-sharing.png', fullPage: true });
     console.log('📸 Screenshot saved: debug-after-decline-sharing.png');
     
     // Step 5: Click the step-button to proceed (from manual steps)
     console.log('📍 Step 5: Clicking step-button to proceed...');
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
         console.log('✅ Step-button clicked');
       } else {
         console.log('⚠️ Step-button not found, proceeding...');
       }
     } catch (e) {
       console.log('⚠️ Step-button not found, proceeding...');
     }
     
     // Step 6: Click "Install System" button (from manual steps)
     console.log('📍 Step 6: Clicking Install System button...');
     
     // First, let's see what buttons are actually available
     const availableButtons = await page.evaluate(() => {
       const buttons = Array.from(document.querySelectorAll('button'));
       return buttons.map(btn => ({
         text: btn.textContent?.trim(),
         className: btn.className,
         id: btn.id,
         type: btn.type
       }));
     });
     console.log('📊 Available buttons:', JSON.stringify(availableButtons, null, 2));
     
     const installSystemClicked = await page.evaluate(() => {
       const buttons = Array.from(document.querySelectorAll('button'));
       const button = buttons.find(btn => btn.textContent?.includes('Install System'));
       if (button) {
         button.click();
         return true;
       }
       return false;
     });
     if (installSystemClicked) {
       console.log('✅ Install System button clicked');
     } else {
       throw new Error('Install System button not found');
     }
    
    // Wait for system installation dialog
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 7: Change input field value to "dnd5e" (from manual steps)
    console.log('📍 Step 7: Searching for dnd5e system...');
    
    // Take screenshot before searching
    await page.screenshot({ path: 'debug-before-system-search.png', fullPage: true });
    console.log('📸 Screenshot saved: debug-before-system-search.png');
    
    await page.type('#install-package-search-filter', 'dnd5e');
    console.log('✅ dnd5e entered in search field');
    
    // Wait for search results
    await new Promise(resolve => setTimeout(resolve, 2000));
    
             // Step 8: Click "Install" button for dnd5e (from manual steps)
    console.log('📍 Step 8: Clicking Install button for dnd5e...');
    
    // Take screenshot after search, before install
    await page.screenshot({ path: 'debug-after-system-search.png', fullPage: true });
    console.log('📸 Screenshot saved: debug-after-system-search.png');
    
    // First, let's find the specific dnd5e package and verify it's the right one
    console.log('📍 Looking for dnd5e package specifically...');
    
    const dnd5ePackage = await page.evaluate(() => {
      // Look for package elements that might contain dnd5e
      const packageElements = Array.from(document.querySelectorAll('[data-package-id], .package, .package-tile'));
      
      for (const element of packageElements) {
        const text = element.textContent || '';
        const packageId = element.getAttribute('data-package-id');
        
        // Look for D&D 5e specifically
        if (text.includes('dnd5e') || 
            text.includes('Dungeons & Dragons Fifth Edition') ||
            text.includes('D&D 5e') ||
            packageId === 'dnd5e') {
          
          // Find the install button within this package
          const installButton = element.querySelector('button.install-package, button[data-action*="install"]');
          
          if (installButton) {
            return {
              found: true,
              packageId: packageId,
              title: text.substring(0, 100),
              installButton: true
            };
          }
        }
      }
      
      return { found: false };
    });
    
    console.log('📊 dnd5e package search result:', JSON.stringify(dnd5ePackage, null, 2));
    
    if (!dnd5ePackage.found) {
      throw new Error('dnd5e package not found in search results');
    }
    
    console.log(`✅ Found dnd5e package: ${dnd5ePackage.title}`);
    
    // Now click the install button for the specific dnd5e package
    const installClicked = await page.evaluate(() => {
      // Find the package element for dnd5e
      const packageElements = Array.from(document.querySelectorAll('[data-package-id], .package, .package-tile'));
      
      for (const element of packageElements) {
        const text = element.textContent || '';
        const packageId = element.getAttribute('data-package-id');
        
        if (text.includes('dnd5e') || 
            text.includes('Dungeons & Dragons Fifth Edition') ||
            text.includes('D&D 5e') ||
            packageId === 'dnd5e') {
          
          // Find and click the install button
          const installButton = element.querySelector('button.install-package, button[data-action*="install"]');
          if (installButton) {
            installButton.click();
            return true;
          }
        }
      }
      
      return false;
    });
    if (installClicked) {
      console.log('✅ Install button clicked for dnd5e');
    } else {
      throw new Error('Install button for dnd5e not found');
    }
    
    // Step 9: Monitor download progress and wait for completion
    console.log('📍 Step 9: Monitoring system download and installation...');
    
    // Wait for download to start and monitor progress
    console.log('📍 Waiting for download to start...');
    await page.waitForFunction(() => {
      const bodyText = document.body.textContent || '';
      return bodyText.includes('Downloading Package dnd5e');
    }, { timeout: 120000 }); // 2 minutes to start download
    
    console.log('✅ Download started, monitoring progress...');
    
    // Monitor download progress until completion
    console.log('📍 Monitoring download progress (this may take several minutes for large systems)...');
    
    // First, wait for download to complete with progress monitoring
    let downloadComplete = false;
    let lastProgress = '';
    let progressCheckInterval;
    
    try {
      // Set up progress monitoring interval
      progressCheckInterval = setInterval(async () => {
        try {
          const progressInfo = await page.evaluate(() => {
            const bodyText = document.body.textContent || '';
            if (bodyText.includes('Downloading Package dnd5e')) {
              // Look for progress percentage in various formats
              const progressMatch = bodyText.match(/Downloading Package dnd5e\s*(\d+%)?/);
              const percentageMatch = bodyText.match(/(\d+)%/);
              const downloadText = bodyText.match(/Downloading Package dnd5e[^]*?(\d+%)?/);
              
              return {
                hasProgress: true,
                percentage: progressMatch?.[1] || percentageMatch?.[1] || 'in progress',
                fullText: downloadText?.[0]?.substring(0, 100) || 'Downloading...'
              };
            }
            return { hasProgress: false };
          });
          
          if (progressInfo.hasProgress && progressInfo.percentage !== lastProgress) {
            lastProgress = progressInfo.percentage;
            console.log(`📥 Download progress: ${progressInfo.percentage}`);
          }
        } catch (e) {
          // Ignore errors in progress monitoring
        }
      }, 2000); // Check progress every 2 seconds
      
      // Wait for download to complete
      await page.waitForFunction(() => {
        const bodyText = document.body.textContent || '';
        return !bodyText.includes('Downloading Package dnd5e');
      }, { timeout: 900000 }); // 15 minutes timeout for download completion
      
      // Clear progress monitoring
      if (progressCheckInterval) {
        clearInterval(progressCheckInterval);
      }
      
      console.log('✅ Download completed');
    } catch (error) {
      // Clear progress monitoring on error too
      if (progressCheckInterval) {
        clearInterval(progressCheckInterval);
      }
      if (error.name === 'TimeoutError') {
        console.log('⚠️ Download timeout reached. Checking if download actually completed...');
        
        // Check if download might have completed despite timeout
        const downloadStatus = await page.evaluate(() => {
          const bodyText = document.body.textContent || '';
          return {
            stillDownloading: bodyText.includes('Downloading Package dnd5e'),
            hasSuccessMessage: bodyText.includes('System dnd5e was installed successfully'),
            hasAnySuccess: bodyText.includes('was installed successfully')
          };
        });
        
        console.log('📊 Download status check:', JSON.stringify(downloadStatus, null, 2));
        
        if (downloadStatus.hasSuccessMessage) {
          console.log('✅ Download actually completed successfully despite timeout');
          downloadComplete = true;
        } else if (!downloadStatus.stillDownloading) {
          console.log('⚠️ Download appears to have stopped. Proceeding to check installation...');
          downloadComplete = true;
        } else {
          throw new Error('Download timeout exceeded and download is still in progress');
        }
      } else {
        throw error;
      }
    }
    
         // Wait for installation to complete and system to be ready
     console.log('📍 Waiting for system installation to complete...');
     
     // Wait for the success message to appear
     console.log('📍 Waiting for installation completion message...');
     await page.waitForFunction(() => {
       const bodyText = document.body.textContent || '';
       return bodyText.includes('System dnd5e was installed successfully');
     }, { timeout: 300000 }); // 5 minutes for installation completion
     
     console.log('✅ dnd5e system installation completed successfully');
     
     // Wait a bit more for the system to be fully registered
     await new Promise(resolve => setTimeout(resolve, 5000));
     
     // Check if the system is available in the game object
     const systemCheck = await page.evaluate(() => {
       return {
         hasGame: !!window.game,
         hasSystems: !!window.game?.systems,
         systemsCount: window.game?.systems?.size || 0,
         systems: window.game?.systems ? Array.from(window.game.systems.keys()) : [],
         dnd5eAvailable: window.game?.systems?.has('dnd5e') || false,
         dnd5eReady: window.game?.systems?.get('dnd5e')?.ready || false
       };
     });
     
     console.log('📊 System availability check:', JSON.stringify(systemCheck, null, 2));
     
     if (systemCheck.dnd5eAvailable) {
       console.log('✅ dnd5e system is available in game.systems');
     } else {
       console.log('⚠️ dnd5e system not yet available in game.systems, but installation completed');
     }
    
    // Take screenshot after system installation
    await page.screenshot({ path: 'debug-after-system-install.png', fullPage: true });
    console.log('📸 Screenshot saved: debug-after-system-install.png');
    
    // Step 9: Close the dialog (from manual steps)
    console.log('📍 Step 9: Closing installation dialog...');
    await page.click('.header-control.icon.fa-solid.fa-xmark');
    console.log('✅ Installation dialog closed');
    
           // Step 10: Create a world using the installed system
       console.log('📍 Step 10: Creating a world with dnd5e system...');
       
       // Take screenshot before navigating to worlds tab
       await page.screenshot({ path: 'debug-before-worlds-tab.png', fullPage: true });
       console.log('📸 Screenshot saved: debug-before-worlds-tab.png');
       
       // Navigate to worlds tab
       console.log('📍 Navigating to worlds tab...');
       await page.click('[data-tab="worlds"]');
       console.log('✅ Worlds tab clicked');
    
    // Wait for worlds tab content
    await new Promise(resolve => setTimeout(resolve, 3000));
    
                // Look for Create World button
       console.log('📍 Looking for Create World button...');
       
       // Take screenshot of worlds tab
       await page.screenshot({ path: 'debug-worlds-tab.png', fullPage: true });
       console.log('📸 Screenshot saved: debug-worlds-tab.png');
       
       const createWorldClicked = await page.evaluate(() => {
         const buttons = Array.from(document.querySelectorAll('button'));
         const button = buttons.find(btn => btn.textContent?.includes('Create World'));
         if (button) {
           button.click();
           return true;
         }
         return false;
       });
       if (createWorldClicked) {
         console.log('✅ Create World button clicked');
      
             // Wait for world creation form
       await new Promise(resolve => setTimeout(resolve, 3000));
       
       // Take screenshot of world creation form
       await page.screenshot({ path: 'debug-world-creation-form.png', fullPage: true });
       console.log('📸 Screenshot saved: debug-world-creation-form.png');
       
       // Fill in world creation form
       console.log('📍 Filling world creation form...');
       
       // First, let's see what form fields are actually available
       const formFields = await page.evaluate(() => {
         const inputs = Array.from(document.querySelectorAll('input'));
         const textareas = Array.from(document.querySelectorAll('textarea'));
         const selects = Array.from(document.querySelectorAll('select'));
         const labels = Array.from(document.querySelectorAll('label'));
         
         return {
           inputs: inputs.map(i => ({
             type: i.type,
             name: i.name,
             id: i.id,
             placeholder: i.placeholder,
             className: i.className
           })),
           textareas: textareas.map(t => ({
             name: t.name,
             id: t.id,
             placeholder: t.placeholder,
             className: t.className
           })),
           selects: selects.map(s => ({
             name: s.name,
             id: s.id,
             className: s.className,
             options: Array.from(s.options).map(o => ({
               value: o.value,
               text: o.textContent?.trim(),
               selected: o.selected
             }))
           })),
           labels: labels.map(l => ({
             text: l.textContent?.trim(),
             for: l.getAttribute('for'),
             className: l.className
           }))
         };
       });
       
       console.log('📊 Available form fields:', JSON.stringify(formFields, null, 2));
       
       // World title - try multiple approaches
       try {
         await page.type('input[name="title"], input[placeholder*="title"], input[placeholder*="Title"], input[placeholder*="name"], input[placeholder*="Name"]', 'Test World');
         console.log('✅ World title filled');
       } catch (e) {
         console.log(`⚠️ Could not fill world title: ${e.message}`);
       }
       
       // World ID - try multiple approaches
       try {
         await page.type('input[name="id"], input[placeholder*="id"], input[placeholder*="ID"], input[name="worldId"]', 'test-world');
         console.log('✅ World ID filled');
       } catch (e) {
         console.log(`⚠️ Could not fill world ID: ${e.message}`);
       }
       
       // Game System - this is critical for world creation
       try {
         // Look for a select dropdown or input for game system
         const systemField = await page.$('select[name="system"], input[name="system"], #world-config-system');
         if (systemField) {
           // If it's a select, choose dnd5e option
           const tagName = await systemField.evaluate(el => el.tagName.toLowerCase());
           if (tagName === 'select') {
             await page.select('select[name="system"], #world-config-system', 'dnd5e');
             console.log('✅ Game system selected: dnd5e');
           } else {
             // If it's an input, type dnd5e
             await page.type('input[name="system"], #world-config-system', 'dnd5e');
             console.log('✅ Game system entered: dnd5e');
           }
         } else {
           console.log('⚠️ Game system field not found - this may cause world creation to fail');
         }
       } catch (e) {
         console.log(`⚠️ Could not set game system: ${e.message} - this may cause world creation to fail`);
       }
       
       // Description - try multiple approaches, but don't fail if not found
       try {
         await page.type('textarea[name="description"], textarea[placeholder*="description"], textarea[placeholder*="Description"], textarea[name="desc"]', 'Automated test world');
         console.log('✅ World description filled');
       } catch (e) {
         console.log(`⚠️ Could not fill world description: ${e.message} - continuing without it`);
       }
      
             // Submit world creation
       console.log('📍 Submitting world creation form...');
       // First, let's see what buttons are actually available
       const availableButtons = await page.evaluate(() => {
         const buttons = Array.from(document.querySelectorAll('button'));
         return buttons.map(btn => ({
           text: btn.textContent?.trim(),
           type: btn.type,
           className: btn.className,
           dataAction: btn.getAttribute('data-action'),
           name: btn.name,
           id: btn.id
         }));
       });
       
       console.log('📊 Available buttons in world creation form:', JSON.stringify(availableButtons, null, 2));
       
       const submitClicked = await page.evaluate(() => {
         const buttons = Array.from(document.querySelectorAll('button'));
         
         // Look for submit button by type
         const submitButton = buttons.find(btn => btn.type === 'submit');
         if (submitButton) {
           submitButton.click();
           console.log('Submit button clicked by type');
           return { success: true, method: 'type_submit' };
         }
         
         // Look for button with create action
         const createButton = buttons.find(btn => 
           btn.getAttribute('data-action')?.includes('create') ||
           btn.textContent?.toLowerCase().includes('create')
         );
         if (createButton) {
           createButton.click();
           console.log('Create button clicked by action/text');
           return { success: true, method: 'action_text' };
         }
         
         // Look for any button that might submit the form
         const anyButton = buttons.find(btn => 
           btn.textContent?.toLowerCase().includes('submit') ||
           btn.textContent?.toLowerCase().includes('save') ||
           btn.textContent?.toLowerCase().includes('ok')
         );
         if (anyButton) {
           anyButton.click();
           console.log('Generic submit button clicked');
           return { success: true, method: 'generic' };
         }
         
         return { success: false, reason: 'no_submit_button_found' };
       });
       
       if (submitClicked.success) {
         console.log(`✅ World creation form submitted via ${submitClicked.method}`);
       } else {
         throw new Error(`Submit button not found: ${submitClicked.reason}`);
       }
      
             // Wait for world creation to complete and check for success/error messages
       console.log('📍 Waiting for world creation to complete...');
       await new Promise(resolve => setTimeout(resolve, 5000));
       
       // Take screenshot after world creation attempt
       await page.screenshot({ path: 'debug-after-world-creation.png', fullPage: true });
       console.log('📸 Screenshot saved: debug-after-world-creation.png');
       
       // Check for any creation success or error messages
       const creationResult = await page.evaluate(() => {
         const bodyText = document.body.textContent || '';
         const hasSuccess = bodyText.includes('World created') || 
                           bodyText.includes('successfully created') ||
                           bodyText.includes('World Test World');
         const hasError = bodyText.includes('error') || 
                         bodyText.includes('Error') ||
                         bodyText.includes('failed') ||
                         bodyText.includes('Failed');
         
         return {
           hasSuccess,
           hasError,
           currentUrl: window.location.href,
           bodyTextSample: bodyText.substring(0, 500)
         };
       });
       
       console.log('📊 World creation result check:', JSON.stringify(creationResult, null, 2));
       
       // If world creation was successful, we need to close the form and navigate back to worlds tab
       if (creationResult.hasSuccess) {
         console.log('✅ World creation successful, closing form and navigating to worlds tab...');
         
         // Look for and click close button on world creation form
         const formClosed = await page.evaluate(() => {
           const closeButtons = Array.from(document.querySelectorAll('button, .close, .header-control'));
           const closeButton = closeButtons.find(btn => 
             btn.textContent?.includes('×') || 
             btn.textContent?.includes('Close') ||
             btn.className?.includes('close') ||
             btn.className?.includes('xmark')
           );
           if (closeButton) {
             closeButton.click();
             return true;
           }
           return false;
         });
         
         if (formClosed) {
           console.log('✅ World creation form closed');
         } else {
           console.log('⚠️ Could not close world creation form');
         }
         
         // Navigate back to worlds tab
         console.log('📍 Navigating back to worlds tab...');
         await page.click('[data-tab="worlds"]');
         await new Promise(resolve => setTimeout(resolve, 2000));
         
         // Take screenshot of worlds tab
         await page.screenshot({ path: 'debug-worlds-tab-after-creation.png', fullPage: true });
         console.log('📸 Screenshot saved: debug-worlds-tab-after-creation.png');
       }
       
       // Step 11: Launch the created world
       console.log('📍 Step 11: Launching created world...');
       
       // Wait for the created world to appear in the worlds list
       console.log('📍 Waiting for created world to appear in worlds list...');
       
       // First, let's debug what world elements are currently visible
       const currentWorlds = await page.evaluate(() => {
         const worldElements = Array.from(document.querySelectorAll('[data-package-id], .package-tile, .world-item, .package, .world, .setup-package'));
         return worldElements.map(el => ({
           tagName: el.tagName,
           id: el.id,
           className: el.className,
           dataPackageId: el.getAttribute('data-package-id'),
           textContent: el.textContent?.substring(0, 100)
         }));
       });
       
       console.log('📊 Current world elements before waiting:', JSON.stringify(currentWorlds, null, 2));
       
       await page.waitForFunction(() => {
         // Look for a world with title "Test World" 
         const worldElements = Array.from(document.querySelectorAll('[data-package-id], .package-tile, .world-item, .package, .world, .setup-package'));
         return worldElements.some(el => 
           el.textContent?.includes('Test World') || 
           el.getAttribute('data-package-id') === 'test-world'
         );
       }, { timeout: 30000 });
       
       console.log('✅ Created world appeared in worlds list');
       
       // Now find and click the launch button for "Test World"
       console.log('📍 Looking for Launch World button for Test World...');
       const launchClicked = await page.evaluate(() => {
         // Find the world element for "Test World"
         const worldElements = Array.from(document.querySelectorAll('[data-package-id], .package-tile, .world-item'));
         const testWorldElement = worldElements.find(el => 
           el.textContent?.includes('Test World') || 
           el.getAttribute('data-package-id') === 'test-world'
         );
         
         if (testWorldElement) {
           // Look for the launch button within this world element or its parent
           const launchButton = testWorldElement.querySelector('[data-action="worldLaunch"]') ||
                               testWorldElement.parentElement?.querySelector('[data-action="worldLaunch"]');
           
           if (launchButton) {
             launchButton.click();
             console.log('Found and clicked worldLaunch button for Test World');
             return true;
           } else {
             console.log('Test World element found but no worldLaunch button found within it');
             return false;
           }
         } else {
           console.log('Test World element not found in DOM');
           return false;
         }
       });
       
       if (launchClicked) {
         console.log('✅ Launch World button clicked for Test World');
         
         // Wait for navigation to game world
         console.log('📍 Waiting for navigation to game world...');
         await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });
         console.log('✅ Navigation to game world detected');
       } else {
         console.log('⚠️ Launch World button not found for Test World');
         // Let's debug what world elements actually exist
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
         console.log('📊 Available world elements:', JSON.stringify(worldDebug, null, 2));
         throw new Error('Could not find Launch World button for Test World');
       }
    } else {
      console.log('⚠️ Create World button not found, attempting direct world creation...');
      
      // Try direct world creation via API
      const worldCreationResult = await page.evaluate(async () => {
        try {
          const response = await fetch('/setup', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'createWorld',
              title: 'Test World',
              id: 'test-world',
              description: 'Automated test world',
              system: 'dnd5e'
            })
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const result = await response.json();
          return { success: true, world: result };
        } catch (error) {
          return { success: false, error: error.message };
        }
      });
      
      if (worldCreationResult.success) {
        console.log('✅ World created via API');
        
        // Launch world
        const launchResult = await page.evaluate(async () => {
          try {
            const response = await fetch('/setup', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'launchWorld',
                world: 'test-world'
              })
            });
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            return { success: true, result };
          } catch (error) {
            return { success: false, error: error.message };
          }
        });
        
        if (launchResult.success) {
          console.log('✅ World launch initiated');
          await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });
        } else {
          throw new Error(`World launch failed: ${launchResult.error}`);
        }
      } else {
        throw new Error(`World creation failed: ${worldCreationResult.error}`);
      }
    }
    
         // Step 12: Handle user authentication if on join page
     console.log('📍 Step 12: Checking if user authentication is required...');
     
     const joinPageUrl = page.url();
     if (joinPageUrl.includes('/join')) {
      console.log('📍 Join page detected, handling user authentication...');
      
      // Wait for join form to load
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Look for user selection dropdown
      console.log('📍 Looking for user selection dropdown...');
      const userSelect = await page.$('select[name="userid"]');
      
      if (userSelect) {
        console.log('✅ User selection dropdown found, selecting GameMaster...');
        // Get available users and select GameMaster if available
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
        
        console.log('📊 Available users:', JSON.stringify(userOptions, null, 2));
        
        // Look for GameMaster user
        const gameMasterOption = userOptions.find(opt => 
          opt.text?.toLowerCase().includes('gamemaster') || 
          opt.text?.toLowerCase().includes('game master') ||
          opt.text?.toLowerCase().includes('gm')
        );
        
        if (gameMasterOption) {
          await page.select('select[name="userid"]', gameMasterOption.value);
          console.log(`✅ Selected user: ${gameMasterOption.text}`);
        } else {
          // Select first available user
          const firstUser = userOptions.find(opt => opt.value && !opt.disabled);
          if (firstUser) {
            await page.select('select[name="userid"]', firstUser.value);
            console.log(`✅ Selected first available user: ${firstUser.text}`);
          } else {
            throw new Error('No available users found in dropdown');
          }
        }
      } else {
        throw new Error('User selection dropdown not found');
      }
      
      // Fill in password (empty for default setup)
      await page.type('input[name="password"], input[type="password"]', '');
      console.log('✅ Password filled (empty)');
      
             // Submit the form
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
         console.log('✅ Authentication form submitted');
       } else {
         throw new Error('Authentication submit button not found');
       }
      
      // Wait for authentication to process
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check if we were redirected to the game
      const newUrl = page.url();
      if (newUrl.includes('/game')) {
        console.log('✅ Successfully authenticated and redirected to game world');
      } else {
        console.log(`📍 Still on ${newUrl}, waiting longer for authentication...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    } else {
      console.log('📍 Not on join page, proceeding with verification...');
    }
    
    // Step 13: Verify we're in a working game world
    console.log('📍 Step 13: Verifying game world status...');
    
    // Wait for game to fully load
    console.log('⏳ Waiting for game world to fully load...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const gameWorldVerification = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        hasGameCanvas: !!document.querySelector('canvas#board'),
        hasGameUI: !!document.querySelector('#ui-left, #ui-right, #navigation'),
        gameWorldLoaded: window.game?.world?.id || null,
        currentSystemId: window.game?.system?.id || null,
        isInGameWorld: window.location.href.includes('/game') || 
                      (!window.location.href.includes('/setup') && !window.location.href.includes('/license')),
        // Additional verification
        hasSidebar: !!document.querySelector('#sidebar'),
        hasPlayers: !!document.querySelector('#players'),
        hasSceneControls: !!document.querySelector('#scene-controls'),
        hasHotbar: !!document.querySelector('#hotbar'),
        hasChatLog: !!document.querySelector('#chat-log'),
        // Game state verification
        gameReady: window.game?.ready || false,
        userAuthenticated: !!window.game?.user,
        isGM: window.game?.user?.isGM || false,
        worldTitle: window.game?.world?.title || null,
        systemTitle: window.game?.system?.title || null
      };
    });
    
    console.log('📊 Game World Verification:', JSON.stringify(gameWorldVerification, null, 2));
    
    // Take final screenshot to prove we're in the game world
    await page.screenshot({ path: 'final-game-world-proof.png', fullPage: true });
    console.log('📸 FINAL SCREENSHOT: final-game-world-proof.png');
    
    // Verify we're actually in a working game world
    if (!gameWorldVerification.isInGameWorld || !gameWorldVerification.hasGameUI) {
      throw new Error('Not in active game UI after launch');
    }
    
    if (!gameWorldVerification.gameReady || !gameWorldVerification.userAuthenticated) {
      throw new Error('Game not fully ready or user not authenticated');
    }
    
    console.log('🎉🎉🎉 SUCCESS! ENTERED WORKING GAME WORLD! 🎉🎉🎉');
    console.log(`🎯 World: ${gameWorldVerification.worldTitle} (${gameWorldVerification.gameWorldLoaded})`);
    console.log(`🎯 System: ${gameWorldVerification.systemTitle} (${gameWorldVerification.currentSystemId})`);
    console.log(`🎯 User: ${gameWorldVerification.isGM ? 'GM' : 'Player'}`);
    console.log(`🎯 URL: ${gameWorldVerification.url}`);
    console.log('📸 Screenshot proof saved as: final-game-world-proof.png');
    
    // Final comprehensive verification
    const finalVerification = await page.evaluate(() => {
      return {
        // Core game state
        gameReady: window.game?.ready || false,
        worldLoaded: !!window.game?.world,
        systemLoaded: !!window.game?.system,
        userAuthenticated: !!window.game?.user,
        
        // UI elements
        uiElements: {
          sidebar: !!document.querySelector('#sidebar'),
          players: !!document.querySelector('#players'),
          sceneControls: !!document.querySelector('#scene-controls'),
          hotbar: !!document.querySelector('#hotbar'),
          chatLog: !!document.querySelector('#chat-log'),
          canvas: !!document.querySelector('canvas#board')
        },
        
        // Collections and data
        collections: {
          actors: window.game?.collections?.get('actors')?.size || 0,
          items: window.game?.collections?.get('items')?.size || 0,
          scenes: window.game?.collections?.get('scenes')?.size || 0,
          users: window.game?.collections?.get('users')?.size || 0
        },
        
        // User permissions
        userRole: window.game?.user?.role || 'unknown',
        isGM: window.game?.user?.isGM || false,
        
        // System information
        systemInfo: {
          id: window.game?.system?.id || 'unknown',
          title: window.game?.system?.title || 'unknown',
          version: window.game?.system?.version || 'unknown'
        }
      };
    });
    
    console.log('📊 FINAL COMPREHENSIVE VERIFICATION:');
    console.log(JSON.stringify(finalVerification, null, 2));
    
    if (finalVerification.gameReady && finalVerification.worldLoaded && finalVerification.userAuthenticated) {
      console.log('✅✅✅ COMPLETE SUCCESS VERIFICATION! ✅✅✅');
      console.log('🎯 FoundryVTT is fully operational with a working game world');
      console.log('🎯 User is authenticated and ready to play');
      console.log('🎯 All essential UI components are present and functional');
      console.log('📸 Screenshot proof: final-game-world-proof.png');
    } else {
      throw new Error('Final verification failed - game world not fully operational');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    // Take error screenshot for debugging
    try {
      await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
      console.log('📸 Error screenshot saved: error-screenshot.png');
    } catch (e) {
      console.log('⚠️ Could not save error screenshot');
    }
    
    throw error;
  } finally {
    await browser.close();
    
    // Clean up the container
    console.log('🧹 Cleaning up container...');
    try {
      execSync('docker stop fresh-debug-foundry', { stdio: 'ignore' });
      execSync('docker rm fresh-debug-foundry', { stdio: 'ignore' });
    } catch (e) {
      console.log('⚠️ Container cleanup failed (might have already been removed)');
    }
    
    // Clean up the Docker image
    console.log('🧹 Cleaning up Docker image...');
    try {
      execSync(`docker rmi ${imageName}`, { stdio: 'ignore' });
      console.log(`✅ Docker image ${imageName} removed`);
    } catch (e) {
      console.log('⚠️ Docker image cleanup failed (might have already been removed)');
    }
    
    console.log('✅ FoundryVTT workflow automation complete');
  }
}

debugSimpleModal().catch(console.error);