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
      
      // 6. Complete bootstrap sequence with enhanced license automation
      const licenseResult = await this.bootstrapFoundryEnvironmentWithLicenseTracking(page, context);
      
      return { page, containerId, port: allocatedPort, licenseResult };
      
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
   * Enhanced bootstrap with detailed license tracking for concurrent testing
   * @param {Page} page - Puppeteer page
   * @param {Object} context - Test context
   * @returns {Promise<Object>} License automation result
   */
  async bootstrapFoundryEnvironmentWithLicenseTracking(page, context) {
    console.log(`Starting bootstrap for ${context.version} ${context.system}`);
    
    // Enter license key with detailed tracking
    const licenseResult = await this.enterLicenseKey(page);
    console.log(`License automation result: ${JSON.stringify(licenseResult, null, 2)}`);
    
    // Store license result for test analysis
    const bootstrapResult = {
      licenseAutomation: licenseResult,
      timestamp: new Date().toISOString(),
      container: context
    };
    
    // If license entry failed with critical error, abort
    if (!licenseResult.success && licenseResult.status === 'license_error') {
      bootstrapResult.bootstrapFailed = true;
      bootstrapResult.failureReason = licenseResult.details;
      throw new Error(`License entry failed: ${licenseResult.details}`);
    }
    
    bootstrapResult.bootstrapSuccess = true;
    console.log(`Bootstrap completed successfully for ${context.version} ${context.system}`);
    
    return bootstrapResult;
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
      // Wait for page to load completely and check for license screen
      await this.sleep(3000);
      
      // First, detect if we're on a license screen
      const licenseScreenDetected = await page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        const hasLicenseText = bodyText.includes('license') || bodyText.includes('software license');
        const hasSetupTitle = document.title.toLowerCase().includes('setup') || 
                            document.querySelector('h1, h2, .setup-title')?.textContent?.toLowerCase().includes('setup');
        
        return {
          hasLicenseText,
          hasSetupTitle,
          bodyText: bodyText.substring(0, 500) // First 500 chars for debugging
        };
      });
      
      console.log(`License screen detection: hasLicenseText=${licenseScreenDetected.hasLicenseText}, hasSetupTitle=${licenseScreenDetected.hasSetupTitle}`);
      
      // Enhanced license input selectors with FoundryVTT-specific patterns
      const licenseSelectors = [
        // Standard form inputs
        'input[name="licenseKey"]',
        'input[name="license"]', 
        'input[name="key"]',
        '#license-key',
        '#licenseKey',
        '#license',
        
        // FoundryVTT-specific patterns
        '.license-key-input',
        '.license-input',
        '.foundry-license input',
        'input[placeholder*="license" i]',
        'input[placeholder*="key" i]',
        
        // Form context selectors
        '.license-form input[type="text"]',
        '.setup-form input[type="text"]',
        'form input[type="text"]',
        
        // Broader patterns for unknown structures
        'input[type="text"]'
      ];
      
      let licenseInput = null;
      let foundSelector = null;
      
      for (const selector of licenseSelectors) {
        const elements = await page.$$(selector);
        for (const element of elements) {
          // Check if this input is actually for license (could be other text inputs)
          const inputContext = await element.evaluate(el => {
            const placeholder = el.placeholder?.toLowerCase() || '';
            const name = el.name?.toLowerCase() || '';
            const id = el.id?.toLowerCase() || '';
            const parentText = el.parentElement?.textContent?.toLowerCase() || '';
            
            const isLicenseInput = 
              placeholder.includes('license') || placeholder.includes('key') ||
              name.includes('license') || name.includes('key') ||
              id.includes('license') || id.includes('key') ||
              parentText.includes('license') || parentText.includes('software license');
              
            return {
              isLicenseInput,
              placeholder,
              name,
              id,
              parentText: parentText.substring(0, 100)
            };
          });
          
          if (inputContext.isLicenseInput) {
            licenseInput = element;
            foundSelector = selector;
            console.log(`Found license input with selector: ${selector}`);
            console.log(`Input context: name="${inputContext.name}", placeholder="${inputContext.placeholder}", id="${inputContext.id}"`);
            break;
          }
        }
        if (licenseInput) break;
      }
      
      if (!licenseInput) {
        // If no license-specific input found but we're on a potential license screen,
        // try the first text input as a fallback
        if (licenseScreenDetected.hasLicenseText || licenseScreenDetected.hasSetupTitle) {
          const firstTextInput = await page.$('input[type="text"]');
          if (firstTextInput) {
            licenseInput = firstTextInput;
            foundSelector = 'input[type="text"] (fallback)';
            console.log('Using first text input as license input fallback');
          }
        }
      }
      
      if (licenseInput) {
        const licenseKey = process.env.FOUNDRY_LICENSE_KEY || this.config.foundryLicenseKey;
        if (!licenseKey || licenseKey.includes('${')) {
          console.log('FOUNDRY_LICENSE_KEY not available - skipping license entry');
          return { 
            success: false, 
            status: 'no_license_key',
            details: 'License input found but no license key provided in environment'
          };
        }
        
        console.log('Entering license key...');
        
        // Clear any existing text and enter license key
        await licenseInput.click({ clickCount: 3 }); // Select all existing text
        await licenseInput.type(licenseKey);
        
        // Wait a moment for any validation
        await this.sleep(1000);
        
        // Enhanced submit button detection
        const submitSelectors = [
          // Standard submit buttons
          'button[type="submit"]',
          'input[type="submit"]',
          
          // FoundryVTT-specific patterns
          '.license-submit',
          '.foundry-submit',
          'button[data-action="submit"]',
          'button[data-action="license"]',
          
          // Form context
          '.license-form button',
          '.setup-form button',
          'form button',
          
          // Generic buttons near license input
          'button'
        ];
        
        let submitButton = null;
        let submitSelector = null;
        
        for (const selector of submitSelectors) {
          try {
            const buttons = await page.$$(selector);
            for (const button of buttons) {
              const buttonInfo = await button.evaluate(btn => {
                const text = btn.textContent?.toLowerCase() || '';
                const type = btn.type?.toLowerCase() || '';
                const action = btn.getAttribute('data-action')?.toLowerCase() || '';
                
                const isSubmitButton = 
                  type === 'submit' ||
                  text.includes('submit') || text.includes('continue') || 
                  text.includes('activate') || text.includes('accept') ||
                  text.includes('next') || text.includes('ok') ||
                  action.includes('submit') || action.includes('license');
                  
                return {
                  isSubmitButton,
                  text: text.trim(),
                  type,
                  action
                };
              });
              
              if (buttonInfo.isSubmitButton) {
                submitButton = button;
                submitSelector = selector;
                console.log(`Found submit button: "${buttonInfo.text}" with selector: ${selector}`);
                break;
              }
            }
            if (submitButton) break;
          } catch (err) {
            // Continue to next selector
          }
        }
        
        if (submitButton) {
          console.log('Clicking submit button...');
          await submitButton.click();
          
          // Enhanced navigation waiting with multiple strategies
          console.log('Waiting for navigation after license submission...');
          
          const navigationResult = await Promise.race([
            // Strategy 1: Wait for navigation
            page.waitForNavigation({ 
              waitUntil: 'networkidle0', 
              timeout: 20000 
            }).then(() => ({ type: 'navigation', success: true })),
            
            // Strategy 2: Wait for URL change
            page.waitForFunction(() => 
              !window.location.href.includes('license') || 
              window.location.href.includes('setup') ||
              window.location.href.includes('game'),
              { timeout: 20000 }
            ).then(() => ({ type: 'url_change', success: true })),
            
            // Strategy 3: Wait for license screen to disappear
            page.waitForFunction(() => {
              const licenseInputs = document.querySelectorAll('input[name*="license"], input[id*="license"], .license-input');
              return licenseInputs.length === 0;
            }, { timeout: 20000 }).then(() => ({ type: 'screen_change', success: true })),
            
            // Strategy 4: Timeout fallback
            this.sleep(25000).then(() => ({ type: 'timeout', success: false }))
          ]);
          
          console.log(`Navigation completed via: ${navigationResult.type}`);
          
          // Check for license errors after submission
          await this.sleep(2000);
          const errorCheck = await page.evaluate(() => {
            const bodyText = document.body.innerText.toLowerCase();
            const errorMessages = [
              'invalid license',
              'license expired', 
              'license already in use',
              'license error',
              'invalid key',
              'license not found'
            ];
            
            const hasError = errorMessages.some(msg => bodyText.includes(msg));
            return {
              hasError,
              errorText: hasError ? bodyText.substring(0, 200) : null
            };
          });
          
          if (errorCheck.hasError) {
            console.log(`License error detected: ${errorCheck.errorText}`);
            return {
              success: false,
              status: 'license_error',
              details: `License submission failed: ${errorCheck.errorText}`
            };
          }
          
          return {
            success: true,
            status: 'license_accepted',
            details: `License successfully submitted using ${foundSelector}, navigated via ${navigationResult.type}`
          };
          
        } else {
          console.log('No submit button found, checking for auto-submission...');
          
          // Wait to see if license auto-submits
          await this.sleep(5000);
          
          const autoSubmitCheck = await page.evaluate(() => {
            const licenseInputs = document.querySelectorAll('input[name*="license"], input[id*="license"], .license-input');
            return licenseInputs.length === 0; // License screen disappeared
          });
          
          if (autoSubmitCheck) {
            return {
              success: true,
              status: 'license_auto_accepted',
              details: 'License automatically accepted without submit button'
            };
          } else {
            return {
              success: false,
              status: 'no_submit_method',
              details: 'License input found and filled, but no submit method available'
            };
          }
        }
      } else {
        console.log('No license input found - license not required or already entered');
        return {
          success: true,
          status: 'no_license_required',
          details: 'No license input detected, assuming license not required'
        };
      }
      
    } catch (error) {
      console.log(`License key entry error: ${error.message}`);
      return {
        success: false,
        status: 'license_entry_error', 
        details: `Error during license entry: ${error.message}`
      };
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
          reject(new Error(`Command failed with code ${code}: ${command} ${args.join(' ')}\nStderr: ${stderr}`));
        }
      });
      
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(new Error(`Command error: ${command} ${args.join(' ')}\n${error.message}`));
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