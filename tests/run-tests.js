#!/usr/bin/env node

/**
 * @file tests/run-tests.js
 * @description Main test orchestrator for FoundryVTT integration testing
 * 
 * This orchestrator implements the architecture defined in tests/SPECIFICATION.md:
 * 1. Creates live FoundryVTT sessions via bootstrap infrastructure
 * 2. Executes integration tests against those sessions  
 * 3. Coordinates resource management and cleanup
 * 4. Generates comprehensive test reports
 * 
 * Architecture:
 * - Bootstrap: Gets to live FoundryVTT session (infrastructure only)
 * - Integration Tests: Test functionality against live sessions (testing only)
 * - Orchestrator: Coordinates complete workflow with resource management
 */

import { readFileSync, existsSync, rmSync, writeFileSync, appendFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';
import { BootstrapRunner } from './bootstrap/bootstrap-runner.js';

// Initialize logging to artifacts
const LOG_FILE = join(dirname(fileURLToPath(import.meta.url)), 'artifacts', `test-run-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
writeFileSync(LOG_FILE, `Test Run Started: ${new Date().toISOString()}\nTEST INFORMATION WILL BE ADDED HERE AFTER CONFIG LOAD\n${'='.repeat(80)}\n`);

// Wrap console methods to also log to file
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args) => {
  const message = args.join(' ');
  originalLog(...args);
  try { appendFileSync(LOG_FILE, `${new Date().toISOString()} [LOG] ${message}\n`); } catch {}
};

console.warn = (...args) => {
  const message = args.join(' ');
  originalWarn(...args);
  try { appendFileSync(LOG_FILE, `${new Date().toISOString()} [WARN] ${message}\n`); } catch {}
};

console.error = (...args) => {
  const message = args.join(' ');
  originalError(...args);
  try { appendFileSync(LOG_FILE, `${new Date().toISOString()} [ERROR] ${message}\n`); } catch {}
};

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// DEBUG mode detection
const DEBUG_MODE = process.env.DEBUG === 'true' || process.argv.includes('--debug');

/**
 * Smart console logging with DEBUG mode support
 */
class TestLogger {
  constructor(debugMode = false) {
    this.debugMode = debugMode;
  }

  // Essential logs - always shown
  essential(message) {
    console.log(`[Test Runner] ${message}`);
  }

  // Debug logs - only shown when DEBUG=true or --debug flag
  debug(message) {
    if (this.debugMode) {
      console.log(`[Test Runner] [Debug] ${message}`);
    }
  }

  // Success logs - always shown
  success(message) {
    console.log(`[Test Runner] ✅ ${message}`);
  }

  // Warning logs - always shown
  warn(message) {
    console.warn(`[Test Runner] ⚠️ ${message}`);
  }

  // Error logs - always shown
  error(message) {
    console.error(`[Test Runner] ❌ ${message}`);
  }

  // Info logs - always shown
  info(message) {
    console.log(`[Test Runner] 📋 ${message}`);
  }

  // Progress logs - debug mode only (too verbose for normal operation)
  progress(message) {
    if (this.debugMode) {
      console.log(`[Test Runner] [Debug] 🔄 ${message}`);
    }
  }

  // Configuration logs - debug mode only (technical details)
  config(message) {
    if (this.debugMode) {
      console.log(`[Test Runner] [Debug] ⚙️ ${message}`);
    }
  }
}

class TestOrchestrator {
  constructor() {
    this.config = null;
    this.bootstrap = null;
    this.results = [];
    this.startTime = Date.now();
    this.manualMode = false;
    this.manualStepName = null;
    this.logger = new TestLogger(DEBUG_MODE);
  }

  cleanArtifacts() {
    const artifactsPath = join(PROJECT_ROOT, 'tests', 'artifacts');
    
    if (existsSync(artifactsPath)) {
      this.logger.essential('🧹 Cleaning artifacts directory...');
      
      // Remove all files in artifacts directory except README.md
      try {
        const files = glob.sync(join(artifactsPath, '*'), { nodir: true });
        let cleanedCount = 0;
        
        for (const file of files) {
          // Keep README.md file
          if (file.endsWith('README.md')) {
            continue;
          }
          
          rmSync(file, { force: true });
          cleanedCount++;
        }
        
        if (cleanedCount > 0) {
          this.logger.success(`Cleaned ${cleanedCount} artifact file(s)`);
        } else {
          this.logger.success('Artifacts directory already clean');
        }
      } catch (error) {
        this.logger.warn(`Failed to clean artifacts directory: ${error.message}`);
      }
    }
  }

  async initialize(options = {}) {
    this.logger.essential('🚀 Initializing Test Orchestrator...');
    
    // Clean artifacts directory to ensure only up-to-date artifacts from this test run
    this.cleanArtifacts();
    
    // Load configuration
    const configPath = join(PROJECT_ROOT, 'tests', 'config', 'test.config.json');
    this.config = JSON.parse(readFileSync(configPath, 'utf8'));
    this.logger.success('Configuration loaded');
    
    // Override with command-line options if provided
    if (options.versions) {
      this.config['foundry-versions'] = options.versions;
      this.logger.config('Overriding versions from command line');
    }
    
    if (options.systems) {
      this.config['foundry-systems'] = options.systems;
      this.logger.config('Overriding systems from command line');
    }
    
    // Store selected tests from command line
    this.selectedIntegrationTest = options['integration-test'] || null;
    this.selectedRegressionTest = options['regression-test'] || null;
    this.selectedUnitTest = options['unit-test'] || null;

    if (this.selectedIntegrationTest) {
      this.logger.config(`Selected integration test from command line: ${this.selectedIntegrationTest}`);
    }
    if (this.selectedRegressionTest) {
      this.logger.config(`Selected regression test from command line: ${this.selectedRegressionTest}`);
    }
    if (this.selectedUnitTest) {
      this.logger.config(`Selected unit test from command line: ${this.selectedUnitTest}`);
    }
    
    // Set manual mode flag and optional stop-at-step
    this.manualMode = options.manual || false;
    this.manualStepName = options.manualStep || null;
    if (this.manualMode) {
      if (this.manualStepName) {
        this.logger.info(`Manual testing mode enabled (stop after step: ${this.manualStepName})`);
      } else {
        this.logger.info('Manual testing mode enabled');
      }
    }

    // If manual mode, override concurrency to run all permutations simultaneously
    if (this.manualMode && !options.listSteps) {
      const versionsCount = (this.config['foundry-versions'] || []).length || 1;
      const systemsCount = (this.config['foundry-systems'] || []).length || 1;
      const totalPermutations = versionsCount * systemsCount;
      if (this.config?.docker) {
        this.config.docker.maxConcurrentInstances = totalPermutations;
        this.logger.config(`Overriding max concurrent instances for manual mode: ${totalPermutations} (simultaneous permutations)`);
      }
    }
    
    // Initialize bootstrap infrastructure (skip for --list-steps)
    if (!options.listSteps) {
      this.bootstrap = new BootstrapRunner(this.config, DEBUG_MODE);
      await this.bootstrap.initialize();
      this.logger.success('Bootstrap infrastructure initialized');
    }
    
    // Update log file with version and system information
    try {
      const versionStr = this.config['foundry-versions'].join('-');
      const systemStr = this.config['foundry-systems'].join('-');
      const logHeader = `Test Run Started: ${new Date().toISOString()}\nVersions: ${versionStr}\nSystems: ${systemStr}\n${'='.repeat(80)}\n`;
      writeFileSync(LOG_FILE, logHeader);
    } catch (error) {
      this.logger.warn(`Failed to update log file with version/system info: ${error.message}`);
    }
    
    // Configuration details - debug mode only (too verbose for normal operation)
    this.logger.config(`Versions: ${this.config['foundry-versions'].join(', ')}`);
    this.logger.config(`Systems: ${this.config['foundry-systems'].join(', ')}`);
    this.logger.config(`Max Concurrent: ${this.config.docker.maxConcurrentInstances}`);
  }

  generatePermutations() {
    const permutations = [];
    
    for (const version of this.config['foundry-versions']) {
      for (const system of this.config['foundry-systems']) {
        permutations.push({
          id: `${version}-${system}`,
          version,
          system,
          description: `${system} on FoundryVTT ${version}`
        });
      }
    }
    
    this.logger.progress(`Generated ${permutations.length} permutations`);
    return permutations;
  }

  async discoverIntegrationTests() {
    this.logger.essential('🔍 Discovering integration tests...');
    
    // Step 1: Discover all test files
    const testPattern = join(PROJECT_ROOT, 'tests', 'integration', '**', '*.test.js');
    let testFiles = await glob(testPattern);
    this.logger.debug(`Found ${testFiles.length} test files via glob`);
    
    // Step 2: Filter by --versions flag if provided (filter by version directories)
    if (this.config['foundry-versions'] && this.config['foundry-versions'].length > 0) {
      const versionDirs = this.config['foundry-versions'];
      testFiles = testFiles.filter(file => {
        // Extract version directory from file path
        const relativePath = file.replace(join(PROJECT_ROOT, 'tests', 'integration'), '');
        const pathParts = relativePath.split('/').filter(part => part.length > 0);
        
        // Check if the first directory matches any of the specified versions
        if (pathParts.length > 0) {
          const versionDir = pathParts[0];
          const isVersionMatch = versionDirs.some(version => 
            versionDir === version || versionDir.startsWith(version)
          );
          
          if (!isVersionMatch) {
            this.logger.debug(`Filtering out test from version directory ${versionDir}: ${basename(file)}`);
          }
          
          return isVersionMatch;
        }
        
        // If no version directory structure, include the test
        return true;
      });
      this.logger.info(`Filtered to ${testFiles.length} tests based on --versions flag (${versionDirs.join(', ')})`);
    }
    
    // Step 3: Filter by specific test name if provided via -i flag
    if (this.selectedIntegrationTest) {
      testFiles = testFiles.filter(file => {
        const testName = basename(file, '.test.js');
        const fileName = basename(file);
        // Match against both test name (without extension) and full filename
        return testName === this.selectedIntegrationTest || 
               fileName === this.selectedIntegrationTest ||
               fileName === `${this.selectedIntegrationTest}.test.js`;
      });
      this.logger.info(`Filtered to ${testFiles.length} tests based on -i flag`);
      
      // Warn if the selected test was not found
      if (testFiles.length === 0) {
        this.logger.warn(`Integration test not found: ${this.selectedIntegrationTest}`);
      }
    }
    
    this.logger.info(`Discovered ${testFiles.length} integration test files`);
    return testFiles;
  }

  async discoverRegressionTests() {
    this.logger.essential('🔍 Discovering regression tests...');
    
    // Step 1: Discover all test files
    const testPattern = join(PROJECT_ROOT, 'tests', 'regression', '**', '*.test.js');
    let testFiles = await glob(testPattern);
    this.logger.debug(`Found ${testFiles.length} regression test files via glob`);
    
    // Step 2: Filter by --versions flag if provided (filter by version directories)
    if (this.config['foundry-versions'] && this.config['foundry-versions'].length > 0) {
      const versionDirs = this.config['foundry-versions'];
      testFiles = testFiles.filter(file => {
        // Extract version directory from file path
        const relativePath = file.replace(join(PROJECT_ROOT, 'tests', 'regression'), '');
        const pathParts = relativePath.split('/').filter(part => part.length > 0);
        
        // Check if the first directory matches any of the specified versions
        if (pathParts.length > 0) {
          const versionDir = pathParts[0];
          const isVersionMatch = versionDirs.some(version => 
            versionDir === version || versionDir.startsWith(version)
          );
          
          if (!isVersionMatch) {
            this.logger.debug(`Filtering out test from version directory ${versionDir}: ${basename(file)}`);
          }
          
          return isVersionMatch;
        }
        
        // If no version directory structure, include the test
        return true;
      });
      this.logger.info(`Filtered to ${testFiles.length} tests based on --versions flag (${versionDirs.join(', ')})`);
    }
    
    // Step 3: Filter by specific test name if provided via -r flag
    if (this.selectedRegressionTest) {
      testFiles = testFiles.filter(file => {
        const testName = basename(file, '.test.js');
        const fileName = basename(file);
        // Match against both test name (without extension) and full filename
        return testName === this.selectedRegressionTest || 
               fileName === this.selectedRegressionTest ||
               fileName === `${this.selectedRegressionTest}.test.js`;
      });
      this.logger.info(`Filtered to ${testFiles.length} tests based on -r flag`);
      
      // Warn if the selected test was not found
      if (testFiles.length === 0) {
        this.logger.warn(`Regression test not found: ${this.selectedRegressionTest}`);
      }
    }
    
    this.logger.info(`Discovered ${testFiles.length} regression test files`);
    return testFiles;
  }

  async discoverUnitTests() {
    this.logger.essential('🔍 Discovering unit tests...');
    
    // Step 1: Discover all test files
    const testPattern = join(PROJECT_ROOT, 'tests', 'unit', '**', '*.test.js');
    let testFiles = await glob(testPattern);
    this.logger.debug(`Found ${testFiles.length} unit test files via glob`);
    
    // Step 2: Filter by --versions flag if provided (filter by version directories)
    if (this.config['foundry-versions'] && this.config['foundry-versions'].length > 0) {
      const versionDirs = this.config['foundry-versions'];
      testFiles = testFiles.filter(file => {
        // Extract version directory from file path
        const relativePath = file.replace(join(PROJECT_ROOT, 'tests', 'unit'), '');
        const pathParts = relativePath.split('/').filter(part => part.length > 0);
        
        // Check if the first directory matches any of the specified versions
        if (pathParts.length > 0) {
          const versionDir = pathParts[0];
          const isVersionMatch = versionDirs.some(version => 
            versionDir === version || versionDir.startsWith(version)
          );
          
          if (!isVersionMatch) {
            this.logger.debug(`Filtering out test from version directory ${versionDir}: ${basename(file)}`);
          }
          
          return isVersionMatch;
        }
        
        // If no version directory structure, include the test
        return true;
      });
      this.logger.info(`Filtered to ${testFiles.length} tests based on --versions flag (${versionDirs.join(', ')})`);
    }
    
    // Step 3: Filter by specific test name if provided via -u flag
    if (this.selectedUnitTest) {
      testFiles = testFiles.filter(file => {
        const testName = basename(file, '.test.js');
        const fileName = basename(file);
        // Match against both test name (without extension) and full filename
        return testName === this.selectedUnitTest || 
               fileName === this.selectedUnitTest ||
               fileName === `${this.selectedUnitTest}.test.js`;
      });
      this.logger.info(`Filtered to ${testFiles.length} tests based on -u flag`);
      
      // Warn if the selected test was not found
      if (testFiles.length === 0) {
        this.logger.warn(`Unit test not found: ${this.selectedUnitTest}`);
      }
    }
    
    this.logger.info(`Discovered ${testFiles.length} unit test files`);
    return testFiles;
  }

  async runSingleIntegrationTest(testFile, permutations) {
    this.logger.essential(`🧪 Running integration test: ${testFile}`);
    
    // Import the test function and metadata
    let testFunction;
    let testMetadata = {};
    try {
      const testModule = await import(testFile);
      testFunction = testModule.default;
      testMetadata = testModule.testMetadata || {};
      
      if (typeof testFunction !== 'function') {
        throw new Error('Integration test must export a default function');
      }
    } catch (error) {
      this.logger.error(`Failed to load test ${testFile}: ${error.message}`);
      return [];
    }
    
    // Apply test-specific configuration overrides if available
    const testConfig = { ...this.config };
    const testName = basename(testFile, '.test.js');

    
    if (testMetadata.configuration) {
      // Merge test-specific configuration from metadata (highest priority)
      Object.assign(testConfig, testMetadata.configuration);
      this.logger.debug(`Applied test-specific configuration from metadata for ${testMetadata.name || testName}`);
    }
    
    const testResults = [];
    
    // Run test across all permutations
    for (const permutation of permutations) {
      this.logger.progress(`Testing ${permutation.description}...`);
      
      let session = null;
      try {
        // Create live FoundryVTT session
        session = await this.bootstrap.createSession(permutation);
        this.logger.success(`Session created for ${permutation.id}`);
        
        // Execute integration test
        const testResult = await testFunction(session, permutation, this.config);
        
        testResults.push({
          testFile,
          permutation,
          success: testResult.success,
          result: testResult,
          timestamp: Date.now()
        });
        
        if (testResult.success) {
          this.logger.success(`${permutation.id}: PASSED`);
        } else {
          this.logger.error(`${permutation.id}: FAILED - ${testResult.message}`);
        }
        
      } catch (error) {
        this.logger.error(`  ❌ ${permutation.id}: ERROR - ${error.message}`);
        
        testResults.push({
          testFile,
          permutation,
          success: false,
          error: error.message,
          timestamp: Date.now()
        });
        
      } finally {
        // Always cleanup session
        if (session) {
          try {
            await this.bootstrap.cleanupSession(session);
            this.logger.debug(`Session cleaned up for ${permutation.id}`);
          } catch (error) {
            this.logger.warn(`  ⚠️ Session cleanup failed for ${permutation.id}: ${error.message}`);
          }
        }
      }
    }
    
    // Cleanup Docker images per permutation to avoid image accumulation
    this.logger.essential(`🧹 Cleaning up Docker images for ${testFile} (per permutation)...`);
    for (const permutation of permutations) {
      try {
        await this.bootstrap.cleanupImages([permutation]);
        this.logger.success(`Docker image cleaned up for ${permutation.id}`);
      } catch (error) {
        this.logger.warn(`⚠️ Docker image cleanup failed for ${permutation.id}: ${error.message}`);
      }
    }
    
    return testResults;
  }

  async runSingleRegressionTest(testFile, permutations) {
    this.logger.essential(`🧪 Running regression test: ${testFile}`);
    
    // Import the test function and metadata
    let testFunction;
    let testMetadata = {};
    try {
      const testModule = await import(testFile);
      testFunction = testModule.default;
      testMetadata = testModule.testMetadata || {};
      
      if (typeof testFunction !== 'function') {
        throw new Error('Regression test must export a default function');
      }
    } catch (error) {
      this.logger.error(`Failed to load test ${testFile}: ${error.message}`);
      return [];
    }
    
    // Apply test-specific configuration overrides if available
    const testConfig = { ...this.config };
    const testName = basename(testFile, '.test.js');
    
    if (testMetadata.configuration) {
      // Merge test-specific configuration from metadata
      Object.assign(testConfig, testMetadata.configuration);
      this.logger.debug(`Applied test-specific configuration from metadata for ${testMetadata.name || testName}`);
    }
    
    const testResults = [];
    
    // Run test across all permutations
    for (const permutation of permutations) {
      this.logger.progress(`Testing ${permutation.description}...`);
      
      let session = null;
      try {
        // Create live FoundryVTT session
        session = await this.bootstrap.createSession(permutation);
        this.logger.success(`Session created for ${permutation.id}`);
        
        // Execute regression test
        const testResult = await testFunction(session, permutation, this.config);
        
        testResults.push({
          testFile,
          permutation,
          success: testResult.success,
          result: testResult,
          timestamp: Date.now()
        });
        
        if (testResult.success) {
          this.logger.success(`${permutation.id}: PASSED`);
        } else {
          this.logger.error(`${permutation.id}: FAILED - ${testResult.message}`);
        }
        
      } catch (error) {
        this.logger.error(`  ❌ ${permutation.id}: ERROR - ${error.message}`);
        
        testResults.push({
          testFile,
          permutation,
          success: false,
          error: error.message,
          timestamp: Date.now()
        });
        
      } finally {
        // Always cleanup session
        if (session) {
          try {
            await this.bootstrap.cleanupSession(session);
            this.logger.debug(`Session cleaned up for ${permutation.id}`);
          } catch (error) {
            this.logger.warn(`  ⚠️ Session cleanup failed for ${permutation.id}: ${error.message}`);
          }
        }
      }
    }
    
    // Cleanup Docker images per permutation to avoid image accumulation
    this.logger.essential(`🧹 Cleaning up Docker images for ${testFile} (per permutation)...`);
    for (const permutation of permutations) {
      try {
        await this.bootstrap.cleanupImages([permutation]);
        this.logger.success(`Docker image cleaned up for ${permutation.id}`);
      } catch (error) {
        this.logger.warn(`⚠️ Docker image cleanup failed for ${permutation.id}: ${error.message}`);
      }
    }
    
    return testResults;
  }

  async runSingleUnitTest(testFile, permutations) {
    this.logger.essential(`🧪 Running unit test: ${testFile}`);
    
    // Import the test function and metadata
    let testFunction;
    let testMetadata = {};
    try {
      const testModule = await import(testFile);
      testFunction = testModule.default;
      testMetadata = testModule.testMetadata || {};
      
      if (typeof testFunction !== 'function') {
        throw new Error('Unit test must export a default function');
      }
    } catch (error) {
      this.logger.error(`Failed to load test ${testFile}: ${error.message}`);
      return [];
    }
    
    // Apply test-specific configuration overrides if available
    const testConfig = { ...this.config };
    const testName = basename(testFile, '.test.js');
    
    if (testMetadata.configuration) {
      // Merge test-specific configuration from metadata
      Object.assign(testConfig, testMetadata.configuration);
      this.logger.debug(`Applied test-specific configuration from metadata for ${testMetadata.name || testName}`);
    }
    
    const testResults = [];
    
    // Run test across all permutations
    for (const permutation of permutations) {
      this.logger.progress(`Testing ${permutation.description}...`);
      
      let session = null;
      try {
        // Create live FoundryVTT session
        session = await this.bootstrap.createSession(permutation);
        this.logger.success(`Session created for ${permutation.id}`);
        
        // Execute unit test
        const testResult = await testFunction(session, permutation, this.config);
        
        testResults.push({
          testFile,
          permutation,
          success: testResult.success,
          result: testResult,
          timestamp: Date.now()
        });
        
        if (testResult.success) {
          this.logger.success(`${permutation.id}: PASSED`);
        } else {
          this.logger.error(`${permutation.id}: FAILED - ${testResult.message}`);
        }
        
      } catch (error) {
        this.logger.error(`  ❌ ${permutation.id}: ERROR - ${error.message}`);
        
        testResults.push({
          testFile,
          permutation,
          success: false,
          error: error.message,
          timestamp: Date.now()
        });
        
      } finally {
        // Always cleanup session
        if (session) {
          try {
            await this.bootstrap.cleanupSession(session);
            this.logger.debug(`Session cleaned up for ${permutation.id}`);
          } catch (error) {
            this.logger.warn(`  ⚠️ Session cleanup failed for ${permutation.id}: ${error.message}`);
          }
        }
      }
    }
    
    // Cleanup Docker images per permutation to avoid image accumulation
    this.logger.essential(`🧹 Cleaning up Docker images for ${testFile} (per permutation)...`);
    for (const permutation of permutations) {
      try {
        await this.bootstrap.cleanupImages([permutation]);
        this.logger.success(`Docker image cleaned up for ${permutation.id}`);
      } catch (error) {
        this.logger.warn(`⚠️ Docker image cleanup failed for ${permutation.id}: ${error.message}`);
      }
    }
    
    return testResults;
  }

  async runAllTests() {
    this.logger.essential('🎯 Running tests...');
    
    const permutations = this.generatePermutations();
    let allResults = [];
    
    // Determine which test types to run based on command line options
    const runIntegration = !this.selectedRegressionTest && !this.selectedUnitTest;
    const runRegression = !this.selectedIntegrationTest && !this.selectedUnitTest;
    const runUnit = !this.selectedIntegrationTest && !this.selectedRegressionTest;
    
    // If specific test types are selected, only run those
    if (this.selectedIntegrationTest) {
      this.logger.info('🎯 Running specific integration test...');
      const testFiles = await this.discoverIntegrationTests();
      if (testFiles.length > 0) {
        for (const testFile of testFiles) {
          const testResults = await this.runSingleIntegrationTest(testFile, permutations);
          allResults.push(...testResults);
        }
      }
    } else if (this.selectedRegressionTest) {
      this.logger.info('🎯 Running specific regression test...');
      const testFiles = await this.discoverRegressionTests();
      if (testFiles.length > 0) {
        for (const testFile of testFiles) {
          const testResults = await this.runSingleRegressionTest(testFile, permutations);
          allResults.push(...testResults);
        }
      }
    } else if (this.selectedUnitTest) {
      this.logger.info('🎯 Running specific unit test...');
      const testFiles = await this.discoverUnitTests();
      if (testFiles.length > 0) {
        for (const testFile of testFiles) {
          const testResults = await this.runSingleUnitTest(testFile, permutations);
          allResults.push(...testResults);
        }
      }
    } else {
      // Run all test types
      this.logger.info('🎯 Running all test types...');
      
      // Integration tests
      if (runIntegration) {
        this.logger.info('🧪 Running integration tests...');
        const integrationTests = await this.discoverIntegrationTests();
        for (const testFile of integrationTests) {
          const testResults = await this.runSingleIntegrationTest(testFile, permutations);
          allResults.push(...testResults);
        }
      }
      
      // Regression tests
      if (runRegression) {
        this.logger.info('🧪 Running regression tests...');
        const regressionTests = await this.discoverRegressionTests();
        for (const testFile of regressionTests) {
          const testResults = await this.runSingleRegressionTest(testFile, permutations);
          allResults.push(...testResults);
        }
      }
      
      // Unit tests
      if (runUnit) {
        this.logger.info('🧪 Running unit tests...');
        const unitTests = await this.discoverUnitTests();
        for (const testFile of unitTests) {
          const testResults = await this.runSingleUnitTest(testFile, permutations);
          allResults.push(...testResults);
        }
      }
    }
    
    this.results = allResults;
    
    try {
      // Always cleanup containers and images, even if tests failed
      await this.cleanup();
    } finally {
      this.generateReport();
    }
  }

  async runManualSession() {
    this.logger.essential('🎯 Starting manual testing mode (simultaneous)...');

    const permutations = this.generatePermutations();
    this.logger.info(`Manual mode will simultaneously run ${permutations.length} permutation(s)`);

    // Create sessions concurrently
    const createPromises = permutations.map(p =>
      this.bootstrap.createSession(p, { stopAtStep: this.manualStepName })
        .then(session => ({ ok: true, session, permutation: p }))
        .catch(error => ({ ok: false, error, permutation: p }))
    );

    const results = await Promise.allSettled(createPromises);
    const sessions = results
      .map(r => (r.status === 'fulfilled' ? r.value : r.reason))
      .filter(r => r && r.ok)
      .map(r => r.session);

    // Display info for all started sessions
    if (sessions.length > 0) {
      // Close all browser instances before showing sessions ready
      this.logger.info('🔒 Closing automation browsers to free up sessions...');
      for (const s of sessions) {
        try {
          if (s.browser) {
            await s.browser.close();
            this.logger.info(`✅ Browser closed for ${s.permutation?.id || 'session'}`);
          }
        } catch (error) {
          this.logger.warn(`⚠️ Failed to close browser for ${s.permutation?.id || 'session'}: ${error.message}`);
        }
      }
      this.logger.info('✅ All automation browsers closed');
      
      this.logger.info(' ');
      this.logger.info('🎮 FoundryVTT Sessions Ready!');
      this.logger.info('==============================');
      for (const s of sessions) {
        this.logger.info(`📍 ${s.permutation?.id || 'session'}: http://localhost:${s.port}`);
      }
      this.logger.info(' ');
      this.logger.info('🔧 Manual Testing Instructions:');
      this.logger.info('   - Open the URLs above in your browser');
      this.logger.info('   - Interact with any/all sessions');
      this.logger.info('   - Press ESC in this terminal to stop and clean up ALL sessions');
      if (this.manualStepName) {
        this.logger.info(`   ⏸️  Sessions paused after step: ${this.manualStepName}`);
      }
      this.logger.info(' ');

      await this.waitForEscKey();
    } else {
      this.logger.warn('No sessions started successfully. Nothing to hold open.');
    }

    // Cleanup all sessions
    for (const s of sessions) {
      try {
        this.logger.essential(`🧹 Cleaning up session on port ${s.port}...`);
        await this.bootstrap.cleanupSession(s);
      } catch (error) {
        this.logger.warn(`⚠️ Session cleanup failed: ${error.message}`);
      }
    }

    // Cleanup all Docker images
    this.logger.essential('🧹 Cleaning up Docker images...');
    try {
      await this.bootstrap.cleanupImages(permutations);
      this.logger.success('Docker images cleaned up');
    } catch (error) {
      this.logger.warn(`⚠️ Docker image cleanup failed: ${error.message}`);
    }

    this.logger.info(' ');
    this.logger.success('Manual testing sessions complete!');
  }

  async runManualContainer() {
    this.logger.essential('🎯 Starting manual container-only mode...');
    
    // Generate single permutation (use first version/system)
    const version = this.config['foundry-versions'][0];
    const system = this.config['foundry-systems'][0];
    const permutation = {
      id: `${version}-${system}`,
      version,
      system,
      description: `${system} on FoundryVTT ${version}`
    };
    // Image name used by our tooling
    permutation.dockerImage = `${this.config.docker.imagePrefix}-${permutation.id}`;
    
    this.logger.info(`Manual container for: ${permutation.description}`);
    
    let container = null;
    try {
      this.logger.essential('🚀 Building image and launching FoundryVTT container...');
      container = await this.bootstrap.createContainerOnly(permutation);
      
      // Display container information
      this.logger.info(' ');
      this.logger.info('📦 FoundryVTT Container Launched!');
      this.logger.info('================================');
      this.logger.info(`📍 URL: ${container.url}`);
      this.logger.info(`🔌 Port: ${container.port}`);
      this.logger.info(`🆔 Container ID: ${container.containerId}`);
      this.logger.info(`🏷️  Container Name: ${container.containerName}`);
      this.logger.info(`🖼️  Image: ${container.imageName}`);
      this.logger.info(' ');
      this.logger.info('🔧 Manual Mode Instructions:');
      this.logger.info('   - Open the URL above in your browser');
      this.logger.info('   - Inspect the container as needed');
      this.logger.info('   - Press ESC in this terminal to stop and clean up');
      this.logger.info(' ');
      
      // Wait for ESC key
      await this.waitForEscKey();
      
    } catch (error) {
      this.logger.error(`Manual container session failed: ${error.message}`);
    } finally {
      // Always cleanup container
      if (container && container.containerId) {
        try {
          this.logger.essential('🧹 Stopping and removing container...');
          await this.bootstrap.cleanupSession({ containerId: container.containerId, port: container.port });
          this.logger.success('Container cleaned up');
        } catch (error) {
          this.logger.warn(`⚠️ Container cleanup failed: ${error.message}`);
        }
      }
      
      // Cleanup Docker image
      this.logger.essential('🧹 Cleaning up Docker image...');
      try {
        await this.bootstrap.cleanupImages([permutation]);
        this.logger.success('Docker image cleaned up');
      } catch (error) {
        this.logger.warn(`⚠️ Docker image cleanup failed: ${error.message}`);
      }
    }
    
    this.logger.info(' ');
    this.logger.success('Manual container-only session complete!');
  }

  async waitForEscKey() {
    return new Promise((resolve) => {
      this.logger.essential('⌨️  Waiting for ESC key press...');
      
      // Check if stdin is a TTY (interactive terminal)
      if (process.stdin.isTTY) {
        // Set stdin to raw mode
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        
        const onKeyPress = (key) => {
          // ESC key has keycode 27 (0x1b)
          if (key === '\u001b') {
            this.logger.info(' ');
            this.logger.success('✅ ESC key detected - initiating cleanup...');
            
            // Restore stdin
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.removeListener('data', onKeyPress);
            
            resolve();
          }
        };
        
        process.stdin.on('data', onKeyPress);

        // Allow external signals (e.g., timeout sending SIGINT/SIGTERM) to trigger cleanup in TTY mode
        const onSignal = (signal) => {
          this.logger.info(`\n✅ ${signal} received - initiating cleanup...`);
          try {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.removeListener('data', onKeyPress);
          } catch {}
          resolve();
        };
        process.once('SIGINT', () => onSignal('SIGINT'));
        process.once('SIGTERM', () => onSignal('SIGTERM'));
      } else {
        // Not running in interactive mode, just wait indefinitely
        this.logger.warn('⚠️  Not running in interactive terminal mode');
        this.logger.info('📍 Session will remain active. Use Ctrl+C to exit and cleanup will run.');
        
        // Set up signal handlers for cleanup
        process.on('SIGINT', () => {
          this.logger.info('\n✅ Interrupt signal received - initiating cleanup...');
          resolve();
        });
        
        process.on('SIGTERM', () => {
          this.logger.info('\n✅ Terminate signal received - initiating cleanup...');
          resolve();
        });
      }
    });
  }

  async listSteps() {
    const versions = this.config['foundry-versions'];
    for (const v of versions) {
      const header = `Version ${v}`;
      console.log(header);
      console.log('-'.repeat(header.length));
      const steps = await BootstrapRunner.getStepList(v);
      steps.forEach((s, idx) => {
        console.log(`${idx + 1}. ${s.name} - ${s.description}`);
      });
      if (v !== versions[versions.length - 1]) console.log('');
    }
  }

  async cleanup() {
    this.logger.essential('🧹 Performing final cleanup...');
    
    try {
      // Delegate container cleanup to BootstrapRunner (unconditional)
      if (this.bootstrap) {
        await this.bootstrap.cleanup();
        this.logger.success('All containers cleaned up');
      }
    } catch (error) {
      this.logger.warn(`⚠️ Container cleanup failed: ${error.message}`);
    }
    
    try {
      // Cleanup Docker images
      if (this.bootstrap) {
        const permutations = this.generatePermutations();
        await this.bootstrap.cleanupImages(permutations);
        this.logger.success('All Docker images cleaned up');
      }
    } catch (error) {
      this.logger.warn(`⚠️ Docker image cleanup failed: ${error.message}`);
    }
  }

  generateReport() {
    const endTime = Date.now();
    const duration = endTime - this.startTime;
    
    this.logger.info(' ');
    this.logger.info('📊 Test Results Summary');
    this.logger.info('======================');
    
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    
    this.logger.info(`📋 Total Tests: ${totalTests}`);
    this.logger.success(`Passed: ${passedTests}`);
    this.logger.error(`Failed: ${failedTests}`);
    this.logger.info(`⏱️ Duration: ${(duration / 1000).toFixed(2)}s`);
    this.logger.info(`🎯 Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (failedTests > 0) {
      this.logger.error(' ');
      this.logger.error('❌ Failed Tests:');
      this.results
        .filter(r => !r.success)
        .forEach(result => {
          this.logger.error(`   - ${result.testFile} (${result.permutation.id}): ${result.error || result.result?.message || 'Unknown error'}`);
        });
    }
    
    this.logger.info(' ');
    this.logger.success(`Integration testing complete!`);
    
    // Exit with appropriate code
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

// Parse command line arguments
function normalizeVersionToken(token) {
  const t = String(token).trim();
  if (t.startsWith('v')) return t;
  // accept bare major like 12 or 13 and prefix with 'v'
  return `v${t}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    help: false,
    manual: false,
    manualStep: null,
    versions: null,
    systems: null,
    tests: null,
    listSteps: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--manual' || arg === '-m') {
      options.manual = true;
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        options.manualStep = nextArg.trim();
        i++;
      }
    } else if (arg.startsWith('--manual=')) {
      options.manual = true;
      options.manualStep = arg.split('=')[1].trim();
    } else if (arg === '--list-steps' || arg === '-l') {
      options.listSteps = true;
    } else if (arg === '--versions' || arg === '-v') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        options.versions = nextArg.split(',').map(v => normalizeVersionToken(v));
        i++; // Skip next argument as it's the value
      }
    } else if (arg.startsWith('--versions=')) {
      options.versions = arg.split('=')[1].split(',').map(v => normalizeVersionToken(v));
    } else if (arg === '--systems' || arg === '-s') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        options.systems = nextArg.split(',').map(s => s.trim());
        i++; // Skip next argument as it's the value
      }
    } else if (arg.startsWith('--systems=')) {
      options.systems = arg.split('=')[1].split(',').map(s => s.trim());
    } else if (arg === '--integration-test' || arg === '-i') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        options['integration-test'] = nextArg.trim();
        i++; // Skip next argument as it's the value
      }
    } else if (arg.startsWith('--integration-test=')) {
      options['integration-test'] = arg.split('=')[1].trim();
    } else if (arg === '--regression-test' || arg === '-r') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        options['regression-test'] = nextArg.trim();
        i++; // Skip next argument as it's the value
      }
    } else if (arg.startsWith('--regression-test=')) {
      options['regression-test'] = arg.split('=')[1].trim();
    } else if (arg === '--unit-test' || arg === '-u') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        options['unit-test'] = nextArg.trim();
        i++; // Skip next argument as it's the value
      }
    } else if (arg.startsWith('--unit-test=')) {
      options['unit-test'] = arg.split('=')[1].trim();
    }
  }
  
  return options;
}

// Display help message
function showHelp() {
  console.log(`[Test Runner] 
FoundryVTT Integration Test Runner

Usage: node run-tests.js [options]

Options:
  --help, -h              Show this help message
  --debug                 Enable verbose debug output (same as DEBUG=true)
  --manual, -m [step]     Manual mode; simultaneously launch one instance per permutation (versions x systems); optionally stop after named step, then wait for ESC
  --list-steps, -l        List available bootstrap steps for selected version
  --versions, -v <list>   Override FoundryVTT versions (comma-separated)
  --systems, -s <list>    Override game systems (comma-separated)
  --integration-test, -i <name>  Run a specific integration test by name
  --regression-test, -r <name>  Run a specific regression test by name
  --unit-test, -u <name>  Run a specific unit test by name
  
Description:
  This orchestrator runs integration tests against live FoundryVTT sessions.
  It creates Docker containers, bootstraps FoundryVTT instances, executes tests,
  and manages cleanup automatically.
  
Debug Mode:
  Use --debug flag or set DEBUG=true environment variable to enable verbose output.
  Default mode shows only essential information, warnings, and errors.
  Debug mode shows all console output including configuration details and progress.
  
Configuration:
  Tests are configured via tests/config/test.config.json
  Command-line flags override configuration file settings.
  
Examples:
  node run-tests.js                              # Use config defaults
  node run-tests.js --debug                      # Enable verbose debug output
  node run-tests.js --manual                     # Manual testing mode (full bootstrap)
  node run-tests.js --manual license-submission  # Manual mode, stop after step
  node run-tests.js --list-steps                 # Show step names and descriptions
  node run-tests.js --versions v12,v13           # Test multiple versions
  node run-tests.js --systems dnd5e,pf2e,swade  # Test multiple systems
  node run-tests.js -v v13 -s dnd5e              # Test specific combination
  node run-tests.js -m -v v13 -s dnd5e           # Manual mode with specific version/system
  node run-tests.js --integration-test simulacrum-init      # Run specific integration test
  node run-tests.js -i test1,test2               # Run multiple specific integration tests
  DEBUG=true node run-tests.js                   # Environment variable debug mode
`);
}

// Main execution
async function main() {
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  // Quiet, focused fast-path for --list-steps: avoid any orchestrator/bootstrap logging
  if (options.listSteps) {
    try {
      const configPath = join(PROJECT_ROOT, 'tests', 'config', 'test.config.json');
      const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
      if (options.versions) cfg['foundry-versions'] = options.versions;
      if (options.systems) cfg['foundry-systems'] = options.systems;
      const versions = cfg['foundry-versions'] || [];
      for (const v of versions) {
        const header = `Version ${v}`;
        console.log(header);
        console.log('-'.repeat(header.length));
        const steps = await BootstrapRunner.getStepList(v);
        steps.forEach((s, idx) => {
          console.log(`${idx + 1}. ${s.name} - ${s.description}`);
        });
        if (v !== versions[versions.length - 1]) console.log('');
      }
      process.exit(0);
    } catch (error) {
      console.error('[Test Runner] ❌ Failed to list steps:', error.message);
      process.exit(1);
    }
  }
  
  // Show debug mode status
  if (DEBUG_MODE) {
    console.log('[Test Runner] [Debug] 🐛 DEBUG MODE ENABLED - Verbose output enabled');
  }
  
  const orchestrator = new TestOrchestrator();
  
  try {
    await orchestrator.initialize(options);
    
    // Route to appropriate execution mode
    if (options.listSteps) {
      await orchestrator.listSteps();
    } else if (orchestrator.manualMode) {
      await orchestrator.runManualSession();
    } else {
      await orchestrator.runAllTests();
    }
  } catch (error) {
    console.error('[Test Runner] ❌ Test orchestration failed:', error.message);
    if (DEBUG_MODE) {
      console.error('[Test Runner] [Debug] Stack trace:', error.stack);
    }
    
    // Try to cleanup even on initialization failure
    try {
      if (orchestrator.bootstrap) {
        await orchestrator.cleanup();
      }
    } catch (cleanupError) {
      console.warn(`[Test Runner] ⚠️ Emergency cleanup failed: ${cleanupError.message}`);
    }
    
    process.exit(1);
  }
}

// Handle command line execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

export { TestOrchestrator };