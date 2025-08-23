#!/usr/bin/env node

/**
 * @file tests/bootstrap/bootstrap-runner.js
 * @description Clean orchestrator for bootstrap process using version-specific modules
 * 
 * This creates version/system permutations and runs the bootstrap process
 * for each combination, using the existing working Docker setup.
 */

import { readFileSync } from 'fs';
import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import puppeteer from 'puppeteer';
import { PortManager } from './common/port-manager.js';
import { DockerUtils, BrowserUtils } from './common/index.js';

// Dynamic imports for version-specific modules

import { ApplicationInitializationV12 } from './stages/application-initialization/v12/index.js';
import { SystemInstallationV12 } from './stages/system-installation/v12/index.js';
import { WorldCreationStageV12 } from './stages/world-creation/v12/index.js';
import { SessionActivationV12 } from './stages/session-activation/v12/index.js';

import { ApplicationInitializationV13 } from './stages/application-initialization/v13/index.js';
import { SystemInstallationV13 } from './stages/system-installation/v13/index.js';
import { WorldCreationStageV13 } from './stages/world-creation/v13/index.js';
import { SessionActivationV13 } from './stages/session-activation/v13/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

class BootstrapRunner {
  constructor(config, debugMode = false) {
    this.config = config;
    this.debugMode = debugMode;
    this.permutations = [];
    this.portManager = new PortManager(this.config);
  }

  async initialize() {
    console.log('🚀 Initializing Bootstrap Runner...');
    
    // Config is now passed in constructor, so no need to read it here.
    // this.config = JSON.parse(readFileSync('tests/config/test.config.json', 'utf8'));
    // console.log('✅ Config loaded');
    
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
    // Prefer actual fixture ZIP present for the version
    const fixtureDir = join(PROJECT_ROOT, 'tests/fixtures/binary_versions', version);
    try {
      const entries = execSync(`ls -1 "${fixtureDir}" | grep -E '\\.(zip|ZIP)$' | head -1`, { encoding: 'utf8' }).trim();
      if (entries) return entries;
    } catch (_) {}
    // Fallback names
    const versionMap = {
      'v13': 'FoundryVTT-Node-13.347.zip',
      'v12': 'FoundryVTT-Node-12.331.zip'
    };
    return versionMap[version] || `FoundryVTT-Node-${version.substring(1)}.zip`;
  }

  /**
   * Dynamically get version-specific module instances
   */
  getVersionModules(version) {
    const moduleMap = {
      'v12': {
        stages: {
          'application-initialization': new ApplicationInitializationV12(),
          'system-installation': new SystemInstallationV12(),
          'world-creation': new WorldCreationStageV12(),
          'session-activation': new SessionActivationV12()
        }
      },
      'v13': {
        stages: {
          'application-initialization': new ApplicationInitializationV13(),
          'system-installation': new SystemInstallationV13(),
          'world-creation': new WorldCreationStageV13(),
          'session-activation': new SessionActivationV13()
        }
      }
    };
    
    return moduleMap[version] || moduleMap['v13']; // Default to v13
  }

  async discoverAvailableVersions() {
    console.log('🔍 Discovering available Foundry versions...');
    
    const availableVersions = [];
    
    for (const version of this.versions) {
      const versionPath = join(PROJECT_ROOT, 'tests/fixtures/binary_versions', version);
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

  async runBootstrapTest(permutation, options = {}) {
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
      await DockerUtils.buildFoundryImage(imageName, permutation.version, foundryLicenseKey);
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
      const containerId = await DockerUtils.startFoundryContainer(testId, imageName, port, permutation.version);
      console.log(`📦 Container ID: ${containerId}`);
      
      // Step 2: Wait for container to be ready
      console.log('⏳ Waiting for container to be ready...');
      const ready = await DockerUtils.waitForContainerReady(port, this.config);
      
      if (!ready) {
        throw new Error('Container failed to start properly');
      }
      
      console.log('✅ Container is ready');
      
      // Step 3: Run bootstrap process using version-specific modules
      const bootstrapResult = await this.runBootstrapProcess(port, permutation, { stopAtStep: options.stopAtStep });
      
      if (!bootstrapResult.success) {
        throw new Error(`Bootstrap failed: ${bootstrapResult.error}`);
      }
      
      console.log('✅ Bootstrap completed successfully');
      
      // Optional: capture a proof screenshot but keep browser alive for integration tests
      const screenshotPath = await this.takeScreenshot(bootstrapResult.page, permutation.id);
      
      // Do NOT cleanup here on success; the orchestrator will call cleanupSession.
      // Return a live session object expected by integration tests.
      return {
        success: true,
        permutation,
        containerId,
        port,
        instanceId: testId,
        page: bootstrapResult.page,
        browser: bootstrapResult.browser,
        screenshotPath,
        gameState: { phase: bootstrapResult.phase, ready: true }
      };
      
    } catch (error) {
      console.error(`❌ Bootstrap test failed for ${permutation.id}:`, error.message);
      
      // Try to print container logs before cleanup for diagnostics
      try {
        const logName = testId; // container was started with --name ${testId}
        execSync(`docker logs ${logName} --tail 200`, { stdio: 'inherit' });
      } catch (e) {
        console.warn(`⚠️ Failed to fetch container logs: ${e.message}`);
      }

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

  /**
   * Build image and start container only (no Puppeteer/bootstrap phases)
   * Mirrors the build/run path of runBootstrapTest up to readiness
   */
  async createContainerOnly(permutation) {
    console.log(`🎯 Creating container only: ${permutation.id}`);
    const testId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const port = await this.portManager.allocatePort(testId);

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
      const contextZipPath = `tests/fixtures/binary_versions/${permutation.version}/${zipFileName}`;

      execSync(`docker build -f tests/docker/Dockerfile.foundry --build-arg FOUNDRY_VERSION_ZIP=${contextZipPath} --build-arg FOUNDRY_MAIN_JS_PATH=/app/main.js --build-arg FOUNDRY_LICENSE_KEY=${foundryLicenseKey} -t ${imageName} .`, { stdio: 'inherit', cwd: PROJECT_ROOT });
      console.log(`✅ Docker image ${imageName} built successfully`);
    } catch (error) {
      console.error('❌ Docker build failed:', error.message);
      throw error;
    }

    try {
      // Clean up any existing containers
      console.log('🧹 Cleaning up existing containers...');
      try {
        execSync(`docker stop ${testId}`, { stdio: 'ignore' });
        execSync(`docker rm ${testId}`, { stdio: 'ignore' });
      } catch (e) {
        // ignore
      }

      // Start fresh container
      console.log(`🚀 Starting fresh FoundryVTT container from image: ${imageName}...`);
      const envArgs = permutation.version === 'v12'
        ? '-e FOUNDRY_DATA_PATH=/data -e FOUNDRY_MAIN_JS_PATH=/app/resources/app/main.js'
        : '-e FOUNDRY_DATA_PATH=/data';
      const containerId = await DockerUtils.startFoundryContainer(testId, imageName, port, permutation.version);
      console.log(`📦 Container ID: ${containerId}`);

      // Wait for container to be ready
      console.log('⏳ Waiting for container to be ready...');
      const ready = await DockerUtils.waitForContainerReady(port, this.config);
      if (!ready) {
        throw new Error('Container failed to start properly');
      }
      console.log('✅ Container is ready');

      return {
        success: true,
        permutation,
        containerId,
        port,
        instanceId: testId,
        containerName: testId,
        imageName,
        url: `http://localhost:${port}`
      };

    } catch (error) {
      console.error(`❌ Container creation failed for ${permutation.id}:`, error.message);
      try {
        const logName = testId;
        execSync(`docker logs ${logName} --tail 200`, { stdio: 'inherit' });
      } catch (e) {
        console.warn(`⚠️ Failed to fetch container logs: ${e.message}`);
      }
      console.log(`🧹 Cleaning up failed container ${testId}...`);
      try {
        execSync(`docker stop ${testId}`, { stdio: 'ignore' });
        execSync(`docker rm ${testId}`, { stdio: 'ignore' });
        console.log(`✅ Failed container ${testId} cleaned up`);
      } catch (e) {
        console.warn(`⚠️ Failed container cleanup failed: ${e.message}`);
      }
      console.log(`🧹 Cleaning up Docker image ${imageName}...`);
      try {
        execSync(`docker rmi ${imageName}`, { stdio: 'ignore' });
        console.log(`✅ Docker image ${imageName} removed`);
      } catch (e) {
        console.warn(`⚠️ Docker image cleanup failed: ${e.message}`);
      }
      this.portManager.releasePort(testId, port);
      return { success: false, permutation, error: error.message };
    }
  }

  async waitForContainerReady(port) {
    const retries = this.config?.bootstrap?.retries?.containerHealthCheck ?? 30;
    const curlTimeout = this.config?.bootstrap?.retries?.curlTimeout ?? 5000;
    const interval = this.config?.bootstrap?.retries?.healthCheckInterval ?? 1000;
    for (let i = 0; i < retries; i++) {
      try {
        const response = execSync(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${port}`, { 
          encoding: 'utf8', 
          timeout: curlTimeout 
        });
        if (response.trim() === '302') {
          return true;
        }
      } catch (e) {}
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    return false;
  }

  async runBootstrapProcess(port, permutation, options = {}) {
    console.log(`🔄 Running bootstrap process for ${permutation.id}...`);
    
    const browser = await BrowserUtils.launchBrowser(this.config);
    const page = await BrowserUtils.createPageWithHandlers(browser, this.config);
    
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
      // Set longer timeout for the entire process
      page.setDefaultTimeout(300000); // 5 minutes
      
      // Navigate to Foundry
      await page.goto(`http://localhost:${port}`, { waitUntil: 'domcontentloaded', timeout: this.config?.puppeteer?.timeout ?? 30000 });
      
      // Get version-specific modules
      const modules = this.getVersionModules(permutation.version);

      // Define ordered stages
      const steps = [
        { name: 'application-initialization', run: async () => {
            console.log(`📍 Stage 1: Application initialization for ${permutation.version}...`);
            await modules.stages['application-initialization'].run(page, permutation, this.config, port);
          }, description: modules.stages['application-initialization'].constructor?.meta?.description },
        { name: 'system-installation', run: async () => {
            console.log(`📍 Stage 2: System installation for ${permutation.version}...`);
            await modules.stages['system-installation'].run(page, permutation, this.config, port);
          }, description: modules.stages['system-installation'].constructor?.meta?.description },
        { name: 'world-creation', run: async () => {
            console.log(`📍 Stage 3: World creation for ${permutation.version}...`);
            await modules.stages['world-creation'].run(page, permutation, this.config, port);
          }, description: modules.stages['world-creation'].constructor?.meta?.description },
        { name: 'session-activation', run: async () => {
            console.log(`📍 Stage 4: Session activation for ${permutation.version}...`);
            await modules.stages['session-activation'].run(page, permutation, this.config, port);
          }, description: modules.stages['session-activation'].constructor?.meta?.description }
      ];

      const stopAt = (options.stopAtStep || '').trim();
      let completed = 0;
      for (const step of steps) {
        await step.run();
        completed += 1;
        if (stopAt && step.name === stopAt) {
          console.log(`⏸️  Stop-at-step reached: ${step.name}`);
          return { success: true, browser, page, phase: completed, stoppedAt: step.name };
        }
      }

      console.log(`✅ All phases completed successfully for ${permutation.version}`);
      return { success: true, browser, page, phase: steps.length };
      
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  async takeScreenshot(page, testId) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `bootstrap-${testId}-${timestamp}.png`;
    const path = join(PROJECT_ROOT, 'tests/artifacts', filename);
    
    try {
      await page.screenshot({ path, fullPage: true });
      console.log(`📸 Screenshot saved: ${path}`);
      return path;
    } catch (error) {
      console.warn(`⚠️ Screenshot failed: ${error.message}`);
      return null;
    }
  }

  async createSession(permutation, options = {}) {
    console.log(`[BootstrapRunner] Creating session for: ${permutation.id}`);
    const session = await this.runBootstrapTest(permutation, options);
    if (!session.success) {
      throw new Error(`Failed to create session for ${permutation.id}: ${session.error}`);
    }
    return session;
  }

  async cleanupSession(session) {
    if (!session || !session.containerId) return;
    console.log(`[BootstrapRunner] Cleaning up session for container: ${session.containerId}`);
    try {
      execSync(`docker stop ${session.containerId}`, { stdio: 'ignore' });
      execSync(`docker rm ${session.containerId}`, { stdio: 'ignore' });
      console.log(`✅ Container ${session.containerId} cleaned up`);
    } catch (e) {
      console.warn(`⚠️ Container cleanup failed: ${e.message}`);
    }
    if (session.port) {
      this.portManager.releasePort(session.containerId, session.port);
    }
  }

  async cleanupImages(permutations) {
    console.log('[BootstrapRunner] Cleaning up Docker images...');
    for (const permutation of permutations) {
        const imageName = `${this.config.docker.imagePrefix}-${permutation.id}`;
        try {
            execSync(`docker rmi ${imageName}`, { stdio: 'ignore' });
            console.log(`✅ Docker image ${imageName} removed`);
        } catch (e) {
            // Ignore errors if image doesn't exist
        }
    }
  }

  async runAllTests() {
    console.log('🚀 Starting all bootstrap tests...');
    
    const results = [];
    
    for (const permutation of this.permutations) {
      try {
        const result = await this.runBootstrapTest(permutation);
        results.push(result);
        
        if (result.success) {
          console.log(`✅ ${permutation.id}: SUCCESS`);
        } else {
          console.log(`❌ ${permutation.id}: FAILED - ${result.error}`);
        }
        
      } catch (error) {
        console.error(`💥 ${permutation.id}: CRASHED - ${error.message}`);
        results.push({
          success: false,
          permutation,
          error: error.message
        });
      }
    }
    
    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log('\n📊 TEST SUMMARY:');
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Total: ${results.length}`);
    
    return results;
  }

  async cleanup() {
    console.log('🧹 Cleaning up...');
    
    try {
      // Clean up any leftover test containers
      const containers = execSync('docker ps -a --filter "name=test-" --format "{{.Names}}"', { encoding: 'utf8' }).trim().split('\n').filter(name => name.length > 0);
      
      if (containers.length > 0) {
        console.log(`🧹 Found ${containers.length} leftover test containers, cleaning up...`);
        
        for (const container of containers) {
          try {
            execSync(`docker stop ${container}`, { stdio: 'ignore' });
            execSync(`docker rm ${container}`, { stdio: 'ignore' });
            console.log(`✅ Cleaned up container: ${container}`);
          } catch (e) {
            console.warn(`⚠️ Failed to clean up container ${container}: ${e.message}`);
          }
        }
        
        console.log('✅ No leftover test containers found');
      }
    } catch (e) {
      console.log('✅ No test containers to clean up');
    }
  }
  /**
   * Return ordered list of available step names and descriptions for a given version
   */
  async getStepList(version) {
    const modules = this.getVersionModules(version);
    return [
      { name: 'application-initialization', description: modules.stages['application-initialization'].constructor?.meta?.description || 'Initialize Foundry application' },
      { name: 'system-installation', description: modules.stages['system-installation'].constructor?.meta?.description || 'Install configured game system' },
      { name: 'world-creation', description: modules.stages['world-creation'].constructor?.meta?.description || 'Create test world' },
      { name: 'session-activation', description: modules.stages['session-activation'].constructor?.meta?.description || 'Launch world, authenticate, verify, enable module' }
    ];
  }
}

// Main execution block removed as this is now a module controlled by run-tests.js

export { BootstrapRunner };

// Static API for quiet consumers (e.g., list-steps) that must not instantiate BootstrapRunner
BootstrapRunner.getStepList = function(version) {
  // Four canonical stages only, version-agnostic listing helper
  return [
    { name: 'application-initialization', description: 'Initialize Foundry application (license, EULA, setup flow)' },
    { name: 'system-installation', description: 'Install configured game system' },
    { name: 'world-creation', description: 'Create test world' },
    { name: 'session-activation', description: 'Launch world, authenticate, verify, enable module' }
  ];
};
