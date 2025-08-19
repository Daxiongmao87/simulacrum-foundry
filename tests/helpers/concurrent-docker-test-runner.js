/**
 * Concurrent DockerTestRunner Framework (Refactored)
 * 
 * Enhanced DockerTestRunner with dynamic port allocation and concurrent container support.
 * Fixes the critical architectural flaw where all containers tried to use port 30000.
 * 
 * REFACTORED: Bootstrap helpers extracted to modular components for better maintainability.
 * 
 * Key Features:
 * - Dynamic port allocation (30000-30010 range)
 * - Instance limiting (max 3 concurrent containers)
 * - Queue system for test execution
 * - True multi-version parallel testing
 * - Modular bootstrap helper architecture
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import { loadTestConfig } from './test-config.js';
import { PortManager } from './port-manager.js';
import { enterLicenseKey } from './bootstrap/license-helper.js';
import { installGameSystem } from './bootstrap/system-installation-helper.js';
import { createWorld } from './bootstrap/world-creation-helper.js';
import { loginAsGM } from './bootstrap/gm-login-helper.js';
import { validateReadyState } from './bootstrap/ready-state-helper.js';
import { sleep, waitForNavigation, runCommand } from './bootstrap/shared-utilities.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Global PortManager instance shared across all test runners
let globalPortManager = null;

export class ConcurrentDockerTestRunner {
  constructor() {
    this.config = loadTestConfig();
    this.containers = new Map(); // containerId -> { port, startTime, ... }
    this.browsers = new Map(); // containerId -> browser instance
    this.testQueue = []; // Test queue for concurrent execution
    
    // Initialize global port manager if not exists
    if (!globalPortManager) {
      globalPortManager = new PortManager(this.config);
    }
    this.portManager = globalPortManager;
  }

  /**
   * Main test runner - executes tests across all enabled versions concurrently
   * @param {string} testName - Test name for logging
   * @param {Function} testFn - Test function to execute
   */
  testAcrossVersions(testName, testFn) {
    // Get enabled configurations from test config
    const enabledVersions = this.config.versions.filter(v => v.enabled);
    const enabledSystems = this.config.systems.filter(s => s.enabled);
    
    // Generate test contexts (cartesian product of versions and systems)
    const testContexts = [];
    for (const version of enabledVersions) {
      for (const system of enabledSystems) {
        testContexts.push({
          version: version.tag,
          system: system.id,
          systemName: system.name,
          systemManifestUrl: system.manifestUrl,
          systemDownloadUrl: system.downloadUrl,
          dockerImage: version.image
        });
      }
    }

    // Create test suite for each context
    describe(`${testName} - Concurrent Multi-Version Testing`, () => {
      testContexts.forEach(context => {
        it(`${testName} (${context.version} - ${context.systemName})`, async function() {
          this.timeout(this.config?.bootstrap?.timeouts?.foundryReady + 60000); // Extra time for concurrent operations
          
          const testResult = await testFn(context);
          return testResult;
        }, this.config.bootstrap.timeouts.foundryReady + 60000); // Extra time for concurrent operations
      });
    });
  }

  /**
   * Set up test environment with dynamic port allocation
   * @param {Object} context - Test context containing version and system info
   * @returns {Promise<{page: Page, port: number, containerId: string}>}
   */
  async setupTestEnvironment(context) {
    // Generate unique container ID
    const containerId = `${this.config.docker.imagePrefix}-${context.version}-${context.system}-${Date.now()}`;
    
    // Allocate port
    const port = await this.portManager.allocatePort(containerId);
    console.log(`Setting up test environment for ${context.version} ${context.system} on port ${port}`);
    
    try {
      // Build and start container
      console.log(`📦 Step 1: Building and starting Docker container...`);
      await this.buildAndStartContainer(containerId, context, port);
      
      // Wait for FoundryVTT to be ready
      console.log(`⏳ Step 2: Waiting for FoundryVTT server to be ready...`);
      await this.waitForFoundryReady(containerId, port);
      
      // Launch Puppeteer and connect to container
      console.log(`🌐 Step 3: Launching browser and connecting to FoundryVTT...`);
      const browser = await this.launchPuppeteer();
      this.browsers.set(containerId, browser);
      
      const page = await browser.newPage();
      await page.goto(`http://localhost:${port}`, { 
        waitUntil: 'networkidle0',
        timeout: this.config.puppeteer.timeout
      });
      
      // Automatically run bootstrap sequence
      console.log(`✅ Test environment ready for ${context.version} ${context.system} on port ${port}`);
      console.log(`🚀 Step 4: Starting automatic bootstrap sequence...`);
      
      const bootstrapResult = await this.bootstrapFoundryEnvironment(page, context);
      
      console.log(`🎯 Bootstrap sequence completed with status: ${bootstrapResult.bootstrapSuccess ? 'SUCCESS' : 'FAILED'}`);
      
      return { page, port, containerId, bootstrapResult };
      
    } catch (error) {
      // Clean up on error
      await this.cleanupTestEnvironment(containerId);
      throw error;
    }
  }

  /**
   * Build and start a FoundryVTT container with the specified configuration
   * @param {string} containerId - Unique container identifier
   * @param {Object} context - Test context
   * @param {number} port - Port to bind container to
   */
  async buildAndStartContainer(containerId, context, port) {
    const projectRoot = join(__dirname, '../..');
    
    // Get license key for container setup
    const licenseKey = process.env.FOUNDRY_LICENSE_KEY || this.config.foundryLicenseKey;
    if (!licenseKey || licenseKey.includes('${')) {
      throw new Error('FoundryVTT license key is required. Set FOUNDRY_LICENSE_KEY environment variable.');
    }

    console.log(`🐳 Building Docker container: ${containerId}`);
    
    // Determine ZIP file path based on version context  
    const foundryZipPath = context.versionZip 
      ? `tests/fixtures/binary_versions/${context.version}/${context.versionZip}`
      : `tests/fixtures/binary_versions/${context.version}/FoundryVTT-Node-${context.version.replace('v', '')}.347.zip`;
    
    console.log(`📦 Using ZIP: ${foundryZipPath}`);
    console.log(`🔑 License key configured: ${licenseKey.substring(0, 8)}...`);
    
    // Build container with context-specific image and correct Dockerfile path
    const buildArgs = [
      'build',
      '-f', 'tests/docker/Dockerfile.foundry',
      '-t', containerId,
      '--build-arg', `FOUNDRY_VERSION_ZIP=${foundryZipPath}`,
      '--build-arg', `FOUNDRY_LICENSE_KEY=${licenseKey}`,
      '.'
    ];
    
    console.log(`🔨 Running: docker build -f tests/docker/Dockerfile.foundry -t ${containerId} ...`);
    await runCommand('docker', buildArgs, {
      cwd: projectRoot,
      timeout: this.config.bootstrap.timeouts.containerStart
    });
    console.log(`✅ Docker build completed for ${containerId}`);

    console.log(`🚀 Starting container ${containerId} on port ${port}...`);
    
    // Start container with port mapping and volume mounts
    const runArgs = [
      'run', '-d',
      '--name', containerId,
      '-p', `${port}:30000`,
      '-v', `${projectRoot}:${this.config.docker.moduleMountPath}`,
      containerId
    ];
    
    await runCommand('docker', runArgs, {
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
   * Wait for FoundryVTT to be ready in the container
   * @param {string} containerId - Container identifier
   * @param {number} port - Port to check
   */
  async waitForFoundryReady(containerId, port) {
    const startTime = Date.now();
    const overallTimeout = this.config?.bootstrap?.timeouts?.foundryReady || 60000; // total time budget
    const pollInterval = 2000; // check every 2 seconds
    let attempt = 0;

    console.log(`⏳ Waiting for FoundryVTT to be ready on port ${port} (timeout: ${overallTimeout/1000}s)...`);

    while (Date.now() - startTime < overallTimeout) {
      attempt++;
      const elapsed = Date.now() - startTime;
      
      try {
        console.log(`   📍 Attempt ${attempt} (${Math.floor(elapsed/1000)}s elapsed): Checking container status...`);
        
        // Check if container is still running
        const containerStatus = await runCommand('docker', ['ps', '--filter', `name=${containerId}`, '--format', '{{.Status}}'], { timeout: 5000 });
        if (!containerStatus.includes('Up')) {
          // Container stopped, get logs for debugging
          console.log(`❌ Container ${containerId} stopped unexpectedly, getting logs...`);
          const logs = await runCommand('docker', ['logs', '--tail', '30', containerId], { timeout: 8000 });
          throw new Error(`Container ${containerId} stopped unexpectedly. Logs: ${logs}`);
        }
        console.log(`   ✅ Container is running`);

        // Try to reach FoundryVTT web interface using curl HEAD request
        console.log(`   🌐 Testing HTTP connection to localhost:${port}...`);
        try {
          const curlOutput = await runCommand('curl', ['-I', '-s', `http://localhost:${port}`], { timeout: 5000 });
          console.log(`   📡 HTTP Response: ${curlOutput.split('\n')[0]}`);
          
          // Check for successful HTTP responses (200 OK or 302 redirect to license page)
          if (curlOutput.includes('HTTP/1.1 200') || curlOutput.includes('HTTP/1.0 200')) {
            console.log(`✅ FoundryVTT ready on port ${port} after ${Math.floor(elapsed/1000)}s (HTTP 200 OK)`);
            return;
          } else if (curlOutput.includes('HTTP/1.1 302') || curlOutput.includes('HTTP/1.0 302')) {
            console.log(`✅ FoundryVTT ready on port ${port} after ${Math.floor(elapsed/1000)}s (HTTP 302 redirect to license)`);
            return;
          } else {
            console.log(`   ⏳ HTTP connection not ready (${curlOutput.split('\n')[0] || 'no response'}), continuing to wait...`);
          }
        } catch (curlError) {
          console.log(`   ⏳ HTTP connection failed (${curlError.message.substring(0, 50)}), continuing to wait...`);
        }
      } catch (error) {
        console.log(`   ⚠️  Connection attempt failed: ${error.message.substring(0, 100)}`);
      }

      await sleep(pollInterval);
    }

    console.log(`❌ FoundryVTT readiness timeout after ${Math.floor((Date.now() - startTime)/1000)}s`);
    throw new Error(`FoundryVTT not ready after ${overallTimeout}ms on port ${port}`);
  }

  /**
   * Launch Puppeteer with optimized settings for FoundryVTT
   * @returns {Promise<Browser>} Puppeteer browser instance
   */
  async launchPuppeteer() {
    // Base args required for Docker/containerized environments
    const baseArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ];
    
    // Merge with any additional args from config
    const configArgs = this.config.puppeteer.args || [];
    const allArgs = [...baseArgs, ...configArgs];
    
    return await puppeteer.launch({
      headless: this.config.puppeteer.headless,
      args: allArgs,
      defaultViewport: { width: 1280, height: 720 }
    });
  }

  /**
   * Bootstrap FoundryVTT environment with all required setup steps using modular helpers
   * @param {Page} page - Puppeteer page
   * @param {Object} context - Test context
   * @returns {Promise<Object>} Bootstrap result with license, system, world creation, and GM login status
   */
  async bootstrapFoundryEnvironment(page, context) {
    console.log(`🚀 Starting FoundryVTT bootstrap sequence for ${context.version} ${context.system}...`);
    
    // Step 1: License automation
    console.log(`🔑 Step 1: Handling license key automation...`);
    const licenseResult = await enterLicenseKey(page, this.config);
    console.log(`   📋 License result: ${licenseResult.status} - ${licenseResult.details || 'No details'}`);

    const bootstrapResult = {
      licenseAutomation: licenseResult,
      systemInstallation: [],
      worldCreation: null, // Will be populated after world creation
      gmLogin: null, // Will be populated after GM login
      timestamp: new Date().toISOString(),
      container: context
    };
    
    if (!licenseResult.success && licenseResult.status === 'license_error') {
      bootstrapResult.bootstrapFailed = true;
      bootstrapResult.failureReason = licenseResult.details;
      throw new Error(`License entry failed: ${licenseResult.details}`);
    }
    
    // Step 2: Install the game system specified in the context
    console.log(`🎲 Step 2: Installing game system '${context.system}'...`);
    const installResult = await installGameSystem(page, context.system, context.systemManifestUrl, context.systemDownloadUrl);
    
    bootstrapResult.systemInstallation.push(installResult);
    if (!installResult.success) {
      console.log(`   ❌ System ${context.system} installation failed: ${installResult.details}`);
      bootstrapResult.bootstrapFailed = true;
      bootstrapResult.failureReason = `Failed to install ${context.system} after ${installResult.retryCount || 0} retries: ${installResult.details}`;
      throw new Error(bootstrapResult.failureReason);
    }
    console.log(`   ✅ System ${context.system} installation completed (${installResult.retryCount || 0} retries used)`);
    
    // Step 3: Create test world
    console.log(`🌍 Step 3: Creating test world...`);
    const testWorldConfig = {
      name: `Test World ${context.version}`,
      system: context.system || 'dnd5e',
      description: `Automated test world for ${context.version} with ${context.systemName || context.system}`
    };
    console.log(`   📋 World config: "${testWorldConfig.name}" using ${testWorldConfig.system}`);
    
    const worldResult = await createWorld(page, testWorldConfig, {
      maxRetries: 3,
      timeout: 30000
    });
    bootstrapResult.worldCreation = worldResult;
    
    if (!worldResult.success) {
      console.log(`   ❌ World creation failed: ${worldResult.details}`);
      bootstrapResult.bootstrapFailed = true;
      bootstrapResult.failureReason = `Failed to create test world after ${worldResult.retryCount || 0} retries: ${worldResult.details}`;
      throw new Error(bootstrapResult.failureReason);
    }
    console.log(`   ✅ World "${testWorldConfig.name}" created successfully (${worldResult.retryCount || 0} retries used)`);
    
    // Step 4: GM login and world launch
    console.log(`👑 Step 4: Logging in as GM and launching world...`);
    const gmLoginResult = await loginAsGM(page, testWorldConfig, {
      maxRetries: 3,
      timeout: 60000,
      adminPassword: process.env.FOUNDRY_ADMIN_PASSWORD || 'test-admin-password'
    });
    bootstrapResult.gmLogin = gmLoginResult;
    
    if (!gmLoginResult.success) {
      console.log(`   ❌ GM login failed: ${gmLoginResult.details}`);
      bootstrapResult.bootstrapFailed = true;
      bootstrapResult.failureReason = `Failed to login as GM after ${gmLoginResult.retryCount || 0} retries: ${gmLoginResult.details}`;
      throw new Error(bootstrapResult.failureReason);
    }
    console.log(`   ✅ GM login and world launch completed (${gmLoginResult.retryCount || 0} retries used)`);
    
    // Step 5: Ready state validation
    console.log(`🎯 Step 5: Validating ready state for testing...`);
    const readyStateResult = await validateReadyState(page, {
      timeout: 30000,
      componentTimeout: 5000,
      requireCanvas: true,
      requireGMPermissions: true
    });
    bootstrapResult.readyStateValidation = readyStateResult;
    
    if (!readyStateResult.success) {
      console.log(`   ❌ Ready state validation failed: ${readyStateResult.details}`);
      bootstrapResult.bootstrapFailed = true;
      bootstrapResult.failureReason = `Ready state validation failed: ${readyStateResult.details}`;
      throw new Error(bootstrapResult.failureReason);
    }
    console.log(`   ✅ Ready state validation completed: ${readyStateResult.details}`);
    
    bootstrapResult.bootstrapSuccess = true;
    console.log(`🎉 Bootstrap completed successfully for ${context.version} ${context.system}!`);
    console.log(`📊 Bootstrap summary: License(${licenseResult.status}), Systems(${enabledSystems.length} installed), World(created), GM(authenticated), Ready(validated)`);
    
    return bootstrapResult;
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
        await runCommand('docker', ['stop', containerId], { timeout: 10000 });
        await runCommand('docker', ['rm', containerId], { timeout: 10000 });
        this.containers.delete(containerId);
      }
      
      // Release port
      if (containerInfo && containerInfo.port) {
        this.portManager.releasePort(containerId, containerInfo.port);
      }
      
      console.log(`Cleaned up test environment: ${containerId}`);
      
    } catch (error) {
      console.error(`Error cleaning up ${containerId}:`, error.message);
    }
  }

  /**
   * Get current runner status for debugging
   * @returns {Object} Status object with containers, browsers, and port info
   */
  getStatus() {
    return {
      containers: Array.from(this.containers.entries()).map(([id, info]) => ({
        id,
        port: info.port,
        uptime: Date.now() - info.startTime,
        context: info.context
      })),
      browsers: this.browsers.size,
      allocatedPorts: this.portManager.getAllocatedPorts()
    };
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