/**
 * Concurrent DockerTestRunner Framework
 * 
 * Enhanced DockerTestRunner with dynamic port allocation and concurrent container support.
 * Fixes the critical architectural flaw where all containers tried to use port 30000.
 * 
 * Key Features:
 * - Dynamic port allocation (30000-30010 range)
 * - Instance limiting (max 3 concurrent containers)
 * - Queue system for test execution
 * - True multi-version parallel testing
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import { loadTestConfig } from './test-config.js';
import { PortManager } from './port-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Global PortManager instance shared across all test runners
let globalPortManager = null;

export class ConcurrentDockerTestRunner {
  constructor() {
    this.config = loadTestConfig();
    this.containers = new Map(); // containerId -> { port, startTime, ... }
    this.browsers = new Map();
    
    // Initialize global PortManager if not already done
    if (!globalPortManager) {
      globalPortManager = new PortManager(this.config);
    }
    this.portManager = globalPortManager;
    
    console.log('ConcurrentDockerTestRunner initialized with port management');
  }

  /**
   * Run tests across versions/systems with concurrent execution support
   * @param {string} testName - Name of the test
   * @param {Function} testFn - Test function (page, context) => Promise<void>
   */
  testAcrossVersions(testName, testFn) {
    const enabledVersions = this.config.versions.filter(v => v.enabled);
    const enabledSystems = this.config.systems.filter(s => s.enabled);
    
    enabledVersions.forEach(version => {
      enabledSystems.forEach(system => {
        const fullTestName = `${testName} (FoundryVTT ${version.version} + ${system.name})`;
        
        test(fullTestName, async () => {
          const context = {
            version: version.version,
            versionZip: version.zipFile,
            system: system.id,
            systemName: system.name,
            systemUrl: system.downloadUrl
          };
          
          const { page, containerId, port } = await this.setupTestEnvironment(context);
          
          try {
            await testFn(page, { ...context, port });
          } finally {
            await this.cleanupTestEnvironment(containerId);
          }
        }, this.config.bootstrap.timeouts.foundryReady + 60000); // Extra time for concurrent operations
      });
    });
  }

  /**
   * Setup test environment with dynamic port allocation and enhanced license automation
   * @param {Object} context - Test context with version and system info
   * @returns {Promise<{page: Page, containerId: string, port: number, licenseResult?: Object}>}
   */
  async setupTestEnvironment(context) {
    const containerId = `${this.config.docker.imagePrefix}-${context.version}-${context.system}-${Date.now()}`;
    let allocatedPort = null;
    
    try {
      // 1. Allocate port for this container
      allocatedPort = await this.portManager.allocatePort(containerId);
      console.log(`Allocated port ${allocatedPort} for ${containerId}`);
      
      // 2. Build and start Docker container with allocated port
      await this.buildAndStartContainer(containerId, context, allocatedPort);
      
      // 3. Wait for FoundryVTT to be ready on allocated port
      await this.waitForFoundryReady(containerId, allocatedPort);
      
      // 4. Launch Puppeteer and connect
      const { browser, page } = await this.launchPuppeteer();
      this.browsers.set(containerId, browser);
      
      // 5. Navigate to FoundryVTT on allocated port
      await page.goto(`http://localhost:${allocatedPort}`, {
        waitUntil: 'networkidle0',
        timeout: this.config.puppeteer.timeout
      });
      
      // 6. Complete bootstrap sequence with enhanced license automation and system installation
      const bootstrapResult = await this.bootstrapFoundryEnvironment(page, context);
      
      return { page, containerId, port: allocatedPort, bootstrapResult };
      
    } catch (error) {
      // Cleanup on failure
      if (allocatedPort) {
        this.portManager.releasePort(containerId, allocatedPort);
      }
      await this.cleanupTestEnvironment(containerId);
      throw new Error(`Test environment setup failed: ${error.message}`);
    }
  }

  /**
   * Build and start Docker container with dynamic port
   * @param {string} containerId - Unique container identifier
   * @param {Object} context - Test context
   * @param {number} port - Allocated port for this container
   */
  async buildAndStartContainer(containerId, context, port) {
    const projectRoot = join(__dirname, '..', '..');
    const versionZipPath = join(projectRoot, 'tests', 'fixtures', 'binary_versions', context.version, context.versionZip);
    
    // Check if ZIP file exists
    const fs = await import('fs');
    if (!fs.existsSync(versionZipPath)) {
      throw new Error(`FoundryVTT ZIP file not found: ${versionZipPath}`);
    }
    
    // Get license key from environment or config  
    const licenseKey = process.env.FOUNDRY_LICENSE_KEY || this.config.foundryLicenseKey;
    
    if (!licenseKey || licenseKey.includes('${')) {
      console.warn('FOUNDRY_LICENSE_KEY not set - Docker tests may fail at license screen');
      console.warn('Set FOUNDRY_LICENSE_KEY environment variable with your FoundryVTT license');
    }
    
    // Build Docker image
    const buildArgs = [
      'build',
      '-t', `${containerId}:latest`,
      '--build-arg', `FOUNDRY_VERSION_ZIP=tests/fixtures/binary_versions/${context.version}/${context.versionZip}`,
      '--build-arg', `FOUNDRY_LICENSE_KEY=${licenseKey || 'MISSING_LICENSE_KEY'}`,
      '-f', 'tests/docker/Dockerfile.foundry',
      '.'
    ];
    
    console.log(`Building Docker image for ${context.version} on port ${port}...`);
    await this.runCommand('docker', buildArgs, {
      cwd: projectRoot,
      timeout: this.config.bootstrap.timeouts.containerStart
    });
    
    // Start container with dynamic port mapping
    const runArgs = [
      'run',
      '-d',
      '--name', containerId,
      '-p', `${port}:30000`, // Map allocated port to container's internal port 30000
      '-v', `${projectRoot}:${this.config.docker.moduleMountPath}`,
      `${containerId}:latest`
    ];
    
    console.log(`Starting container ${containerId} on port ${port}...`);
    await this.runCommand('docker', runArgs, {
      timeout: this.config.bootstrap.timeouts.containerStart
    });
    
    // Store container info
    this.containers.set(containerId, {
      port,
      startTime: Date.now(),
      context
    });
    
    console.log(`Container ${containerId} started successfully on port ${port}`);
  }

  /**
   * Wait for FoundryVTT server to be ready on specific port
   * @param {string} containerId - Container identifier
   * @param {number} port - Port to check
   */
  async waitForFoundryReady(containerId, port) {
    const maxRetries = this.config.bootstrap.retries.foundryConnection;
    const retryDelay = 2000;
    
    console.log(`Waiting for FoundryVTT to be ready on port ${port}...`);
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        // First check if container is still running
        const containerStatus = await this.runCommand('docker', ['ps', '-q', '-f', `name=${containerId}`], { timeout: 5000 });
        if (!containerStatus.trim()) {
          throw new Error(`Container ${containerId} is not running`);
        }
        
        // Try to connect to FoundryVTT on allocated port
        const response = await fetch(`http://localhost:${port}`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
          console.log(`FoundryVTT ready on port ${port}`);
          return;
        }
        
        console.log(`Attempt ${i + 1}/${maxRetries}: FoundryVTT not ready on port ${port} (status: ${response.status})`);
      } catch (error) {
        console.log(`Attempt ${i + 1}/${maxRetries}: Connection failed on port ${port} (${error.message})`);
      }
      
      if (i < maxRetries - 1) {
        await this.sleep(retryDelay);
      }
    }
    
    // Get container logs for debugging
    try {
      const logs = await this.runCommand('docker', ['logs', '--tail', '50', containerId], { timeout: 10000 });
      console.error(`Container logs for ${containerId}:`, logs);
    } catch (logError) {
      console.error('Could not get container logs:', logError.message);
    }
    
    throw new Error(`FoundryVTT server not ready on port ${port} after ${maxRetries} retries`);
  }

  /**
   * Launch Puppeteer browser
   * @returns {Promise<{browser: Browser, page: Page}>}
   */
  async launchPuppeteer() {
    const browser = await puppeteer.launch({
      headless: this.config.puppeteer.headless,
      slowMo: this.config.puppeteer.slowMo,
      devtools: this.config.puppeteer.devtools,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport(this.config.puppeteer.viewport);
    
    return { browser, page };
  }

  /**
   * Bootstrap environment: handle license, install game systems, and create test world.
   * Completes full FoundryVTT setup automation for integration testing.
   * @param {Page} page - Puppeteer page
   * @param {Object} context - Test context
   * @returns {Promise<Object>} Bootstrap result with license, system, and world creation status
   */
  async bootstrapFoundryEnvironment(page, context) {
    console.log(`Starting bootstrap for ${context.version} ${context.system}`);
    
    // Enter license key with detailed tracking
    const licenseResult = await this.enterLicenseKey(page);
    console.log(`License automation result: ${JSON.stringify(licenseResult, null, 2)}`);
    
    const bootstrapResult = {
      licenseAutomation: licenseResult,
      systemInstallation: [],
      worldCreation: null, // Will be populated after world creation
      timestamp: new Date().toISOString(),
      container: context
    };
    
    if (!licenseResult.success && licenseResult.status === 'license_error') {
      bootstrapResult.bootstrapFailed = true;
      bootstrapResult.failureReason = licenseResult.details;
      throw new Error(`License entry failed: ${licenseResult.details}`);
    }
    
    // Install required game systems with enhanced configuration
    const systemsToInstall = ['dnd5e', 'pf2e'];
    for (const systemId of systemsToInstall) {
      const installResult = await this.installGameSystem(page, systemId, {
        maxRetries: 3,
        installTimeout: 120000,  // 2 minutes for installation process
        downloadTimeout: 300000  // 5 minutes for package download
      });
      bootstrapResult.systemInstallation.push(installResult);
      if (!installResult.success) {
        bootstrapResult.bootstrapFailed = true;
        bootstrapResult.failureReason = `Failed to install ${systemId} after ${installResult.retryCount || 0} retries: ${installResult.details}`;
        throw new Error(bootstrapResult.failureReason);
      }
      console.log(`System ${systemId} installation completed successfully (${installResult.retryCount || 0} retries used).`);
    }
    
    // Create test world with appropriate system (Issue #42 - World Creation Automation)
    // This completes the bootstrap sequence by providing a ready-to-test world environment
    const testWorldConfig = {
      name: `Test World ${context.version}`,
      system: context.system || 'dnd5e',
      description: `Automated test world for ${context.version} with ${context.systemName || context.system}`
    };
    
    const worldResult = await this.createWorld(page, testWorldConfig, {
      maxRetries: 3,
      timeout: 30000
    });
    bootstrapResult.worldCreation = worldResult;
    
    if (!worldResult.success) {
      bootstrapResult.bootstrapFailed = true;
      bootstrapResult.failureReason = `Failed to create test world after ${worldResult.retryCount || 0} retries: ${worldResult.details}`;
      throw new Error(bootstrapResult.failureReason);
    }
    console.log(`Test world "${testWorldConfig.name}" creation completed successfully (${worldResult.retryCount || 0} retries used).`);
    
    bootstrapResult.bootstrapSuccess = true;
    console.log(`Bootstrap completed successfully for ${context.version} ${context.system} with world "${testWorldConfig.name}"`);
    
    return bootstrapResult;
  }

  /**
   * Install a game system from the FoundryVTT setup screen with enhanced error handling and retry logic.
   * Based on FoundryVTT v13 source code analysis for accurate selector patterns.
   * @param {Page} page - Puppeteer page
   * @param {string} systemId - The ID of the system to install (e.g., 'dnd5e')
   * @param {Object} options - Installation options
   * @param {number} [options.maxRetries=3] - Maximum retry attempts for installation
   * @param {number} [options.installTimeout=120000] - Timeout for package installation (2 minutes)
   * @param {number} [options.downloadTimeout=300000] - Timeout for package download (5 minutes)
   * @returns {Promise<{success: boolean, status: string, details?: string, retryCount?: number}>}
   */
  async installGameSystem(page, systemId, options = {}) {
    const { 
      maxRetries = 3, 
      installTimeout = 120000, 
      downloadTimeout = 300000 
    } = options;
    
    console.log(`Installing game system: ${systemId} (max retries: ${maxRetries})...`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Installation attempt ${attempt}/${maxRetries} for ${systemId}`);
        
        // Navigate to the "Game Systems" tab using correct FoundryVTT v13 selector
        await page.waitForSelector('a[data-tab="systems"]', { timeout: 10000 });
        await page.click('a[data-tab="systems"]');
        await this.sleep(1000); // Allow tab switch to complete
        console.log('Navigated to Game Systems tab.');

        // Enhanced system installation check - verify both existence and installation status
        const systemStatus = await page.evaluate((id) => {
          const systemRow = document.querySelector(`li.package[data-package-id="${id}"]`);
          if (!systemRow) return { exists: false, installed: false };
          
          // Check for uninstall button (indicates installed) or update button
          const hasUninstallButton = !!systemRow.querySelector('button[data-action="uninstall"]');
          const hasUpdateButton = !!systemRow.querySelector('button[data-action="updatePackage"]');
          
          return { 
            exists: true, 
            installed: hasUninstallButton || hasUpdateButton,
            element: systemRow
          };
        }, systemId);

        if (systemStatus.installed) {
          console.log(`System ${systemId} is already installed.`);
          return { success: true, status: 'already_installed', retryCount: attempt - 1 };
        }

        // Click "Install System" button - using correct camelCase selector from v13 source
        await page.waitForSelector('button[data-action="installPackage"]', { timeout: 10000 });
        await page.click('button[data-action="installPackage"]');
        console.log('Clicked "Install System" button.');

        // Wait for the installation dialog with better error handling
        try {
          await page.waitForSelector('#package-installer', { visible: true, timeout: 15000 });
          console.log('Package installer dialog is visible.');
        } catch (dialogError) {
          console.warn(`Package installer dialog not found on attempt ${attempt}: ${dialogError.message}`);
          if (attempt < maxRetries) continue;
          throw new Error(`Package installer dialog failed to open after ${maxRetries} attempts`);
        }

        // Enhanced filter input with retry logic
        const filterInput = await page.$('input[name="filter"]');
        if (!filterInput) {
          throw new Error('Package filter input not found in installer dialog');
        }
        
        // Clear existing filter and type system ID
        await filterInput.click({ clickCount: 3 }); // Select all
        await filterInput.type(systemId, { delay: 100 });
        await this.sleep(2000); // Wait for filtering to complete

        // Enhanced package detection with multiple selector strategies
        const packageFound = await page.evaluate((id) => {
          // Try multiple selector patterns for finding the system package
          const selectors = [
            `li.package[data-package-id="${id}"]`,
            `[data-package-id="${id}"]`,
            `.package[data-package-id="${id}"]`
          ];
          
          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
              const installButton = element.querySelector('button[data-action="install"]');
              return { found: true, hasInstallButton: !!installButton, selector };
            }
          }
          return { found: false };
        }, systemId);

        if (!packageFound.found) {
          throw new Error(`System package ${systemId} not found in installer dialog - may not be available in repository`);
        }

        if (!packageFound.hasInstallButton) {
          throw new Error(`System ${systemId} found but install button not available - may already be installed or incompatible`);
        }

        // Click the install button for the specific system
        const installButtonSelector = `li.package[data-package-id="${systemId}"] button[data-action="install"]`;
        await page.waitForSelector(installButtonSelector, { timeout: 15000 });
        await page.click(installButtonSelector);
        console.log(`Clicked install button for ${systemId}.`);

        // Enhanced installation monitoring with progress tracking
        console.log(`Waiting for ${systemId} installation to complete (timeout: ${downloadTimeout}ms)...`);
        
        // Wait for installation completion using multiple indicators
        const installationResult = await Promise.race([
          // Primary indicator: install button becomes disabled
          page.waitForSelector(`li.package[data-package-id="${systemId}"] button[data-action="install"][disabled]`, 
            { timeout: downloadTimeout })
            .then(() => ({ success: true, method: 'button_disabled' })),
          
          // Secondary indicator: install button disappears (replaced with installed state)
          page.waitForFunction((id) => {
            const packageElement = document.querySelector(`li.package[data-package-id="${id}"]`);
            if (!packageElement) return false;
            const installButton = packageElement.querySelector('button[data-action="install"]:not([disabled])');
            return !installButton; // Button is gone or disabled
          }, { timeout: downloadTimeout }, systemId)
            .then(() => ({ success: true, method: 'button_removed' })),
          
          // Timeout handler
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Installation timeout after ${downloadTimeout}ms`)), downloadTimeout + 1000)
          )
        ]);

        console.log(`System ${systemId} installation completed via ${installationResult.method}.`);

        // Close the installer dialog
        try {
          await page.click('#package-installer button.close, #package-installer .close');
          await this.sleep(1000);
        } catch (closeError) {
          console.warn(`Could not close installer dialog: ${closeError.message}`);
          // Try pressing Escape key as fallback
          await page.keyboard.press('Escape');
          await this.sleep(1000);
        }

        // Final verification: confirm system is now installed in the systems tab
        const finalVerification = await page.evaluate((id) => {
          const systemRow = document.querySelector(`li.package[data-package-id="${id}"]`);
          if (!systemRow) return { verified: false, reason: 'system_not_found' };
          
          const hasUninstallButton = !!systemRow.querySelector('button[data-action="uninstall"]');
          const hasUpdateButton = !!systemRow.querySelector('button[data-action="updatePackage"]');
          
          return { 
            verified: hasUninstallButton || hasUpdateButton,
            reason: hasUninstallButton ? 'uninstall_button_present' : 
                   hasUpdateButton ? 'update_button_present' : 'no_install_indicators'
          };
        }, systemId);

        if (!finalVerification.verified) {
          throw new Error(`System installation verification failed: ${finalVerification.reason}`);
        }

        console.log(`System ${systemId} successfully installed and verified (${finalVerification.reason}).`);
        return { 
          success: true, 
          status: 'installed', 
          retryCount: attempt - 1,
          details: `Installation completed and verified via ${finalVerification.reason}`
        };

      } catch (error) {
        console.error(`Installation attempt ${attempt}/${maxRetries} failed for ${systemId}: ${error.message}`);
        
        if (attempt === maxRetries) {
          // Final attempt failed
          return { 
            success: false, 
            status: 'install_error', 
            details: `Installation failed after ${maxRetries} attempts: ${error.message}`,
            retryCount: maxRetries
          };
        }
        
        // Wait before retry with exponential backoff
        const backoffDelay = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
        console.log(`Retrying in ${backoffDelay}ms...`);
        await this.sleep(backoffDelay);
        
        // Try to close any open dialogs before retry
        try {
          await page.keyboard.press('Escape');
          await this.sleep(500);
        } catch (escapeError) {
          // Ignore escape key errors
        }
      }
    }
  }

  /**
   * Create a new world in FoundryVTT setup interface with enhanced error handling and retry logic.
   * Based on FoundryVTT v13 source code analysis for accurate selector patterns.
   * @param {Page} page - Puppeteer page
   * @param {Object} worldConfig - World configuration
   * @param {string} worldConfig.name - World name (will be slugified for ID)
   * @param {string} [worldConfig.system='dnd5e'] - Game system to use
   * @param {string} [worldConfig.description] - World description
   * @param {Object} options - Creation options
   * @param {number} [options.maxRetries=3] - Maximum retry attempts
   * @param {number} [options.timeout=30000] - Operation timeout
   * @returns {Promise<{success: boolean, status: string, details?: string, retryCount?: number}>}
   */
  async createWorld(page, worldConfig, options = {}) {
    const { 
      maxRetries = 3, 
      timeout = 30000 
    } = options;
    
    const {
      name: worldName,
      system = 'dnd5e',
      description = ''
    } = worldConfig;
    
    if (!worldName) {
      throw new Error('World name is required');
    }
    
    console.log(`Creating world: "${worldName}" with system "${system}" (max retries: ${maxRetries})...`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`World creation attempt ${attempt}/${maxRetries} for "${worldName}"`);
        
        // Navigate to the "Worlds" tab using correct FoundryVTT v13 selector
        await page.waitForSelector('a[data-tab="worlds"]', { timeout: 10000 });
        await page.click('a[data-tab="worlds"]');
        await this.sleep(1000); // Allow tab switch to complete
        console.log('Navigated to Worlds tab.');

        // Check if world already exists
        const worldExists = await page.evaluate((name) => {
          const worldSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
          const worldRow = document.querySelector(`li.package[data-package-id="${worldSlug}"]`);
          return !!worldRow;
        }, worldName);

        if (worldExists) {
          console.log(`World "${worldName}" already exists.`);
          return { success: true, status: 'already_exists', retryCount: attempt - 1 };
        }

        // Click "Create World" button using v13 source selector
        await page.waitForSelector('button[data-action="worldCreate"]', { timeout: 10000 });
        await page.click('button[data-action="worldCreate"]');
        console.log('Clicked "Create World" button.');

        // Wait for the WorldConfig dialog to appear
        try {
          await page.waitForSelector('#world-config', { visible: true, timeout: 15000 });
          console.log('World configuration dialog is visible.');
        } catch (dialogError) {
          console.warn(`World config dialog not found on attempt ${attempt}: ${dialogError.message}`);
          if (attempt < maxRetries) continue;
          throw new Error(`World config dialog failed to open after ${maxRetries} attempts`);
        }

        // Fill in world title field
        const titleSelector = '#world-config input[name="title"]';
        await page.waitForSelector(titleSelector, { timeout: 10000 });
        const titleInput = await page.$(titleSelector);
        if (!titleInput) {
          throw new Error('World title input not found in config dialog');
        }
        
        // Clear existing title and enter new one
        await titleInput.click({ clickCount: 3 }); // Select all
        await titleInput.type(worldName, { delay: 50 });
        console.log(`Entered world title: "${worldName}"`);
        await this.sleep(500); // Allow ID generation to complete

        // Select game system if dropdown exists (creation mode)
        const systemSelector = '#world-config select[name="system"]';
        const systemSelect = await page.$(systemSelector);
        if (systemSelect) {
          // Check if the desired system is available
          const systemAvailable = await page.evaluate((selector, systemId) => {
            const select = document.querySelector(selector);
            if (!select) return false;
            const option = select.querySelector(`option[value="${systemId}"]`);
            return !!option;
          }, systemSelector, system);

          if (!systemAvailable) {
            throw new Error(`Game system "${system}" not available in system dropdown`);
          }

          await page.select(systemSelector, system);
          console.log(`Selected game system: "${system}"`);
          await this.sleep(500);
        } else {
          console.log('System selector not found - may already be set or in edit mode');
        }

        // Fill description if provided
        if (description) {
          const descriptionSelector = '#world-config textarea[name="description"], #world-config input[name="description"]';
          const descriptionInput = await page.$(descriptionSelector);
          if (descriptionInput) {
            await descriptionInput.click({ clickCount: 3 });
            await descriptionInput.type(description, { delay: 30 });
            console.log('Entered world description.');
            await this.sleep(300);
          }
        }

        // Submit the form
        const submitSelector = '#world-config button[type="submit"]';
        await page.waitForSelector(submitSelector, { timeout: 10000 });
        await page.click(submitSelector);
        console.log('Clicked submit button for world creation.');

        // Wait for world creation to complete with multiple success indicators
        console.log(`Waiting for world creation to complete (timeout: ${timeout}ms)...`);
        
        const creationResult = await Promise.race([
          // Primary indicator: dialog closes (world created successfully)
          page.waitForFunction(() => {
            const dialog = document.querySelector('#world-config');
            return !dialog || !dialog.offsetParent; // Dialog is hidden/removed
          }, { timeout: timeout })
            .then(() => ({ success: true, method: 'dialog_closed' })),
          
          // Secondary indicator: world appears in worlds list
          page.waitForFunction((worldTitle) => {
            const worldSlug = worldTitle.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            const worldRow = document.querySelector(`li.package[data-package-id="${worldSlug}"]`);
            return !!worldRow;
          }, { timeout: timeout }, worldName)
            .then(() => ({ success: true, method: 'world_listed' })),
          
          // Error indicator: error notification or validation message
          page.waitForFunction(() => {
            const bodyText = document.body.innerText.toLowerCase();
            return bodyText.includes('error') || bodyText.includes('invalid') || bodyText.includes('failed');
          }, { timeout: Math.min(timeout, 5000) })
            .then(() => ({ success: false, method: 'error_detected' })),
          
          // Timeout handler
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`World creation timeout after ${timeout}ms`)), timeout + 1000)
          )
        ]);

        if (!creationResult.success) {
          // Get error details for better debugging
          const errorDetails = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            const errorMatch = bodyText.match(/(error|invalid|failed)[^.!?]*[.!?]/i);
            return errorMatch ? errorMatch[0] : 'Unknown error detected';
          });
          throw new Error(`World creation failed: ${errorDetails}`);
        }

        console.log(`World "${worldName}" creation completed via ${creationResult.method}.`);

        // Final verification: confirm world exists in the worlds list
        const finalVerification = await page.evaluate((worldTitle) => {
          const worldSlug = worldTitle.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
          const worldRow = document.querySelector(`li.package[data-package-id="${worldSlug}"]`);
          if (!worldRow) return { verified: false, reason: 'world_not_listed' };
          
          // Check for launch button or edit button (indicates world exists)
          const hasLaunchButton = !!worldRow.querySelector('button[data-action="worldLaunch"]');
          const hasEditButton = !!worldRow.querySelector('button[data-action="worldEdit"]');
          
          return { 
            verified: hasLaunchButton || hasEditButton,
            reason: hasLaunchButton ? 'launch_button_present' : 
                   hasEditButton ? 'edit_button_present' : 'no_world_indicators'
          };
        }, worldName);

        if (!finalVerification.verified) {
          throw new Error(`World creation verification failed: ${finalVerification.reason}`);
        }

        console.log(`World "${worldName}" successfully created and verified (${finalVerification.reason}).`);
        return { 
          success: true, 
          status: 'created', 
          retryCount: attempt - 1,
          details: `World creation completed and verified via ${finalVerification.reason}`
        };

      } catch (error) {
        console.error(`World creation attempt ${attempt}/${maxRetries} failed for "${worldName}": ${error.message}`);
        
        if (attempt === maxRetries) {
          // Final attempt failed
          return { 
            success: false, 
            status: 'creation_error', 
            details: `World creation failed after ${maxRetries} attempts: ${error.message}`,
            retryCount: maxRetries
          };
        }
        
        // Wait before retry with exponential backoff
        const backoffDelay = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
        console.log(`Retrying in ${backoffDelay}ms...`);
        await this.sleep(backoffDelay);
        
        // Try to close any open dialogs before retry
        try {
          await page.keyboard.press('Escape');
          await this.sleep(500);
        } catch (escapeError) {
          // Ignore escape key errors
        }
      }
    }
  }

  /**
   * Enter FoundryVTT license key if license screen is shown
   * Enhanced version for concurrent testing with detailed reporting
   * @param {Page} page - Puppeteer page
   * @returns {Promise<{success: boolean, status: string, details?: string}>}
   */
  async enterLicenseKey(page) {
    console.log('Checking for license key requirement...');
    
    try {
      // Wait for page to load and check for license screen
      await this.sleep(3000);
      
      const licenseScreenDetected = await page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        return bodyText.includes('license') || bodyText.includes('software license');
      });

      if (!licenseScreenDetected) {
        console.log('No license screen detected based on page text.');
        // Double-check for input fields as a fallback
        const licenseInputExists = await page.$('input[name*="license"], input[id*="license"]');
        if (!licenseInputExists) {
          return {
            success: true,
            status: 'no_license_required',
            details: 'No license input detected, assuming license not required'
          };
        }
        console.log('License input field found despite no explicit text, proceeding...');
      }
      
      const licenseSelectors = [
        'input[name="licenseKey"]', 'input[name="license"]', '#license-key',
        'input[placeholder*="license" i]', 'form input[type="text"]'
      ];
      
      let licenseInput = null;
      let foundSelector = null;
      
      for (const selector of licenseSelectors) {
        licenseInput = await page.$(selector);
        if (licenseInput) {
          foundSelector = selector;
          console.log(`Found license input with selector: ${selector}`);
          break;
        }
      }
      
      if (licenseInput) {
        const licenseKey = process.env.FOUNDRY_LICENSE_KEY || this.config.foundryLicenseKey;
        if (!licenseKey || licenseKey.includes('${')) {
          return { 
            success: false, 
            status: 'no_license_key',
            details: 'License input found but no license key provided in environment'
          };
        }
        
        console.log('Entering license key...');
        await licenseInput.click({ clickCount: 3 });
        await licenseInput.type(licenseKey, { delay: 50 });
        await this.sleep(1000);
        
        const submitSelectors = [
          'button[type="submit"]', 'input[type="submit"]', 'button[data-action="license"]',
          '.license-form button', 'form button'
        ];
        
        let submitButton = null;
        let submitSelector = null;
        
        for (const selector of submitSelectors) {
          const buttons = await page.$$(selector);
          for (const button of buttons) {
            const buttonText = await button.evaluate(btn => btn.textContent.toLowerCase());
            if (buttonText.includes('submit') || buttonText.includes('continue') || buttonText.includes('activate') || buttonText.includes('accept')) {
              submitButton = button;
              submitSelector = selector;
              console.log(`Found submit button with text "${buttonText}" using selector: ${selector}`);
              break;
            }
          }
          if (submitButton) break;
        }
        
        if (submitButton) {
          console.log('Clicking submit button...');
          await submitButton.click();
          
          const navigationResult = await this.waitForNavigation(page);
          
          if (!navigationResult.navigated) {
            return { success: false, status: 'navigation_failed', details: `Failed to navigate after submission: ${navigationResult.error}` };
          }

          console.log(`Navigation successful to ${page.url()}`);
          
          // Final validation
          const errorCheck = await page.evaluate(() => {
            const bodyText = document.body.innerText.toLowerCase();
            const hasError = bodyText.includes('invalid license') || bodyText.includes('invalid key');
            return { hasError, errorText: hasError ? bodyText.substring(0, 200) : null };
          });
          
          if (errorCheck.hasError) {
            return { success: false, status: 'license_error', details: `License submission failed: ${errorCheck.errorText}` };
          }
          
          return { success: true, status: 'license_accepted', details: `License submitted using ${foundSelector} and navigated to ${page.url()}` };
          
        } else {
          console.log('No submit button found, trying Enter key press...');
          await licenseInput.press('Enter');
          
          const navigationResult = await this.waitForNavigation(page);
          if (navigationResult.navigated) {
            return { success: true, status: 'license_accepted', details: 'License submitted via Enter key and navigated successfully.' };
          } else {
            return { success: false, status: 'no_submit_method', details: 'No submit button found and Enter key press failed to navigate.' };
          }
        }
      } else {
        return {
          success: true,
          status: 'no_license_required',
          details: 'No license input detected, assuming license not required'
        };
      }
      
    } catch (error) {
      console.error(`License key entry error: ${error.message}`);
      return {
        success: false,
        status: 'license_entry_error', 
        details: `Error during license entry: ${error.message}`
      };
    }
  }

  /**
   * Waits for page navigation to complete with robust error handling.
   * @param {Page} page - The Puppeteer page object.
   * @param {object} options - Optional settings.
   * @param {number} [options.timeout=15000] - Navigation timeout in ms.
   * @returns {Promise<{navigated: boolean, url?: string, error?: string}>}
   */
  async waitForNavigation(page, options = {}) {
    const { timeout = 15000 } = options;
    const initialUrl = page.url();
    console.log(`Waiting for navigation from ${initialUrl}...`);

    try {
      await page.waitForNavigation({
        waitUntil: 'networkidle0',
        timeout: timeout,
      });
      const newUrl = page.url();
      if (newUrl !== initialUrl) {
        console.log(`Navigation successful. New URL: ${newUrl}`);
        return { navigated: true, url: newUrl };
      } else {
        // This can happen if navigation leads to the same URL with a reload
        console.log('Navigation event fired, but URL is unchanged. Assuming success.');
        return { navigated: true, url: newUrl };
      }
    } catch (error) {
      console.log(`waitForNavigation timed out after ${timeout}ms. Checking URL manually.`);
      const currentUrl = page.url();
      if (currentUrl !== initialUrl) {
        console.log(`URL changed to ${currentUrl} despite timeout. Considering it a success.`);
        return { navigated: true, url: currentUrl };
      } else {
        console.error(`Navigation failed. URL remains ${currentUrl}. Error: ${error.message}`);
        return { navigated: false, error: `Timeout after ${timeout}ms and URL did not change.` };
      }
    }
  }

  /**
   * Clean up test environment and release port
   * @param {string} containerId - Container identifier
   */
  async cleanupTestEnvironment(containerId) {
    try {
      // Get container info to release port
      const containerInfo = this.containers.get(containerId);
      
      // Close browser
      const browser = this.browsers.get(containerId);
      if (browser) {
        await browser.close();
        this.browsers.delete(containerId);
      }
      
      // Stop and remove container
      if (this.containers.has(containerId)) {
        await this.runCommand('docker', ['stop', containerId], { timeout: 10000 });
        await this.runCommand('docker', ['rm', containerId], { timeout: 10000 });
        this.containers.delete(containerId);
      }
      
      // Release port
      if (containerInfo && containerInfo.port) {
        this.portManager.releasePort(containerId, containerInfo.port);
      }
      
    } catch (error) {
      console.error(`Cleanup failed for ${containerId}:`, error.message);
    }
  }

  /**
   * Get current status of all running containers
   * @returns {Object} Status information
   */
  getStatus() {
    const containerList = Array.from(this.containers.entries()).map(([id, info]) => ({
      containerId: id,
      port: info.port,
      uptime: Date.now() - info.startTime,
      version: info.context.version,
      system: info.context.system
    }));

    return {
      runningContainers: containerList,
      portManager: this.portManager.getStatus()
    };
  }

  /**
   * Run a command with timeout and error handling
   * @param {string} command - Command to run
   * @param {string[]} args - Command arguments
   * @param {Object} options - Execution options
   */
  async runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const { timeout = 30000, cwd } = options;
      
      const child = spawn(command, args, { cwd });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Command timeout after ${timeout}ms: ${command} ${args.join(' ')}`));
      }, timeout);
      
      child.on('close', (code) => {
        clearTimeout(timer);
        
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with code ${code}: ${command} ${args.join(' ')}
Stderr: ${stderr}`));
        }
      });
      
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(new Error(`Command error: ${command} ${args.join(' ')}
${error.message}`));
      });
    });
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Global cleanup for all test environments
   */
  async globalCleanup() {
    const cleanupPromises = [];
    
    for (const containerId of this.containers.keys()) {
      cleanupPromises.push(this.cleanupTestEnvironment(containerId));
    }
    
    await Promise.all(cleanupPromises);
    
    // Clean up any stale port allocations
    const staleCount = this.portManager.cleanupStaleAllocations();
    if (staleCount > 0) {
      console.log(`Cleaned up ${staleCount} stale port allocations`);
    }
  }
}