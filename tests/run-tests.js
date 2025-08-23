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

import { readFileSync, existsSync, rmSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';
import { BootstrapRunner } from './bootstrap/bootstrap-runner.js';

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
    this.manualContainerMode = false;
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
    this.selectedTests = options.tests || null;
    if (this.selectedTests) {
      this.logger.config(`Selected tests from command line: ${this.selectedTests.join(', ')}`);
    }
    
    // Set manual mode flag
    this.manualMode = options.manual || false;
    if (this.manualMode) {
      this.logger.info('Manual testing mode enabled');
    }
    // Set manual container-only mode flag
    this.manualContainerMode = options.containerOnly || false;
    if (this.manualContainerMode) {
      this.logger.info('Manual container-only mode enabled');
    }
    
    // Initialize bootstrap infrastructure
    this.bootstrap = new BootstrapRunner(this.config, DEBUG_MODE);
    await this.bootstrap.initialize();
    this.logger.success('Bootstrap infrastructure initialized');
    
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
    
    // Step 3: Filter by --tests flag if provided (highest priority)
    if (this.selectedTests && this.selectedTests.length > 0) {
      testFiles = testFiles.filter(file => {
        const testName = basename(file, '.test.js');
        const fileName = basename(file);
        // Match against both test name (without extension) and full filename
        return this.selectedTests.some(selected => 
          testName === selected || 
          fileName === selected ||
          fileName === `${selected}.test.js`
        );
      });
      this.logger.info(`Filtered to ${testFiles.length} tests based on --tests flag`);
      
      // Warn if any selected tests were not found
      const foundTestNames = testFiles.map(f => basename(f, '.test.js'));
      const notFound = this.selectedTests.filter(selected => 
        !foundTestNames.includes(selected) && 
        !foundTestNames.includes(selected.replace('.test.js', ''))
      );
      if (notFound.length > 0) {
        this.logger.warn(`Tests not found: ${notFound.join(', ')}`);
      }
    }
    // Step 4: Filter by configuration if no --tests flag and config exists
    else if (this.config['integration-tests'] && this.config['integration-tests'].length > 0) {
      const configuredTests = this.config['integration-tests'].map(test => 
        join(PROJECT_ROOT, 'tests', 'integration', test)
      );
      testFiles = testFiles.filter(file => configuredTests.includes(file));
      this.logger.info(`Filtered to ${testFiles.length} tests based on configuration`);
    }
    // Step 5: Otherwise filter by enabled status in test metadata and config
    else {
      const enabledTests = [];
      const testConfigs = this.config['test-configurations'] || {};
      
      for (const testFile of testFiles) {
        const testName = basename(testFile, '.test.js');
        let isEnabled = true;
        
        try {
          // Check test configuration in test.config.json first
          if (testConfigs[testName] && typeof testConfigs[testName].enabled === 'boolean') {
            isEnabled = testConfigs[testName].enabled;
            this.logger.debug(`Test ${testName} enabled status from config: ${isEnabled}`);
          } else {
            // Import and check test metadata
            const testModule = await import(testFile);
            const metadata = testModule.testMetadata || {};
            
            // Default to enabled if metadata doesn't exist or enabled is not specified
            isEnabled = metadata.enabled !== false;
            this.logger.debug(`Test ${testName} enabled status from metadata: ${isEnabled}`);
          }
          
          if (isEnabled) {
            enabledTests.push(testFile);
            this.logger.debug(`Test enabled: ${basename(testFile)}`);
          } else {
            this.logger.debug(`Test disabled: ${basename(testFile)}`);
          }
        } catch (error) {
          // If we can't load metadata, include the test by default
          this.logger.debug(`Could not load metadata for ${basename(testFile)}, including by default`);
          enabledTests.push(testFile);
        }
      }
      testFiles = enabledTests;
      this.logger.info(`Discovered ${testFiles.length} enabled test files`);
    }
    
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
    const testConfigFromFile = this.config['test-configurations']?.[testName];
    
    // Priority: testMetadata.configuration > test-configurations > global config
    if (testConfigFromFile?.overrides) {
      // Apply overrides from test.config.json
      if (testConfigFromFile.overrides['foundry-versions']) {
        testConfig['foundry-versions'] = testConfigFromFile.overrides['foundry-versions'];
        this.logger.debug(`Applied version override from test config for ${testName}`);
      }
      if (testConfigFromFile.overrides['foundry-systems']) {
        testConfig['foundry-systems'] = testConfigFromFile.overrides['foundry-systems'];
        this.logger.debug(`Applied system override from test config for ${testName}`);
      }
    }
    
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
    
    // Cleanup Docker images after all permutations for this test
    this.logger.essential(`🧹 Cleaning up Docker images for ${testFile}...`);
    try {
      await this.bootstrap.cleanupImages(permutations);
      this.logger.success(`Docker images cleaned up for ${testFile}`);
    } catch (error) {
      this.logger.warn(`⚠️ Docker image cleanup failed: ${error.message}`);
    }
    
    return testResults;
  }

  async runAllTests() {
    this.logger.essential('🎯 Running all integration tests...');
    
    const permutations = this.generatePermutations();
    const testFiles = await this.discoverIntegrationTests();
    
    if (testFiles.length === 0) {
      this.logger.warn('No integration tests found');
      return;
    }
    
    try {
      // Run each test file across all permutations
      for (const testFile of testFiles) {
        const testResults = await this.runSingleIntegrationTest(testFile, permutations);
        this.results.push(...testResults);
      }
    } finally {
      // Always cleanup containers and images, even if tests failed
      await this.cleanup();
    }
    
    this.generateReport();
  }

  async runManualSession() {
    this.logger.essential('🎯 Starting manual testing mode...');
    
    // Generate single permutation (use first version/system)
    const version = this.config['foundry-versions'][0];
    const system = this.config['foundry-systems'][0];
    const permutation = {
      id: `${version}-${system}`,
      version,
      system,
      description: `${system} on FoundryVTT ${version}`
    };
    
    this.logger.info(`Manual testing with: ${permutation.description}`);
    
    let session = null;
    try {
      // Create live FoundryVTT session
      this.logger.essential('🚀 Creating FoundryVTT session...');
      session = await this.bootstrap.createSession(permutation);
      this.logger.success('Session created successfully!');
      
      // Display session information
      this.logger.info(' ');
      this.logger.info('🎮 FoundryVTT Session Ready!');
      this.logger.info('=============================');
      this.logger.info(`📍 URL: http://localhost:${session.port}`);
      this.logger.info('👤 Username: Gamemaster');
      this.logger.info('🔑 Password: admin');
      this.logger.info('🌍 World: SimulacrumTestWorld');
      this.logger.info(' ');
      this.logger.info('🔧 Manual Testing Instructions:');
      this.logger.info('   1. Open the URL above in your browser');
      this.logger.info('   2. Login with the provided credentials');
      this.logger.info('   3. Test the Simulacrum module manually');
      this.logger.info('   4. Press ESC in this terminal to exit and cleanup');
      this.logger.info(' ');
      
      // Wait for ESC key
      await this.waitForEscKey();
      
    } catch (error) {
      this.logger.error(`Manual session failed: ${error.message}`);
      
    } finally {
      // Always cleanup session
      if (session) {
        try {
          this.logger.essential('🧹 Cleaning up session...');
          await this.bootstrap.cleanupSession(session);
          this.logger.success('Session cleaned up');
        } catch (error) {
          this.logger.warn(`⚠️ Session cleanup failed: ${error.message}`);
        }
      }
      
      // Cleanup Docker images
      this.logger.essential('🧹 Cleaning up Docker images...');
      try {
        await this.bootstrap.cleanupImages([permutation]);
        this.logger.success('Docker images cleaned up');
      } catch (error) {
        this.logger.warn(`⚠️ Docker image cleanup failed: ${error.message}`);
      }
    }
    
    this.logger.info(' ');
    this.logger.success('Manual testing session complete!');
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

  async cleanup() {
    this.logger.essential('🧹 Performing final cleanup...');
    
    try {
      // Cleanup any remaining containers
      if (this.bootstrap && this.bootstrap.containerManager) {
        await this.bootstrap.containerManager.cleanupAllContainers();
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
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    help: false,
    manual: false,
    containerOnly: false,
    versions: null,
    systems: null,
    tests: null
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--manual' || arg === '-m') {
      options.manual = true;
    } else if (arg === '--container-only' || arg === '-c') {
      options.containerOnly = true;
    } else if (arg === '--versions' || arg === '-v') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        options.versions = nextArg.split(',').map(v => v.trim());
        i++; // Skip next argument as it's the value
      }
    } else if (arg.startsWith('--versions=')) {
      options.versions = arg.split('=')[1].split(',').map(v => v.trim());
    } else if (arg === '--systems' || arg === '-s') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        options.systems = nextArg.split(',').map(s => s.trim());
        i++; // Skip next argument as it's the value
      }
    } else if (arg.startsWith('--systems=')) {
      options.systems = arg.split('=')[1].split(',').map(s => s.trim());
    } else if (arg === '--tests' || arg === '-t') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        options.tests = nextArg.split(',').map(t => t.trim());
        i++; // Skip next argument as it's the value
      }
    } else if (arg.startsWith('--tests=')) {
      options.tests = arg.split('=')[1].split(',').map(t => t.trim());
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
  --manual, -m            Manual testing mode - bootstrap instance and wait for ESC to exit
  --container-only, -c     Manual container-only mode - build/run container, show info, ESC to cleanup
  --versions, -v <list>   Override FoundryVTT versions (comma-separated)
  --systems, -s <list>    Override game systems (comma-separated)
  --tests, -t <list>      Run specific tests only (comma-separated test names)
  
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
  node run-tests.js --manual                     # Manual testing mode
  node run-tests.js --container-only             # Manual container-only mode
  node run-tests.js --versions v12,v13           # Test multiple versions
  node run-tests.js --systems dnd5e,pf2e,swade  # Test multiple systems
  node run-tests.js -v v13 -s dnd5e              # Test specific combination
  node run-tests.js -m -v v13 -s dnd5e           # Manual mode with specific version/system
  node run-tests.js -c -v v13 -s dnd5e           # Manual container-only with specific version/system
  node run-tests.js --tests simulacrum-init      # Run specific test
  node run-tests.js -t test1,test2               # Run multiple specific tests
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
  
  // Show debug mode status
  if (DEBUG_MODE) {
    console.log('[Test Runner] [Debug] 🐛 DEBUG MODE ENABLED - Verbose output enabled');
  }
  
  const orchestrator = new TestOrchestrator();
  
  try {
    await orchestrator.initialize(options);
    
    // Route to appropriate execution mode
    if (orchestrator.manualContainerMode) {
      await orchestrator.runManualContainer();
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