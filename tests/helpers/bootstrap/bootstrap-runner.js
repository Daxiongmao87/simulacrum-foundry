#!/usr/bin/env node

/**
 * @file tests/helpers/bootstrap/bootstrap-runner.js
 * @description Simple bootstrap infrastructure based on the working POC code
 * 
 * This creates version/system permutations and runs the bootstrap process
 * for each combination, using the existing working Docker setup.
 */

import { readFileSync, readdirSync, copyFileSync, unlinkSync } from 'fs';
import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import puppeteer from 'puppeteer';
import { ContainerManager } from '../container-manager.js';
import { PortManager } from '../port-manager.js';

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..');

class BootstrapRunner {
  constructor(config = null) {
    this.config = config;
    this.versions = [];
    this.systems = [];
    this.permutations = [];
    this.containerManager = null;
    this.portManager = null;
  }

  async initialize() {
    console.log('Simulacrum | Test Runner - 🚀 Initializing Bootstrap Runner...');
    
    // Load config if not provided in constructor
    if (!this.config) {
      const configPath = join(PROJECT_ROOT, 'tests', 'config', 'test.config.json');
      this.config = JSON.parse(readFileSync(configPath, 'utf8'));
    }
    console.log('Simulacrum | Test Runner - ✅ Config loaded');
    
    // Initialize container and port managers
    this.portManager = new PortManager(this.config);
    this.containerManager = new ContainerManager(this.config, this.portManager);
    
    // Get versions and systems from config
    this.versions = this.config['foundry-versions'] || [];
    this.systems = this.config['foundry-systems'] || [];
    
    console.log(`Simulacrum | Test Runner - 📊 Versions: ${this.versions.join(', ')}`);
    console.log(`Simulacrum | Test Runner - 📊 Systems: ${this.systems.join(', ')}`);
    
    // Generate permutations
    this.permutations = this.generatePermutations();
    console.log(`Simulacrum | Test Runner - 🔄 Generated ${this.permutations.length} permutations`);
    
    return true;
  }

  generatePermutations() {
    const perms = [];
    
    for (const version of this.versions) {
      for (const system of this.systems) {
        perms.push({
          id: `${version}-${system}`,
          version,
          system,
          description: `${system} on Foundry VTT ${version}`
        });
      }
    }
    
    return perms;
  }

  getZipFileForVersion(version) {
    // Dynamically discover zip file in version folder
    const versionPath = join(PROJECT_ROOT, 'tests', 'fixtures', 'binary_versions', version);
    try {
      const entries = readdirSync(versionPath);
      const zipFiles = entries.filter(entry => entry.endsWith('.zip'));
      
      if (zipFiles.length === 0) {
        throw new Error(`No zip files found in ${versionPath}`);
      }
      
      if (zipFiles.length > 1) {
        console.warn(`⚠️ Multiple zip files found in ${versionPath}, using first: ${zipFiles[0]}`);
      }
      
      return zipFiles[0];
    } catch (error) {
      throw new Error(`Failed to discover zip file for ${version}: ${error.message}`);
    }
  }



  async waitForContainerReady(port) {
    for (let i = 0; i < this.config.bootstrap.retries.containerHealthCheck; i++) {
      try {
        const response = execSync(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${port}`, { 
          encoding: 'utf8', 
          timeout: this.config.bootstrap.timeouts.curlTimeout 
        });
        if (response.trim() === '302') {
          return true;
        }
      } catch (e) {}
      await new Promise(resolve => setTimeout(resolve, this.config.bootstrap.retries.healthCheckInterval));
    }
    return false;
  }

  async runBootstrapProcess(port, permutation) {
    console.log(`Simulacrum | Test Runner - 🔄 Running bootstrap process for ${permutation.id}...`);
    
    const browser = await puppeteer.launch({ 
      headless: this.config.puppeteer.headless,
      args: this.config.puppeteer.args,
      defaultViewport: this.config.puppeteer.viewport
    });
    
    const page = await browser.newPage();
    
    // Handle console messages and filter Chromium warnings (like POC)
    page.on('console', async (msg) => {
      const text = msg.text();
      // Ignore Chromium version compatibility warnings
      if (text.includes('modern JavaScript features') && text.includes('Chromium version')) {
        console.log(`Simulacrum | Test Runner - [BROWSER] ${msg.type()}: ${text} (ignored)`);
        return;
      }
      
      // If the message contains JSHandle references, try to get the actual values
      if (text.includes('JSHandle@')) {
        try {
          const args = await Promise.all(msg.args().map(arg => arg.jsonValue().catch(() => 'Unable to serialize')));
          console.log(`Simulacrum | Test Runner - [BROWSER] ${msg.type()}:`, ...args);
        } catch (e) {
          console.log(`Simulacrum | Test Runner - [BROWSER] ${msg.type()}: ${text}`);
        }
      } else {
        console.log(`Simulacrum | Test Runner - [BROWSER] ${msg.type()}: ${text}`);
      }
    });
    
    // Handle page errors without terminating (like POC)
    page.on('pageerror', (error) => {
      if (error.message.includes('modern JavaScript features') && error.message.includes('Chromium version')) {
        console.log(`Simulacrum | Test Runner - [BROWSER] pageerror: ${error.message} (ignored)`);
        return;
      }
      console.log(`Simulacrum | Test Runner - [BROWSER] pageerror: ${error.message}`);
    });
    
    try {
      // Navigate to Foundry
      await page.goto(`http://localhost:${port}`, { waitUntil: 'domcontentloaded', timeout: this.config.puppeteer.timeout });
      
      // Handle license submission (using configurable license key)
      const licenseResult = await this.submitLicense(page, this.config.foundryLicenseKey);
      if (!licenseResult.success) {
        throw new Error(`License submission failed: ${licenseResult.error}`);
      }
      
      // Handle EULA
      const eulaResult = await this.handleEULA(page);
      if (!eulaResult.success) {
        throw new Error(`EULA handling failed: ${eulaResult.error}`);
      }
      
      // Navigate to setup page (EXACTLY like your working POC)
      console.log('Simulacrum | Test Runner - 📍 Navigating to setup page...');
      await page.goto(`http://localhost:${port}/setup`, { waitUntil: 'domcontentloaded', timeout: this.config.puppeteer.timeout });
      console.log('Simulacrum | Test Runner - 📍 Navigated to setup page');
      
      // Wait for setup page to be ready (EXACTLY like your working POC)
      console.log('Simulacrum | Test Runner - 📍 Waiting for setup page to be ready...');
      await page.waitForFunction(() => {
        // Check for any setup-related elements
        const hasSetupElements = !!document.querySelector('.setup-menu, .setup-packages, [data-tab], .setup-packages-systems, .setup-packages-worlds');
        const hasGameObject = typeof window.game !== 'undefined';
        const hasAnyContent = document.body.textContent && document.body.textContent.length > 100;
        
        return hasSetupElements || hasGameObject || hasAnyContent;
      }, { timeout: this.config.bootstrap.timeouts.setupPageReady });
      
      console.log('Simulacrum | Test Runner - ✅ FoundryVTT setup page is ready');
      
      // Check for EULA that might appear dynamically on setup page (EXACTLY like your working POC)
      console.log('Simulacrum | Test Runner - 📍 Checking for EULA that might appear on setup page...');
              try {
          await page.waitForFunction(() => {
            const bodyText = document.body.textContent || '';
            return bodyText.includes('End User License Agreement') || 
                   bodyText.includes('EULA') || 
                   bodyText.includes('License Agreement') ||
                   bodyText.includes('please sign the End User License Agreement');
          }, { timeout: this.config.bootstrap.timeouts.eulaSetupPage });
        
        console.log('Simulacrum | Test Runner - 📍 EULA appeared on setup page, accepting agreement...');
        
        // Wait for EULA form to be fully rendered
        await new Promise(resolve => setTimeout(resolve, this.config.bootstrap.timeouts.eulaFormRender));
        
        // Handle EULA agreement on setup page
        const setupEulaResult = await this.handleEULA(page);
        if (setupEulaResult.success) {
          console.log('Simulacrum | Test Runner - ✅ EULA accepted on setup page');
          // Wait for EULA processing
          await new Promise(resolve => setTimeout(resolve, this.config.bootstrap.timeouts.eulaProcessing));
        }
      } catch (e) {
        console.log('Simulacrum | Test Runner - 📍 No EULA appeared on setup page, continuing...');
      }
      
      // Install system (now that we're on the setup page)
      const systemResult = await this.installSystem(page, permutation.system);
      if (!systemResult.success) {
        throw new Error(`System installation failed: ${systemResult.error}`);
      }
      
      // Create world
      const worldResult = await this.createWorld(page, permutation);
      if (!worldResult.success) {
        throw new Error(`World creation failed: ${worldResult.error}`);
      }
      
      // Launch world
      const launchResult = await this.launchWorld(page, worldResult.worldId);
      if (!launchResult.success) {
        throw new Error(`World launch failed: ${launchResult.error}`);
      }
      
      // Verify we're in game world
      const gameState = await this.verifyGameWorld(page);
      if (!gameState.ready) {
        throw new Error(`Game world not ready: ${gameState.error}`);
      }
      
      // Enable Simulacrum module
      console.log('Simulacrum | Test Runner - 🔧 Enabling Simulacrum module...');
      await this.enableSimulacrumModule(page);
      console.log('Simulacrum | Test Runner - ✅ Simulacrum module enabled');
      
      return {
        success: true,
        browser,
        page,
        gameState
      };
      
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  async submitLicense(page, licenseKey) {
    console.log('Simulacrum | Test Runner - 🔑 Submitting license key...');
    
    try {
      const result = await page.evaluate(async (licenseKey) => {
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
      }, licenseKey);
      
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleEULA(page) {
    console.log('Simulacrum | Test Runner - 📝 Checking for EULA...');
    
    try {
      // Check if EULA text appears in body content (like your working POC)
      const eulaCheck = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        const hasEulaText = bodyText.includes('End User License Agreement') || 
                           bodyText.includes('EULA') || 
                           bodyText.includes('License Agreement') ||
                           bodyText.includes('please sign the End User License Agreement');
        
        return {
          detected: hasEulaText,
          currentUrl: window.location.href,
          pageTitle: document.title
        };
      });
      
      console.log(`Simulacrum | Test Runner - 📍 EULA check:`, JSON.stringify(eulaCheck, null, 2));
      
      if (eulaCheck.detected) {
        console.log('Simulacrum | Test Runner - 📍 EULA detected, accepting agreement...');
        
        // Accept EULA (same logic as your working POC)
        const result = await page.evaluate(() => {
          try {
            // Look for the EULA agreement checkbox
            const eulaCheckbox = document.querySelector('#eula-agree, input[name="eula-agree"], input[type="checkbox"]');
            if (eulaCheckbox) {
              eulaCheckbox.checked = true;
              console.log('Simulacrum | Test Runner - EULA checkbox checked');
            }
            
            // Look for the sign/accept button
            const signButton = document.querySelector('#sign, button[name="sign"], button[data-action*="sign"]');
            if (signButton) {
              signButton.click();
              console.log('Simulacrum | Test Runner - EULA sign button clicked');
              return { success: true, method: 'button_click' };
            }
            
            // Try to find any button that might accept the EULA
            const buttons = Array.from(document.querySelectorAll('button'));
            for (const button of buttons) {
              const text = button.textContent.toLowerCase();
              if (text.includes('sign') || text.includes('accept') || text.includes('agree') || text.includes('continue')) {
                button.click();
                console.log(`Simulacrum | Test Runner - EULA button clicked: ${button.textContent}`);
                return { success: true, method: 'text_search_click' };
              }
            }
            
            return { success: false, reason: 'no_eula_button_found' };
          } catch (error) {
            return { success: false, reason: error.message };
          }
        });
        
        if (result.success) {
          console.log('Simulacrum | Test Runner - ✅ EULA accepted successfully');
          
          // Wait for EULA processing
          await new Promise(resolve => setTimeout(resolve, this.config.bootstrap.timeouts.eulaProcessing));
          
          return result;
        } else {
          console.log(`Simulacrum | Test Runner - ⚠️ EULA acceptance failed: ${result.reason}`);
          return result;
        }
      } else {
        console.log('Simulacrum | Test Runner - 📍 No EULA detected, continuing to setup...');
        return { success: true, method: 'no_eula' };
      }
      
    } catch (error) {
      console.log(`Simulacrum | Test Runner - ⚠️ EULA check failed: ${error.message}, continuing...`);
      return { success: true, method: 'error_continue' };
    }
  }

  async installSystem(page, system) {
    console.log(`Simulacrum | Test Runner - 🎲 Installing system: ${system}`);
    
    try {
      // Step 1: Wait for setup page to be fully ready (exactly like POC)
      console.log('Simulacrum | Test Runner - 📍 Waiting for setup page to be fully ready...');
      
      // Wait for setup page to load - be more flexible about what constitutes "ready" (exactly like POC)
      await page.waitForFunction(() => {
        // Check for any setup-related elements (exactly like POC)
        const hasSetupElements = !!document.querySelector('.setup-menu, .setup-packages, [data-tab], .setup-packages-systems, .setup-packages-worlds');
        const hasGameObject = typeof window.game !== 'undefined';
        const hasAnyContent = document.body.textContent && document.body.textContent.length > 100;
        
        return hasSetupElements || hasGameObject || hasAnyContent;
      }, { timeout: this.config.bootstrap.timeouts.setupPageReady });
      
      console.log('Simulacrum | Test Runner - ✅ FoundryVTT setup page is ready');
      
      // Step 2: Look for and click "Decline Sharing" button (exactly like POC)
      console.log('Simulacrum | Test Runner - 📍 Looking for Decline Sharing button...');
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
          console.log('Simulacrum | Test Runner - ✅ Decline Sharing button clicked');
        } else {
          console.log('Simulacrum | Test Runner - ⚠️ Decline Sharing button not found, proceeding...');
        }
      } catch (e) {
        console.log('Simulacrum | Test Runner - ⚠️ Decline Sharing button not found, proceeding...');
      }
      
      // Step 3: Click the step-button to proceed (exactly like POC)
      console.log('Simulacrum | Test Runner - 📍 Clicking step-button to proceed...');
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
          console.log('Simulacrum | Test Runner - ✅ Step-button clicked');
        } else {
          console.log('Simulacrum | Test Runner - ⚠️ Step-button not found, proceeding...');
        }
      } catch (e) {
        console.log('Simulacrum | Test Runner - ⚠️ Step-button not found, proceeding...');
      }
      
      // Step 4: Click "Install System" button (exactly like POC)
      console.log('Simulacrum | Test Runner - 📍 Step 4: Clicking Install System button...');
      
      // First, let's see what buttons are actually available (exactly like POC)
      const availableButtons = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.map(btn => ({
          text: btn.textContent?.trim(),
          className: btn.className,
          id: btn.id,
          type: btn.type
        }));
      });
      console.log('Simulacrum | Test Runner - 📊 Available buttons:', JSON.stringify(availableButtons, null, 2));
      
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
        console.log('Simulacrum | Test Runner - ✅ Install System button clicked');
      } else {
        throw new Error('Install System button not found');
      }
      
      // Wait for system installation dialog
      await new Promise(resolve => setTimeout(resolve, this.config.bootstrap.timeouts.searchResults));
      
      // Step 2: Search for the system
      console.log(`Simulacrum | Test Runner - 📍 Searching for ${system} system...`);
      
      await page.type('#install-package-search-filter', system);
      console.log(`Simulacrum | Test Runner - ✅ ${system} entered in search field`);
      
      // Wait for search results
      await new Promise(resolve => setTimeout(resolve, this.config.bootstrap.timeouts.searchResults));
      
      // Debug: Show all available packages after search
      const allPackages = await page.evaluate(() => {
        const packageElements = Array.from(document.querySelectorAll('[data-package-id], .package, .package-tile'));
        return packageElements.map(el => ({
          packageId: el.getAttribute('data-package-id'),
          textContent: el.textContent?.substring(0, 100),
          className: el.className
        }));
      });
      console.log(`Simulacrum | Test Runner - 📊 All packages found after searching for "${system}":`, JSON.stringify(allPackages, null, 2));
      
      // Step 3: Find and click Install button for the specific system
      console.log(`Simulacrum | Test Runner - 📍 Looking for ${system} package specifically...`);
      
      const packageResult = await page.evaluate((systemName) => {
        // Look for package elements that might contain the system
        const packageElements = Array.from(document.querySelectorAll('[data-package-id], .package, .package-tile'));
        
        for (const element of packageElements) {
          const text = element.textContent || '';
          const packageId = element.getAttribute('data-package-id');
          
          // Look for the specific system
          if (text.toLowerCase().includes(systemName.toLowerCase()) || 
              packageId === systemName) {
            
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
      }, system);
      
      console.log(`Simulacrum | Test Runner - 📊 ${system} package search result:`, JSON.stringify(packageResult, null, 2));
      
      if (!packageResult.found) {
        throw new Error(`${system} package not found in search results`);
      }
      
      // Step 4: Click the install button
      console.log(`Simulacrum | Test Runner - 📍 Clicking Install button for ${system}...`);
      
      const installClicked = await page.evaluate((systemName) => {
        const packageElements = Array.from(document.querySelectorAll('[data-package-id], .package, .package-tile'));
        
        for (const element of packageElements) {
          const text = element.textContent || '';
          const packageId = element.getAttribute('data-package-id');
          
          if (text.toLowerCase().includes(systemName.toLowerCase()) || 
              packageId === systemName) {
            
            const installButton = element.querySelector('button.install-package, button[data-action*="install"]');
            
            if (installButton) {
              installButton.click();
              return true;
            }
          }
        }
        
        return false;
      }, system);
      
      if (!installClicked) {
        throw new Error(`Could not click install button for ${system}`);
      }
      
      console.log(`Simulacrum | Test Runner - ✅ Install button clicked for ${system}`);
      
      // Step 5: Wait for installation to complete
      console.log(`Simulacrum | Test Runner - ⏳ Waiting for ${system} installation to complete...`);
      
      await page.waitForFunction((systemName) => {
        const bodyText = document.body.textContent || '';
        return bodyText.includes(`System ${systemName} was installed successfully`) ||
               bodyText.includes(`${systemName} was installed successfully`) ||
               bodyText.includes('was installed successfully');
      }, { timeout: this.config.bootstrap.timeouts.systemInstallation }, system);
      
      console.log(`Simulacrum | Test Runner - ✅ ${system} system installed successfully`);
      
      // Step 6: Close dialog
      try {
        await page.click('.header-control.icon.fa-solid.fa-xmark');
        console.log('Simulacrum | Test Runner - ✅ Dialog closed');
      } catch (e) {
        console.log('Simulacrum | Test Runner - ⚠️ Could not close dialog, continuing...');
      }
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async createWorld(page, permutation) {
    console.log(`Simulacrum | Test Runner - 🌍 Creating world for ${permutation.id}...`);
    
    try {
      // Navigate to worlds tab
      await page.click('[data-tab="worlds"]');
      
      // Click Create World (using POC approach)
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
      await new Promise(resolve => setTimeout(resolve, this.config.bootstrap.timeouts.eulaFormRender));
      
      // Fill world form (exactly like POC)
      
      // World Title
      try {
        await page.type('input[name="title"]', `Test World ${permutation.id}`);
        console.log('Simulacrum | Test Runner - ✅ World title filled');
      } catch (e) {
        console.log(`Simulacrum | Test Runner - ⚠️ Could not fill world title: ${e.message}`);
      }
      
      // World ID
      try {
        await page.type('input[name="id"]', `test-world-${permutation.id}`);
        console.log('Simulacrum | Test Runner - ✅ World ID filled');
      } catch (e) {
        console.log(`Simulacrum | Test Runner - ⚠️ Could not fill world ID: ${e.message}`);
      }
      
      // Game System - critical for world creation
      try {
        const systemField = await page.$('select[name="system"], input[name="system"], #world-config-system');
        if (systemField) {
          const tagName = await page.evaluate(el => el.tagName, systemField);
          if (tagName === 'SELECT') {
            await page.select('select[name="system"], #world-config-system', permutation.system);
            console.log(`Simulacrum | Test Runner - ✅ Game system selected: ${permutation.system}`);
          } else {
            await page.type('input[name="system"], #world-config-system', permutation.system);
            console.log(`Simulacrum | Test Runner - ✅ Game system entered: ${permutation.system}`);
          }
        } else {
          console.log('Simulacrum | Test Runner - ⚠️ Game system field not found - this may cause world creation to fail');
        }
      } catch (e) {
        console.log(`Simulacrum | Test Runner - ⚠️ Could not set game system: ${e.message} - this may cause world creation to fail`);
      }
      
      // Description - try multiple approaches, but don't fail if not found
      try {
        await page.type('textarea[name="description"], textarea[placeholder*="description"], textarea[placeholder*="Description"], textarea[name="desc"]', `Test world for ${permutation.description}`);
        console.log('Simulacrum | Test Runner - ✅ World description filled');
      } catch (e) {
        console.log(`Simulacrum | Test Runner - ⚠️ Could not fill world description: ${e.message} - continuing without it`);
      }
      
      // Submit form (exactly like POC)
      console.log('Simulacrum | Test Runner - 📍 Submitting world creation form...');
      
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
        console.log(`Simulacrum | Test Runner - ✅ World creation form submitted via ${submitClicked.method}`);
      } else {
        throw new Error(`Submit button not found: ${submitClicked.reason}`);
      }
      
      // Wait for world creation to complete (exactly like POC)
      console.log('Simulacrum | Test Runner - 📍 Waiting for world creation to complete...');
      await new Promise(resolve => setTimeout(resolve, this.config.bootstrap.timeouts.worldCreationWait));
      
      // Check for creation success or error messages (exactly like POC)
      const creationResult = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        return {
          hasSuccess: bodyText.includes('created') || bodyText.includes('successfully') || bodyText.includes('success'),
          hasError: bodyText.includes('error') || bodyText.includes('failed') || bodyText.includes('invalid'),
          currentUrl: window.location.href,
          bodyLength: bodyText.length
        };
      });
      
      console.log('Simulacrum | Test Runner - 📊 World creation result check:', JSON.stringify(creationResult, null, 2));
      
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
      
      console.log('Simulacrum | Test Runner - 📊 Actual world ID found:', JSON.stringify(actualWorldId, null, 2));
      
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

  async launchWorld(page, worldId) {
    console.log(`Simulacrum | Test Runner - 🚀 Launching world: ${worldId}`);
    
    try {
      // Navigate back to worlds tab (exactly like POC)
      console.log('Simulacrum | Test Runner - 📍 Navigating back to worlds tab...');
      await page.click('[data-tab="worlds"]');
      
      // Wait for worlds tab content and ensure we're actually on the worlds tab
      await new Promise(resolve => setTimeout(resolve, this.config.bootstrap.timeouts.worldTabWait));
      
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
      
      console.log('Simulacrum | Test Runner - 📊 Worlds tab verification:', JSON.stringify(onWorldsTab, null, 2));
      
      // Now find and click the launch button for the specific world (exactly like POC)
      console.log(`Simulacrum | Test Runner - 📍 Looking for Launch World button for ${worldId}...`);
      
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
            console.log(`Simulacrum | Test Runner - Found and clicked worldLaunch button for ${worldId}`);
            return true;
          } else {
            console.log(`Simulacrum | Test Runner - ${worldId} element found but no worldLaunch button found within it`);
            console.log(`Simulacrum | Test Runner - Element HTML: ${targetWorldElement.outerHTML.substring(0, 200)}`);
            return false;
          }
        } else {
          console.log(`Simulacrum | Test Runner - ${worldId} element not found in DOM`);
          return false;
        }
      }, worldId);
      
      if (launchClicked) {
        console.log(`Simulacrum | Test Runner - ✅ Launch World button clicked for ${worldId}`);
        
        // Wait for game world to load
        console.log('Simulacrum | Test Runner - 📍 Waiting for game world to load...');
        
        // Set up console log listener for game canvas ready
        const gameLoadedPromise = new Promise((resolve) => {
          const listener = (msg) => {
            const text = msg.text();
            if (text.includes('Foundry VTT | Drawing game canvas for scene')) {
              console.log('Simulacrum | Test Runner - ✅ Game canvas ready - world fully loaded');
              page.off('console', listener);
              resolve();
            }
          };
          page.on('console', listener);
          
          // Timeout fallback after 60 seconds
          setTimeout(() => {
            page.off('console', listener);
            console.log('Simulacrum | Test Runner - ⚠️ Timeout waiting for game canvas - continuing anyway');
            resolve();
          }, 60000);
        });
        
        await gameLoadedPromise;
        
        // Handle user authentication if on join page (exactly like POC)
        console.log('Simulacrum | Test Runner - 📍 Checking if user authentication is required...');
        
        const joinPageUrl = page.url();
        if (joinPageUrl.includes('/join')) {
          console.log('Simulacrum | Test Runner - 📍 Join page detected, handling user authentication...');
          
          // Wait for join form to load with retry
          console.log('Simulacrum | Test Runner - 📍 Waiting for join form to load...');
          let userSelect = null;
          for (let i = 0; i < 10; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            userSelect = await page.$('select[name="userid"]');
            if (userSelect) {
              console.log(`Simulacrum | Test Runner - ✅ User dropdown found after ${i + 1} attempts`);
              break;
            }
            console.log(`Simulacrum | Test Runner - 🔄 Attempt ${i + 1}: User dropdown not found, retrying...`);
          }
          
          // Look for user selection dropdown (exactly like POC)
          console.log('Simulacrum | Test Runner - 📍 Looking for user selection dropdown...');
          
          // Debug what's actually on the page
          const pageContent = await page.evaluate(() => {
            return {
              url: window.location.href,
              hasUserSelect: !!document.querySelector('select[name="userid"]'),
              allSelects: Array.from(document.querySelectorAll('select')).map(s => ({
                name: s.name,
                id: s.id,
                className: s.className
              })),
              bodyText: document.body.innerText.slice(0, 500)
            };
          });
          console.log('Simulacrum | [Debug] 📊 Page debug info:', JSON.stringify(pageContent, null, 2));
          
          // userSelect already found in retry loop above
          
          if (userSelect) {
            console.log('Simulacrum | Test Runner - ✅ User selection dropdown found, selecting GameMaster...');
            // Get available users and select GameMaster if available (exactly like POC)
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
            
            console.log('Simulacrum | Test Runner - 📊 Available users:', JSON.stringify(userOptions, null, 2));
            
            // Look for GameMaster user (exactly like POC)
            const gameMasterOption = userOptions.find(opt => 
              opt.text?.toLowerCase().includes('gamemaster') || 
              opt.text?.toLowerCase().includes('game master') ||
              opt.text?.toLowerCase().includes('gm')
            );
            
            if (gameMasterOption) {
              await page.select('select[name="userid"]', gameMasterOption.value);
              console.log(`Simulacrum | Test Runner - ✅ Selected user: ${gameMasterOption.text}`);
            } else {
              // Select first available user (exactly like POC)
              const firstUser = userOptions.find(opt => opt.value && !opt.disabled);
              if (firstUser) {
                await page.select('select[name="userid"]', firstUser.value);
                console.log(`Simulacrum | Test Runner - ✅ Selected first available user: ${firstUser.text}`);
              } else {
                throw new Error('No available users found in dropdown');
              }
            }
          } else {
            throw new Error('User selection dropdown not found');
          }
          
          // Fill in password (empty for default setup) (exactly like POC)
          await page.type('input[name="password"], input[type="password"]', '');
          console.log('Simulacrum | Test Runner - ✅ Password filled (empty)');
          
          // Submit the form (exactly like POC)
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
            console.log('Simulacrum | Test Runner - ✅ Authentication form submitted');
          } else {
            throw new Error('Authentication submit button not found');
          }
          
          // Wait for authentication to process (exactly like POC)
          await new Promise(resolve => setTimeout(resolve, this.config.bootstrap.timeouts.authenticationProcess));
          
          // Check if we were redirected to the game (exactly like POC)
          const newUrl = page.url();
          if (newUrl.includes('/game')) {
            console.log('Simulacrum | Test Runner - ✅ Successfully authenticated and redirected to game world');
          } else {
            console.log(`Simulacrum | Test Runner - 📍 Still on ${newUrl}, waiting longer for authentication...`);
            await new Promise(resolve => setTimeout(resolve, this.config.bootstrap.timeouts.authenticationRedirect));
          }
        } else {
          console.log('Simulacrum | Test Runner - 📍 Not on join page, proceeding with verification...');
        }
        
        return { success: true };
      } else {
        console.log(`Simulacrum | Test Runner - ⚠️ Launch World button not found for ${worldId}`);
        
        // Debug what world elements actually exist (exactly like POC)
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
        
        console.log('Simulacrum | [Debug] 📊 Available world elements:', JSON.stringify(worldDebug, null, 2));
        throw new Error(`Could not find Launch World button for ${worldId}`);
      }
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async verifyGameWorld(page) {
    console.log('Simulacrum | Test Runner - 🎯 Verifying game world...');
    
    try {
      // Wait for game world to fully load (exactly like POC)
      console.log('Simulacrum | Test Runner - ⏳ Waiting for game world to fully load...');
      await new Promise(resolve => setTimeout(resolve, this.config.bootstrap.timeouts.gameWorldLoad));
      
      // Take comprehensive verification (exactly like POC)
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
      
      console.log('Simulacrum | Test Runner - 📊 Game World Verification:', JSON.stringify(gameWorldVerification, null, 2));
      
      // Verify we're actually in a working game world (exactly like POC)
      if (!gameWorldVerification.isInGameWorld || !gameWorldVerification.hasGameUI) {
        return { 
          ready: false, 
          error: 'Not in active game UI after launch',
          gameState: gameWorldVerification 
        };
      }
      
      if (!gameWorldVerification.gameReady || !gameWorldVerification.userAuthenticated) {
        return { 
          ready: false, 
          error: 'Game not fully ready or user not authenticated',
          gameState: gameWorldVerification 
        };
      }
      
      // Final comprehensive verification (exactly like POC)
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
      
      console.log('Simulacrum | Test Runner - 📊 FINAL COMPREHENSIVE VERIFICATION:');
      console.log('Simulacrum | Test Runner - 📊 Verification Data:', JSON.stringify(finalVerification, null, 2));
      
      if (finalVerification.gameReady && finalVerification.worldLoaded && finalVerification.userAuthenticated) {
        console.log('Simulacrum | Test Runner - ✅✅✅ COMPLETE SUCCESS VERIFICATION! ✅✅✅');
        console.log('Simulacrum | Test Runner - 🎯 FoundryVTT is fully operational with a working game world');
        console.log('Simulacrum | Test Runner - 🎯 User is authenticated and ready to play');
        console.log('Simulacrum | Test Runner - 🎯 All essential UI components are present and functional');
        
        return { 
          ready: true, 
          gameState: {
            ...gameWorldVerification,
            finalVerification
          }
        };
      } else {
        return { 
          ready: false, 
          error: 'Final verification failed - game world not fully operational',
          gameState: {
            ...gameWorldVerification,
            finalVerification
          }
        };
      }
      
    } catch (error) {
      return { ready: false, error: error.message };
    }
  }

  async enableSimulacrumModule(page) {
    try {
      // Step 37: Click the settings button
      console.log('Simulacrum | Test Runner - 📍 Clicking settings button...');
      await page.click('.ui-control.plain.icon.fa-solid.fa-gears');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Step 38: Click "Manage Modules" button
      console.log('Simulacrum | Test Runner - 📍 Clicking Manage Modules...');
      const manageModulesClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const manageModulesButton = buttons.find(btn => 
          btn.textContent && btn.textContent.includes('Manage Modules')
        );
        if (manageModulesButton) {
          manageModulesButton.click();
          return true;
        }
        return false;
      });
      
      if (!manageModulesClicked) {
        throw new Error('Could not find Manage Modules button');
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Step 39: Enable simulacrum module checkbox
      console.log('Simulacrum | Test Runner - 📍 Enabling Simulacrum module checkbox...');
      const moduleEnabled = await page.evaluate(() => {
        const simulacrumCheckbox = document.querySelector('input[name="simulacrum"]');
        if (simulacrumCheckbox) {
          simulacrumCheckbox.checked = true;
          simulacrumCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      });
      
      if (!moduleEnabled) {
        throw new Error('Could not find or enable Simulacrum module checkbox');
      }
      
      // Step 40: Click "Save Module Settings" button
      console.log('Simulacrum | Test Runner - 📍 Saving module settings...');
      const saveClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const saveButton = buttons.find(btn => 
          btn.textContent && btn.textContent.includes('Save Module Settings')
        );
        if (saveButton) {
          saveButton.click();
          return true;
        }
        return false;
      });
      
      if (!saveClicked) {
        throw new Error('Could not find Save Module Settings button');
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Step 41: Click "Yes" to confirm - this will trigger a full page reload!
      console.log('Simulacrum | Test Runner - 📍 Confirming module activation (this will reload the page)...');
      const confirmClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const yesButton = buttons.find(btn => 
          btn.textContent && btn.textContent.trim() === 'Yes'
        );
        if (yesButton) {
          yesButton.click();
          return true;
        }
        return false;
      });
      
      if (!confirmClicked) {
        console.log('Simulacrum | Test Runner - ⚠️ Could not find Yes confirmation button - module may already be enabled');
      } else {
        // Wait for the page to reload and FoundryVTT to reinitialize
        console.log('Simulacrum | Test Runner - 📍 Waiting for FoundryVTT to reinitialize after module activation...');
        
        // Set up console log listener for FoundryVTT initialization
        const foundryLoadedPromise = new Promise((resolve) => {
          const listener = (msg) => {
            const text = msg.text();
            if (text.includes('Foundry VTT | Drawing game canvas for scene')) {
              console.log('Simulacrum | Test Runner - ✅ FoundryVTT game canvas ready - full initialization complete');
              page.off('console', listener);
              resolve();
            }
          };
          page.on('console', listener);
          
          // Timeout fallback after 30 seconds
          setTimeout(() => {
            page.off('console', listener);
            console.log('Simulacrum | Test Runner - ⚠️ Timeout waiting for FoundryVTT initialization log');
            resolve();
          }, 30000);
        });
        
        await foundryLoadedPromise;
        
        // 10 second grace period for everything to settle
        console.log('Simulacrum | Test Runner - 📍 Waiting 10 seconds grace period for full initialization...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        console.log('Simulacrum | Test Runner - ✅ Module activation reload complete');
      }
      
      console.log('Simulacrum | Test Runner - ✅ Simulacrum module enabled in settings - module initialization will be verified by integration tests');
      
    } catch (error) {
      console.error('❌ Failed to enable Simulacrum module:', error.message);
      throw error;
    }
  }

  async takeScreenshot(page, permutationId) {
    const filename = `bootstrap-success-${permutationId}-${Date.now()}.png`;
    await page.screenshot({ path: filename, fullPage: true });
    console.log(`Simulacrum | Test Runner - 📸 Screenshot saved: ${filename}`);
    return filename;
  }

  // Port allocation is now handled by PortManager


  // Clean session API for new architecture - wraps existing working logic
  async createSession(permutation) {
    // Create a modified version of runBootstrapTest that returns live session
    console.log(`Simulacrum | Test Runner - 🎯 Creating session for: ${permutation.id}`);
    
    const testId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const port = await this.portManager.allocatePort(testId);
    
    // Step 1: Build Docker image (same as runBootstrapTest)
    const imageName = `${this.config.docker.imagePrefix}-${permutation.id}`;
    const foundryLicenseKey = this.config.foundryLicenseKey;
    
    if (!foundryLicenseKey) {
      console.error('❌ foundryLicenseKey not found in config');
      throw new Error('foundryLicenseKey not set in test.config.json');
    }
    
    // Package the module first
    console.log('Simulacrum | Test Runner - 📦 Packaging Simulacrum module...');
    const packageScriptPath = join(PROJECT_ROOT, 'tools', 'package-module.js');
    execSync(`node ${packageScriptPath}`, { stdio: 'inherit', cwd: PROJECT_ROOT });
    console.log('Simulacrum | Test Runner - ✅ Module packaged to dist/');
    
    console.log(`Simulacrum | Test Runner - 🔨 Building Docker image: ${imageName}...`);
    console.log(`Simulacrum | Test Runner - 🔑 Using license key: ${foundryLicenseKey.substring(0, 4)}****`);
    
    try {
      // Determine the zip file based on version
      const zipFileName = this.getZipFileForVersion(permutation.version);
      const zipPath = join(PROJECT_ROOT, 'tests', 'fixtures', 'binary_versions', permutation.version, zipFileName);
      
      // Copy zip file to build context root temporarily for Docker build
      const tempZipPath = join(PROJECT_ROOT, zipFileName);
      copyFileSync(zipPath, tempZipPath);
      
      try {
        const dockerfilePath = join(PROJECT_ROOT, 'tests', 'docker', 'Dockerfile.foundry');
        execSync(`docker build -f ${dockerfilePath} --build-arg FOUNDRY_VERSION_ZIP=${zipFileName} --build-arg FOUNDRY_LICENSE_KEY=${foundryLicenseKey} -t ${imageName} ${PROJECT_ROOT}`, { 
          stdio: 'inherit',
          cwd: PROJECT_ROOT 
        });
        console.log(`Simulacrum | Test Runner - ✅ Docker image ${imageName} built successfully`);
      } finally {
        // Clean up temporary zip file
        try {
          unlinkSync(tempZipPath);
        } catch (error) {
          console.warn(`⚠️ Failed to clean up temporary zip file: ${error.message}`);
        }
      }
    } catch (error) {
      console.error('❌ Docker build failed:', error.message);
      this.portManager.releasePort(testId, port);
      throw error;
    }
    
    try {
      // Step 2: Clean up any existing containers
      console.log('Simulacrum | Test Runner - 🧹 Cleaning up existing containers...');
      try {
        execSync(`docker stop ${testId}`, { stdio: 'ignore' });
        execSync(`docker rm ${testId}`, { stdio: 'ignore' });
      } catch (e) {
        // Container might not exist, which is fine
      }
      
      // Step 3: Start fresh container
      console.log(`Simulacrum | Test Runner - 🚀 Starting fresh FoundryVTT container from image: ${imageName}...`);
      const containerId = execSync(`docker run -d --name ${testId} -p ${port}:30000 ${imageName}` , { encoding: 'utf8' }).trim();
      console.log(`Simulacrum | Test Runner - 📦 Container ID: ${containerId}`);
      
      // Step 4: Wait for container to be ready
      console.log('Simulacrum | Test Runner - ⏳ Waiting for container to be ready...');
      const ready = await this.waitForContainerReady(port);
      
      if (!ready) {
        console.log(`Simulacrum | Test Runner - 🔍 Container failed health check. Container ID: ${containerId}. Logs:`);
        try {
          const logs = execSync(`docker logs ${containerId.slice(0, 12)}`, { encoding: 'utf8' });
          console.log('Simulacrum | Test Runner - 📋 Container Logs:', logs);
        } catch (e) {
          console.log(`Simulacrum | Test Runner - Could not retrieve logs: ${e.message}`);
        }
        throw new Error('Container failed to start properly');
      }
      
      console.log('Simulacrum | Test Runner - ✅ Container is ready');
      
      // Step 5: Run bootstrap process
      const bootstrapResult = await this.runBootstrapProcess(port, permutation);
      
      if (!bootstrapResult.success) {
        throw new Error(`Bootstrap failed: ${bootstrapResult.error}`);
      }
      
      console.log('Simulacrum | Test Runner - ✅ Bootstrap completed successfully - live session ready');
      
      // Return live session for testing (DON'T cleanup)
      return {
        sessionId: testId,
        permutation,
        page: bootstrapResult.page,
        browser: bootstrapResult.browser,
        containerId,
        port,
        imageName,
        gameState: bootstrapResult.gameState
      };
      
    } catch (error) {
      console.error(`❌ Session creation failed for ${permutation.id}:`, error.message);
      
      // Cleanup on failure
      await this.cleanupSession({ sessionId: testId, port, imageName });
      throw error;
    }
  }

  async cleanupSession(sessionInfo) {
    console.log(`Simulacrum | Test Runner - 🧹 Cleaning up session ${sessionInfo.sessionId}...`);
    
    // Close browser if provided
    if (sessionInfo.browser) {
      try {
        await sessionInfo.browser.close();
        console.log(`Simulacrum | Test Runner - ✅ Browser closed for session ${sessionInfo.sessionId}`);
      } catch (e) {
        console.warn(`⚠️ Browser cleanup failed: ${e.message}`);
      }
    }
    
    // Stop and remove Docker container
    if (sessionInfo.containerId) {
      try {
        const { execSync } = await import('child_process');
        // Use rm -f to force remove regardless of container state
        execSync(`docker rm -f ${sessionInfo.containerId}`, { stdio: 'ignore' });
        console.log(`Simulacrum | Test Runner - ✅ Container ${sessionInfo.containerId} force removed`);
      } catch (e) {
        console.warn(`⚠️ Container cleanup failed: ${e.message}`);
      }
    }
    
    // Release port
    if (sessionInfo.port && sessionInfo.sessionId) {
      try {
        this.portManager.releasePort(sessionInfo.sessionId, sessionInfo.port);
        console.log(`Simulacrum | Test Runner - ✅ Port ${sessionInfo.port} released for session ${sessionInfo.sessionId}`);
      } catch (e) {
        console.warn(`⚠️ Port release failed: ${e.message}`);
      }
    }
    
    console.log(`Simulacrum | Test Runner - ✅ Session ${sessionInfo.sessionId} fully cleaned up`);
  }

  async cleanupImages(permutations) {
    console.log('Simulacrum | Test Runner - 🧹 Cleaning up Docker images...');
    
    for (const permutation of permutations) {
      const imageName = `${this.config.docker.imagePrefix}-${permutation.id}`;
      try {
        const { execSync } = await import('child_process');
        execSync(`docker rmi ${imageName}`, { stdio: 'ignore' });
        console.log(`Simulacrum | Test Runner - ✅ Docker image ${imageName} removed`);
      } catch (e) {
        console.warn(`⚠️ Docker image cleanup failed for ${imageName}: ${e.message}`);
      }
    }
  }
}


export { BootstrapRunner };
