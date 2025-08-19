#!/usr/bin/env node

/**
 * @file tests/helpers/bootstrap/bootstrap-runner.js
 * @description Simple bootstrap infrastructure based on the working POC code
 * 
 * This creates version/system permutations and runs the bootstrap process
 * for each combination, using the existing working Docker setup.
 */

import { readFileSync, readdirSync } from 'fs';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';
import puppeteer from 'puppeteer';
import { ContainerManager } from '../container-manager.js';
import { PortManager } from '../port-manager.js';

class BootstrapRunner {
  constructor() {
    this.config = null;
    this.versions = [];
    this.systems = [];
    this.permutations = [];
    this.containerManager = null;
    this.portManager = null;
  }

  async initialize() {
    console.log('🚀 Initializing Bootstrap Runner...');
    
    // Load config (READ ONLY - no modifications)
    this.config = JSON.parse(readFileSync('tests/config/test.config.json', 'utf8'));
    console.log('✅ Config loaded');
    
    // Initialize container and port managers
    this.portManager = new PortManager(this.config);
    this.containerManager = new ContainerManager(this.config, this.portManager);
    
    // Get versions and systems from config
    this.versions = this.config['foundry-versions'] || [];
    this.systems = this.config['foundry-systems'] || [];
    
    console.log(`📊 Versions: ${this.versions.join(', ')}`);
    console.log(`📊 Systems: ${this.systems.join(', ')}`);
    
    // Generate permutations
    this.permutations = this.generatePermutations();
    console.log(`🔄 Generated ${this.permutations.length} permutations`);
    
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
    const versionPath = join('tests/fixtures/binary_versions', version);
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

  async discoverAvailableVersions() {
    console.log('🔍 Discovering available Foundry versions...');
    
    const availableVersions = [];
    
    for (const version of this.versions) {
      const versionPath = join('tests/fixtures/binary_versions', version);
      try {
        const entries = await readdir(versionPath);
        const zipFiles = entries.filter(entry => entry.endsWith('.zip'));
        
        if (zipFiles.length > 0) {
          availableVersions.push({
            version,
            zipFile: zipFiles[0],
            zipPath: join(versionPath, zipFiles[0])
          });
          console.log(`✅ Found ${version}: ${zipFiles[0]}`);
        } else {
          console.log(`⚠️ No ZIP files found in ${version}`);
        }
      } catch (error) {
        console.log(`⚠️ Could not read ${version}: ${error.message}`);
      }
    }
    
    return availableVersions;
  }

    async runBootstrapTest(permutation) {
    console.log(`🎯 Running bootstrap test: ${permutation.id}`);
    
    const testId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const port = await this.portManager.allocatePort(testId);
    
    // Step 0: Build Docker image (like POC)
    const imageName = `${this.config.docker.imagePrefix}-${permutation.id}`;
    const foundryLicenseKey = this.config.foundryLicenseKey;
    
    if (!foundryLicenseKey) {
      console.error('❌ foundryLicenseKey not found in config');
      throw new Error('foundryLicenseKey not set in test.config.json');
    }
    
    console.log(`🔨 Building Docker image: ${imageName}...`);
    console.log(`🔑 Using license key: ${foundryLicenseKey.substring(0, 4)}****`);
    
    try {
      // Determine the zip file based on version
      const zipFileName = this.getZipFileForVersion(permutation.version);
      
      execSync(`docker build -f tests/docker/Dockerfile.foundry --build-arg FOUNDRY_VERSION_ZIP=${zipFileName} --build-arg FOUNDRY_LICENSE_KEY=${foundryLicenseKey} -t ${imageName} .`, { stdio: 'inherit' });
      console.log(`✅ Docker image ${imageName} built successfully`);
    } catch (error) {
      console.error('❌ Docker build failed:', error.message);
      throw error;
    }
    
    try {
      // Step 1: Clean up any existing containers (like POC)
      console.log('🧹 Cleaning up existing containers...');
      try {
        execSync(`docker stop ${testId}`, { stdio: 'ignore' });
        execSync(`docker rm ${testId}`, { stdio: 'ignore' });
      } catch (e) {
        // Container might not exist, which is fine
      }
      
      // Step 2: Start fresh container (like POC)
      console.log(`🚀 Starting fresh FoundryVTT container from image: ${imageName}...`);
      const containerId = execSync(`docker run -d --name ${testId} -p ${port}:30000 ${imageName}` , { encoding: 'utf8' }).trim();
      console.log(`📦 Container ID: ${containerId}`);
      
      // Step 2: Wait for container to be ready
      console.log('⏳ Waiting for container to be ready...');
      const ready = await this.waitForContainerReady(port);
      
      if (!ready) {
        throw new Error('Container failed to start properly');
      }
      
      console.log('✅ Container is ready');
      
      // Step 3: Run bootstrap process (based on your working POC)
      const bootstrapResult = await this.runBootstrapProcess(port, permutation);
      
      if (!bootstrapResult.success) {
        throw new Error(`Bootstrap failed: ${bootstrapResult.error}`);
      }
      
      console.log('✅ Bootstrap completed successfully');
      
      // Step 4: Take screenshot as proof
      const screenshotPath = await this.takeScreenshot(bootstrapResult.page, permutation.id);
      
      // Close browser now that we have screenshot
      await bootstrapResult.browser.close();
      
      const result = {
        success: true,
        permutation,
        containerId,
        port,
        screenshotPath,
        bootstrapResult
      };
      
      // ALWAYS cleanup container after test (success OR failure) - like POC
      console.log(`🧹 Cleaning up container ${testId}...`);
      try {
        execSync(`docker stop ${testId}`, { stdio: 'ignore' });
        execSync(`docker rm ${testId}`, { stdio: 'ignore' });
        console.log(`✅ Container ${testId} cleaned up`);
      } catch (e) {
        console.warn(`⚠️ Container cleanup failed: ${e.message}`);
      }
      
      // Clean up the Docker image - like POC
      console.log(`🧹 Cleaning up Docker image ${imageName}...`);
      try {
        execSync(`docker rmi ${imageName}`, { stdio: 'ignore' });
        console.log(`✅ Docker image ${imageName} removed`);
      } catch (e) {
        console.warn(`⚠️ Docker image cleanup failed: ${e.message}`);
      }
      
      this.portManager.releasePort(testId, port);
      
      return result;
      
    } catch (error) {
      console.error(`❌ Bootstrap test failed for ${permutation.id}:`, error.message);
      
      // ALWAYS cleanup container on failure too - like POC
      console.log(`🧹 Cleaning up failed container ${testId}...`);
      try {
        execSync(`docker stop ${testId}`, { stdio: 'ignore' });
        execSync(`docker rm ${testId}`, { stdio: 'ignore' });
        console.log(`✅ Failed container ${testId} cleaned up`);
      } catch (e) {
        console.warn(`⚠️ Failed container cleanup failed: ${e.message}`);
      }
      
      // Clean up the Docker image on failure too - like POC
      console.log(`🧹 Cleaning up Docker image ${imageName}...`);
      try {
        execSync(`docker rmi ${imageName}`, { stdio: 'ignore' });
        console.log(`✅ Docker image ${imageName} removed`);
      } catch (e) {
        console.warn(`⚠️ Docker image cleanup failed: ${e.message}`);
      }
      
      this.portManager.releasePort(testId, port);
      
      return {
        success: false,
        permutation,
        error: error.message
      };
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
    console.log(`🔄 Running bootstrap process for ${permutation.id}...`);
    
    const browser = await puppeteer.launch({ 
      headless: this.config.puppeteer.headless,
      args: this.config.puppeteer.args,
      defaultViewport: this.config.puppeteer.viewport
    });
    
    const page = await browser.newPage();
    
    // Handle console messages and filter Chromium warnings (like POC)
    page.on('console', (msg) => {
      const text = msg.text();
      // Ignore Chromium version compatibility warnings
      if (text.includes('modern JavaScript features') && text.includes('Chromium version')) {
        console.log(`[BROWSER] ${msg.type()}: ${text} (ignored)`);
        return;
      }
      console.log(`[BROWSER] ${msg.type()}: ${text}`);
    });
    
    // Handle page errors without terminating (like POC)
    page.on('pageerror', (error) => {
      if (error.message.includes('modern JavaScript features') && error.message.includes('Chromium version')) {
        console.log(`[BROWSER] pageerror: ${error.message} (ignored)`);
        return;
      }
      console.log(`[BROWSER] pageerror: ${error.message}`);
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
      console.log('📍 Navigating to setup page...');
      await page.goto(`http://localhost:${port}/setup`, { waitUntil: 'domcontentloaded', timeout: this.config.puppeteer.timeout });
      console.log('📍 Navigated to setup page');
      
      // Wait for setup page to be ready (EXACTLY like your working POC)
      console.log('📍 Waiting for setup page to be ready...');
      await page.waitForFunction(() => {
        // Check for any setup-related elements
        const hasSetupElements = !!document.querySelector('.setup-menu, .setup-packages, [data-tab], .setup-packages-systems, .setup-packages-worlds');
        const hasGameObject = typeof window.game !== 'undefined';
        const hasAnyContent = document.body.textContent && document.body.textContent.length > 100;
        
        return hasSetupElements || hasGameObject || hasAnyContent;
      }, { timeout: this.config.bootstrap.timeouts.setupPageReady });
      
      console.log('✅ FoundryVTT setup page is ready');
      
      // Check for EULA that might appear dynamically on setup page (EXACTLY like your working POC)
      console.log('📍 Checking for EULA that might appear on setup page...');
              try {
          await page.waitForFunction(() => {
            const bodyText = document.body.textContent || '';
            return bodyText.includes('End User License Agreement') || 
                   bodyText.includes('EULA') || 
                   bodyText.includes('License Agreement') ||
                   bodyText.includes('please sign the End User License Agreement');
          }, { timeout: this.config.bootstrap.timeouts.eulaSetupPage });
        
        console.log('📍 EULA appeared on setup page, accepting agreement...');
        
        // Wait for EULA form to be fully rendered
        await new Promise(resolve => setTimeout(resolve, this.config.bootstrap.timeouts.eulaFormRender));
        
        // Handle EULA agreement on setup page
        const setupEulaResult = await this.handleEULA(page);
        if (setupEulaResult.success) {
          console.log('✅ EULA accepted on setup page');
          // Wait for EULA processing
          await new Promise(resolve => setTimeout(resolve, this.config.bootstrap.timeouts.eulaProcessing));
        }
      } catch (e) {
        console.log('📍 No EULA appeared on setup page, continuing...');
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
    console.log('🔑 Submitting license key...');
    
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
    console.log('📝 Checking for EULA...');
    
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
      
      console.log(`📍 EULA check:`, JSON.stringify(eulaCheck, null, 2));
      
      if (eulaCheck.detected) {
        console.log('📍 EULA detected, accepting agreement...');
        
        // Accept EULA (same logic as your working POC)
        const result = await page.evaluate(() => {
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
        
        if (result.success) {
          console.log('✅ EULA accepted successfully');
          
          // Wait for EULA processing
          await new Promise(resolve => setTimeout(resolve, this.config.bootstrap.timeouts.eulaProcessing));
          
          return result;
        } else {
          console.log(`⚠️ EULA acceptance failed: ${result.reason}`);
          return result;
        }
      } else {
        console.log('📍 No EULA detected, continuing to setup...');
        return { success: true, method: 'no_eula' };
      }
      
    } catch (error) {
      console.log(`⚠️ EULA check failed: ${error.message}, continuing...`);
      return { success: true, method: 'error_continue' };
    }
  }

  async installSystem(page, system) {
    console.log(`🎲 Installing system: ${system}`);
    
    try {
      // Step 1: Wait for setup page to be fully ready (exactly like POC)
      console.log('📍 Waiting for setup page to be fully ready...');
      
      // Wait for setup page to load - be more flexible about what constitutes "ready" (exactly like POC)
      await page.waitForFunction(() => {
        // Check for any setup-related elements (exactly like POC)
        const hasSetupElements = !!document.querySelector('.setup-menu, .setup-packages, [data-tab], .setup-packages-systems, .setup-packages-worlds');
        const hasGameObject = typeof window.game !== 'undefined';
        const hasAnyContent = document.body.textContent && document.body.textContent.length > 100;
        
        return hasSetupElements || hasGameObject || hasAnyContent;
      }, { timeout: this.config.bootstrap.timeouts.setupPageReady });
      
      console.log('✅ FoundryVTT setup page is ready');
      
      // Step 2: Look for and click "Decline Sharing" button (exactly like POC)
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
      
      // Step 3: Click the step-button to proceed (exactly like POC)
      console.log('📍 Clicking step-button to proceed...');
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
      
      // Step 4: Click "Install System" button (exactly like POC)
      console.log('📍 Step 4: Clicking Install System button...');
      
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
      await new Promise(resolve => setTimeout(resolve, this.config.bootstrap.timeouts.searchResults));
      
      // Step 2: Search for the system
      console.log(`📍 Searching for ${system} system...`);
      
      await page.type('#install-package-search-filter', system);
      console.log(`✅ ${system} entered in search field`);
      
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
      console.log(`📊 All packages found after searching for "${system}":`, JSON.stringify(allPackages, null, 2));
      
      // Step 3: Find and click Install button for the specific system
      console.log(`📍 Looking for ${system} package specifically...`);
      
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
      
      console.log(`📊 ${system} package search result:`, JSON.stringify(packageResult, null, 2));
      
      if (!packageResult.found) {
        throw new Error(`${system} package not found in search results`);
      }
      
      // Step 4: Click the install button
      console.log(`📍 Clicking Install button for ${system}...`);
      
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
      
      console.log(`✅ Install button clicked for ${system}`);
      
      // Step 5: Wait for installation to complete
      console.log(`⏳ Waiting for ${system} installation to complete...`);
      
      await page.waitForFunction((systemName) => {
        const bodyText = document.body.textContent || '';
        return bodyText.includes(`System ${systemName} was installed successfully`) ||
               bodyText.includes(`${systemName} was installed successfully`) ||
               bodyText.includes('was installed successfully');
      }, { timeout: this.config.bootstrap.timeouts.systemInstallation }, system);
      
      console.log(`✅ ${system} system installed successfully`);
      
      // Step 6: Close dialog
      try {
        await page.click('.header-control.icon.fa-solid.fa-xmark');
        console.log('✅ Dialog closed');
      } catch (e) {
        console.log('⚠️ Could not close dialog, continuing...');
      }
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async createWorld(page, permutation) {
    console.log(`🌍 Creating world for ${permutation.id}...`);
    
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
        console.log('✅ World title filled');
      } catch (e) {
        console.log(`⚠️ Could not fill world title: ${e.message}`);
      }
      
      // World ID
      try {
        await page.type('input[name="id"]', `test-world-${permutation.id}`);
        console.log('✅ World ID filled');
      } catch (e) {
        console.log(`⚠️ Could not fill world ID: ${e.message}`);
      }
      
      // Game System - critical for world creation
      try {
        const systemField = await page.$('select[name="system"], input[name="system"], #world-config-system');
        if (systemField) {
          const tagName = await page.evaluate(el => el.tagName, systemField);
          if (tagName === 'SELECT') {
            await page.select('select[name="system"], #world-config-system', permutation.system);
            console.log(`✅ Game system selected: ${permutation.system}`);
          } else {
            await page.type('input[name="system"], #world-config-system', permutation.system);
            console.log(`✅ Game system entered: ${permutation.system}`);
          }
        } else {
          console.log('⚠️ Game system field not found - this may cause world creation to fail');
        }
      } catch (e) {
        console.log(`⚠️ Could not set game system: ${e.message} - this may cause world creation to fail`);
      }
      
      // Description - try multiple approaches, but don't fail if not found
      try {
        await page.type('textarea[name="description"], textarea[placeholder*="description"], textarea[placeholder*="Description"], textarea[name="desc"]', `Test world for ${permutation.description}`);
        console.log('✅ World description filled');
      } catch (e) {
        console.log(`⚠️ Could not fill world description: ${e.message} - continuing without it`);
      }
      
      // Submit form (exactly like POC)
      console.log('📍 Submitting world creation form...');
      
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
        console.log(`✅ World creation form submitted via ${submitClicked.method}`);
      } else {
        throw new Error(`Submit button not found: ${submitClicked.reason}`);
      }
      
      // Wait for world creation to complete (exactly like POC)
      console.log('📍 Waiting for world creation to complete...');
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
      
      console.log('📊 World creation result check:', JSON.stringify(creationResult, null, 2));
      
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
      
      console.log('📊 Actual world ID found:', JSON.stringify(actualWorldId, null, 2));
      
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
    console.log(`🚀 Launching world: ${worldId}`);
    
    try {
      // Navigate back to worlds tab (exactly like POC)
      console.log('📍 Navigating back to worlds tab...');
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
      
      console.log('📊 Worlds tab verification:', JSON.stringify(onWorldsTab, null, 2));
      
      // Now find and click the launch button for the specific world (exactly like POC)
      console.log(`📍 Looking for Launch World button for ${worldId}...`);
      
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
            console.log(`Found and clicked worldLaunch button for ${worldId}`);
            return true;
          } else {
            console.log(`${worldId} element found but no worldLaunch button found within it`);
            console.log(`Element HTML: ${targetWorldElement.outerHTML.substring(0, 200)}`);
            return false;
          }
        } else {
          console.log(`${worldId} element not found in DOM`);
          return false;
        }
      }, worldId);
      
      if (launchClicked) {
        console.log(`✅ Launch World button clicked for ${worldId}`);
        
        // Wait for navigation to game world (exactly like POC)
        console.log('📍 Waiting for navigation to game world...');
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: this.config.bootstrap.timeouts.navigationWait });
        console.log('✅ Navigation to game world detected');
        
        // Handle user authentication if on join page (exactly like POC)
        console.log('📍 Checking if user authentication is required...');
        
        const joinPageUrl = page.url();
        if (joinPageUrl.includes('/join')) {
          console.log('📍 Join page detected, handling user authentication...');
          
          // Wait for join form to load
          await new Promise(resolve => setTimeout(resolve, this.config.bootstrap.timeouts.joinFormLoad));
          
          // Look for user selection dropdown (exactly like POC)
          console.log('📍 Looking for user selection dropdown...');
          const userSelect = await page.$('select[name="userid"]');
          
          if (userSelect) {
            console.log('✅ User selection dropdown found, selecting GameMaster...');
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
            
            console.log('📊 Available users:', JSON.stringify(userOptions, null, 2));
            
            // Look for GameMaster user (exactly like POC)
            const gameMasterOption = userOptions.find(opt => 
              opt.text?.toLowerCase().includes('gamemaster') || 
              opt.text?.toLowerCase().includes('game master') ||
              opt.text?.toLowerCase().includes('gm')
            );
            
            if (gameMasterOption) {
              await page.select('select[name="userid"]', gameMasterOption.value);
              console.log(`✅ Selected user: ${gameMasterOption.text}`);
            } else {
              // Select first available user (exactly like POC)
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
          
          // Fill in password (empty for default setup) (exactly like POC)
          await page.type('input[name="password"], input[type="password"]', '');
          console.log('✅ Password filled (empty)');
          
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
            console.log('✅ Authentication form submitted');
          } else {
            throw new Error('Authentication submit button not found');
          }
          
          // Wait for authentication to process (exactly like POC)
          await new Promise(resolve => setTimeout(resolve, this.config.bootstrap.timeouts.authenticationProcess));
          
          // Check if we were redirected to the game (exactly like POC)
          const newUrl = page.url();
          if (newUrl.includes('/game')) {
            console.log('✅ Successfully authenticated and redirected to game world');
          } else {
            console.log(`📍 Still on ${newUrl}, waiting longer for authentication...`);
            await new Promise(resolve => setTimeout(resolve, this.config.bootstrap.timeouts.authenticationRedirect));
          }
        } else {
          console.log('📍 Not on join page, proceeding with verification...');
        }
        
        return { success: true };
      } else {
        console.log(`⚠️ Launch World button not found for ${worldId}`);
        
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
        
        console.log('📊 Available world elements:', JSON.stringify(worldDebug, null, 2));
        throw new Error(`Could not find Launch World button for ${worldId}`);
      }
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async verifyGameWorld(page) {
    console.log('🎯 Verifying game world...');
    
    try {
      // Wait for game world to fully load (exactly like POC)
      console.log('⏳ Waiting for game world to fully load...');
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
      
      console.log('📊 Game World Verification:', JSON.stringify(gameWorldVerification, null, 2));
      
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
      
      console.log('📊 FINAL COMPREHENSIVE VERIFICATION:');
      console.log(JSON.stringify(finalVerification, null, 2));
      
      if (finalVerification.gameReady && finalVerification.worldLoaded && finalVerification.userAuthenticated) {
        console.log('✅✅✅ COMPLETE SUCCESS VERIFICATION! ✅✅✅');
        console.log('🎯 FoundryVTT is fully operational with a working game world');
        console.log('🎯 User is authenticated and ready to play');
        console.log('🎯 All essential UI components are present and functional');
        
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

  async takeScreenshot(page, permutationId) {
    const filename = `bootstrap-success-${permutationId}-${Date.now()}.png`;
    await page.screenshot({ path: filename, fullPage: true });
    console.log(`📸 Screenshot saved: ${filename}`);
    return filename;
  }

  // Port allocation is now handled by PortManager

  async runAllTests() {
    console.log('🎯 Running all bootstrap tests...');
    
    const availableVersions = await this.discoverAvailableVersions();
    if (availableVersions.length === 0) {
      throw new Error('No Foundry versions available for testing');
    }
    
    const results = [];
    
    for (const permutation of this.permutations) {
      // Check if version is available
      const versionAvailable = availableVersions.some(v => v.version === permutation.version);
      if (!versionAvailable) {
        console.log(`⚠️ Skipping ${permutation.id} - version ${permutation.version} not available`);
        continue;
      }
      
      const result = await this.runBootstrapTest(permutation);
      results.push(result);
      
      if (result.success) {
        console.log(`✅ ${permutation.id}: SUCCESS`);
      } else {
        console.log(`❌ ${permutation.id}: FAILED - ${result.error}`);
      }
    }
    
    // Final cleanup - ensure no test containers are left running
    console.log('🧹 Final cleanup - checking for any leftover test containers...');
    try {
      const runningContainers = execSync('docker ps -q --filter "name=test-"', { encoding: 'utf8' }).trim();
      if (runningContainers) {
        console.log('⚠️ Found running test containers, cleaning up...');
        execSync('docker ps -q --filter "name=test-" | xargs -r docker stop', { stdio: 'ignore' });
        execSync('docker ps -aq --filter "name=test-" | xargs -r docker rm', { stdio: 'ignore' });
        console.log('✅ All leftover test containers cleaned up');
      } else {
        console.log('✅ No leftover test containers found');
      }
    } catch (e) {
      console.log('✅ No test containers to clean up');
    }
    
    return results;
  }
}

// Main execution
async function main() {
  const runner = new BootstrapRunner();
  
  try {
    await runner.initialize();
    const results = await runner.runAllTests();
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log('\n📊 Test Results:');
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    
    if (failed === 0) {
      console.log('🎉 All bootstrap tests passed!');
      process.exit(0);
    } else {
      console.log('💥 Some tests failed');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 Bootstrap runner failed:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
