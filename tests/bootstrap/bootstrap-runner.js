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

import { LicenseSubmissionV12 } from './v12/license-submission.js';
import { EULAHandlingV12 } from './v12/eula-handling.js';
import { SetupNavigationV12 } from './v12/setup-navigation.js';
import { DeclineDataSharingV12 } from './v12/decline-data-sharing.js';
import { StepButtonHandlingV12 } from './v12/step-button-handling.js';
import { SystemInstallerV12 } from './v12/install-system.js';
import { WorldCreationV12 } from './v12/world-creation.js';
import { WorldLaunchV12 } from './v12/world-launch.js';
import { UserAuthenticationV12 } from './v12/user-authentication.js';
import { GameVerificationV12 } from './v12/game-verification.js';
import { EnableModuleV12 } from './v12/enable-module.js';

import { LicenseSubmissionV13 } from './v13/license-submission.js';
import { EULAHandlingV13 } from './v13/eula-handling.js';
import { SetupNavigationV13 } from './v13/setup-navigation.js';
import { DeclineDataSharingV13 } from './v13/decline-data-sharing.js';
import { StepButtonHandlingV13 } from './v13/step-button-handling.js';
import { SystemInstallerV13 } from './v13/install-system.js';
import { WorldCreationV13 } from './v13/world-creation.js';
import { WorldLaunchV13 } from './v13/world-launch.js';
import { UserAuthenticationV13 } from './v13/user-authentication.js';
import { GameVerificationV13 } from './v13/game-verification.js';
import { EnableModuleV13 } from './v13/enable-module.js';

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
        licenseSubmission: new LicenseSubmissionV12(),
        eulaHandling: new EULAHandlingV12(),
        setupNavigation: new SetupNavigationV12(),
        declineDataSharing: new DeclineDataSharingV12(),
        stepButtonHandling: new StepButtonHandlingV12(),
        systemInstaller: new SystemInstallerV12(),
        worldCreation: new WorldCreationV12(),
        worldLaunch: new WorldLaunchV12(),
        userAuthentication: new UserAuthenticationV12(),
        gameVerification: new GameVerificationV12(),
        enableModule: new EnableModuleV12()
      },
      'v13': {
        licenseSubmission: new LicenseSubmissionV13(),
        eulaHandling: new EULAHandlingV13(),
        setupNavigation: new SetupNavigationV13(),
        declineDataSharing: new DeclineDataSharingV13(),
        stepButtonHandling: new StepButtonHandlingV13(),
        systemInstaller: new SystemInstallerV13(),
        worldCreation: new WorldCreationV13(),
        worldLaunch: new WorldLaunchV13(),
        userAuthentication: new UserAuthenticationV13(),
        gameVerification: new GameVerificationV13(),
        enableModule: new EnableModuleV13()
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
      const bootstrapResult = await this.runBootstrapProcess(port, permutation);
      
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

  async runBootstrapProcess(port, permutation) {
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
      
            // Phase 1: License submission
      console.log(`📍 Phase 1: Submitting license for ${permutation.version}...`);
      const licenseResult = await modules.licenseSubmission.submitLicense(page, this.config.foundryLicenseKey);
      if (!licenseResult.success) {
        throw new Error(`License submission failed: ${licenseResult.error}`);
      }
      
      // Phase 2: Setup navigation
      console.log(`📍 Phase 2: Navigating to setup for ${permutation.version}...`);
      const setupNavResult = await modules.setupNavigation.navigateToSetup(page, port, this.config);
      if (!setupNavResult.success) {
        throw new Error(`Setup navigation failed: ${setupNavResult.error}`);
      }
      

      // Phase 3: Handle EULA on setup page
      console.log(`📍 Phase 3: Handling EULA on setup page for ${permutation.version}...`);
      const eulaResult = await modules.eulaHandling.handleEULAOnSetupPage(page, this.config);
      if (!eulaResult.success) {
        console.warn(`⚠️ EULA handling had issues: ${eulaResult.error}`);
      }
      
      // Phase 4: Decline data sharing
      console.log(`📍 Phase 4: Handling decline data sharing for ${permutation.version}...`);
      const declineResult = await modules.declineDataSharing.handleDeclineSharing(page);
      if (!declineResult.success) {
        console.warn(`⚠️ Decline sharing handling had issues: ${declineResult.error}`);
      }
      
      // Phase 4: Step button handling
      console.log(`📍 Phase 4: Handling step button for ${permutation.version}...`);
      const stepButtonResult = await modules.stepButtonHandling.handleStepButton(page);
      if (!stepButtonResult.success) {
        console.warn(`⚠️ Step button handling had issues: ${stepButtonResult.error}`);
      }
      
      // Phase 5: System installation
      console.log(`📍 Phase 5: Installing system ${permutation.system} for ${permutation.version}...`);
      const systemResult = await modules.systemInstaller.installSystem(page, permutation.system);
      if (!systemResult.success) {
        throw new Error(`System installation failed: ${systemResult.error}`);
      }

      // Phase 6: World creation
      console.log(`📍 Phase 6: Creating world for ${permutation.version}...`);
      const worldCreateResult = await modules.worldCreation.createWorld(page, permutation, this.config);
      if (!worldCreateResult.success) {
        throw new Error(`World creation failed: ${worldCreateResult.error}`);
      }

      // Phase 7: World launch
      console.log(`📍 Phase 7: Launching world ${worldCreateResult.worldId}...`);
      const launchResult = await modules.worldLaunch.launchWorld(page, worldCreateResult.worldId, port, this.config);
      if (!launchResult.success) {
        throw new Error(`World launch failed: ${launchResult.error}`);
      }

      // Phase 8: User authentication
      console.log('📍 Phase 8: Authenticating user...');
      const authResult = await modules.userAuthentication.authenticateIfNeeded(page, this.config);
      if (!authResult.success) {
        throw new Error(`User authentication failed: ${authResult.error}`);
      }

      // Phase 9: Game verification
      console.log('📍 Phase 9: Verifying game world...');
      const verifyResult = await modules.gameVerification.verifyGame(page, this.config);
      if (!verifyResult.success) {
        throw new Error(`Game verification failed: ${verifyResult.error}`);
      }
      
      // Phase 10: Enable Simulacrum module (placeholder for now)
      console.log('📍 Phase 10: Enabling Simulacrum module...');
      const moduleResult = await modules.enableModule.enableModule(page, this.config);
      if (!moduleResult.success) {
        console.warn(`⚠️ Module enabling had issues: ${moduleResult.error}`);
      }
      
      console.log(`✅ All phases completed successfully for ${permutation.version}`);
      
      return {
        success: true,
        browser,
        page,
        phase: 10
      };
      
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

  async createSession(permutation) {
    console.log(`[BootstrapRunner] Creating session for: ${permutation.id}`);
    const session = await this.runBootstrapTest(permutation);
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
}

// Main execution block removed as this is now a module controlled by run-tests.js

export { BootstrapRunner };
