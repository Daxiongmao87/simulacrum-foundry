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
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';
import { BootstrapRunner } from './helpers/bootstrap/bootstrap-runner.js';

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

class TestOrchestrator {
  constructor() {
    this.config = null;
    this.bootstrap = null;
    this.results = [];
    this.startTime = Date.now();
    this.manualMode = false;
  }

  cleanArtifacts() {
    const artifactsPath = join(PROJECT_ROOT, 'tests', 'artifacts');
    
    if (existsSync(artifactsPath)) {
      console.log('[Test Runner] 🧹 Cleaning artifacts directory...');
      
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
          console.log(`[Test Runner] ✅ Cleaned ${cleanedCount} artifact file(s)`);
        } else {
          console.log('[Test Runner] ✅ Artifacts directory already clean');
        }
      } catch (error) {
        console.warn(`⚠️ Failed to clean artifacts directory: ${error.message}`);
      }
    }
  }

  async initialize(options = {}) {
    console.log('[Test Runner] 🚀 Initializing Test Orchestrator...');
    
    // Clean artifacts directory to ensure only up-to-date artifacts from this test run
    this.cleanArtifacts();
    
    // Load configuration
    const configPath = join(PROJECT_ROOT, 'tests', 'config', 'test.config.json');
    this.config = JSON.parse(readFileSync(configPath, 'utf8'));
    console.log('[Test Runner] ✅ Configuration loaded');
    
    // Override with command-line options if provided
    if (options.versions) {
      this.config['foundry-versions'] = options.versions;
      console.log('[Test Runner] 🔧 Overriding versions from command line');
    }
    
    if (options.systems) {
      this.config['foundry-systems'] = options.systems;
      console.log('[Test Runner] 🔧 Overriding systems from command line');
    }
    
    // Set manual mode flag
    this.manualMode = options.manual || false;
    if (this.manualMode) {
      console.log('[Test Runner] 🔧 Manual testing mode enabled');
    }
    
    // Initialize bootstrap infrastructure
    this.bootstrap = new BootstrapRunner(this.config);
    await this.bootstrap.initialize();
    console.log('[Test Runner] ✅ Bootstrap infrastructure initialized');
    
    console.log(`[Test Runner] 📊 Versions: ${this.config['foundry-versions'].join(', ')}`);
    console.log(`[Test Runner] 📊 Systems: ${this.config['foundry-systems'].join(', ')}`);
    console.log(`[Test Runner] 🔄 Max Concurrent: ${this.config.docker.maxConcurrentInstances}`);
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
    
    console.log(`[Test Runner] 🔄 Generated ${permutations.length} permutations`);
    return permutations;
  }

  async discoverIntegrationTests() {
    console.log('[Test Runner] 🔍 Discovering integration tests...');
    
    // If tests are specified in config, use those
    if (this.config['integration-tests'] && this.config['integration-tests'].length > 0) {
      console.log(`[Test Runner] 📋 Using configured tests: ${this.config['integration-tests'].length} tests`);
      return this.config['integration-tests'].map(test => join(PROJECT_ROOT, 'tests', 'integration', test));
    }
    
    // Otherwise discover all test files
    const testPattern = join(PROJECT_ROOT, 'tests', 'integration', '**', '*.test.js');
    const testFiles = await glob(testPattern);
    console.log(`[Test Runner] 📋 Discovered ${testFiles.length} test files`);
    
    return testFiles;
  }

  async runSingleIntegrationTest(testFile, permutations) {
    console.log(`[Test Runner] 🧪 Running integration test: ${testFile}`);
    
    // Import the test function
    let testFunction;
    try {
      const testModule = await import(testFile);
      testFunction = testModule.default;
      
      if (typeof testFunction !== 'function') {
        throw new Error('Integration test must export a default function');
      }
    } catch (error) {
      console.error(`❌ Failed to load test ${testFile}: ${error.message}`);
      return [];
    }
    
    const testResults = [];
    
    // Run test across all permutations
    for (const permutation of permutations) {
      console.log(`[Test Runner]   🎯 Testing ${permutation.description}...`);
      
      let session = null;
      try {
        // Create live FoundryVTT session
        session = await this.bootstrap.createSession(permutation);
        console.log(`[Test Runner]   ✅ Session created for ${permutation.id}`);
        
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
          console.log(`[Test Runner]   ✅ ${permutation.id}: PASSED`);
        } else {
          console.log(`[Test Runner]   ❌ ${permutation.id}: FAILED - ${testResult.message}`);
        }
        
      } catch (error) {
        console.error(`  ❌ ${permutation.id}: ERROR - ${error.message}`);
        
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
            console.log(`[Test Runner]   🧹 Session cleaned up for ${permutation.id}`);
          } catch (error) {
            console.warn(`  ⚠️ Session cleanup failed for ${permutation.id}: ${error.message}`);
          }
        }
      }
    }
    
    // Cleanup Docker images after all permutations for this test
    console.log(`[Test Runner] 🧹 Cleaning up Docker images for ${testFile}...`);
    try {
      await this.bootstrap.cleanupImages(permutations);
      console.log(`[Test Runner] ✅ Docker images cleaned up for ${testFile}`);
    } catch (error) {
      console.warn(`⚠️ Docker image cleanup failed: ${error.message}`);
    }
    
    return testResults;
  }

  async runAllTests() {
    console.log('[Test Runner] 🎯 Running all integration tests...');
    
    const permutations = this.generatePermutations();
    const testFiles = await this.discoverIntegrationTests();
    
    if (testFiles.length === 0) {
      console.log('[Test Runner] ⚠️ No integration tests found');
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
    console.log('[Test Runner] 🎯 Starting manual testing mode...');
    
    // Generate single permutation (use first version/system)
    const version = this.config['foundry-versions'][0];
    const system = this.config['foundry-systems'][0];
    const permutation = {
      id: `${version}-${system}`,
      version,
      system,
      description: `${system} on FoundryVTT ${version}`
    };
    
    console.log(`[Test Runner] 📊 Manual testing with: ${permutation.description}`);
    
    let session = null;
    try {
      // Create live FoundryVTT session
      console.log('[Test Runner] 🚀 Creating FoundryVTT session...');
      session = await this.bootstrap.createSession(permutation);
      console.log('[Test Runner] ✅ Session created successfully!');
      
      // Display session information
      console.log('[Test Runner] ');
      console.log('[Test Runner] 🎮 FoundryVTT Session Ready!');
      console.log('[Test Runner] =============================');
      console.log(`[Test Runner] 📍 URL: http://localhost:${session.port}`);
      console.log('[Test Runner] 👤 Username: Gamemaster');
      console.log('[Test Runner] 🔑 Password: admin');
      console.log('[Test Runner] 🌍 World: SimulacrumTestWorld');
      console.log('[Test Runner] ');
      console.log('[Test Runner] 🔧 Manual Testing Instructions:');
      console.log('[Test Runner]   1. Open the URL above in your browser');
      console.log('[Test Runner]   2. Login with the provided credentials');
      console.log('[Test Runner]   3. Test the Simulacrum module manually');
      console.log('[Test Runner]   4. Press ESC in this terminal to exit and cleanup');
      console.log('[Test Runner] ');
      
      // Wait for ESC key
      await this.waitForEscKey();
      
    } catch (error) {
      console.error(`❌ Manual session failed: ${error.message}`);
      
    } finally {
      // Always cleanup session
      if (session) {
        try {
          console.log('[Test Runner] 🧹 Cleaning up session...');
          await this.bootstrap.cleanupSession(session);
          console.log('[Test Runner] ✅ Session cleaned up');
        } catch (error) {
          console.warn(`⚠️ Session cleanup failed: ${error.message}`);
        }
      }
      
      // Cleanup Docker images
      console.log('[Test Runner] 🧹 Cleaning up Docker images...');
      try {
        await this.bootstrap.cleanupImages([permutation]);
        console.log('[Test Runner] ✅ Docker images cleaned up');
      } catch (error) {
        console.warn(`⚠️ Docker image cleanup failed: ${error.message}`);
      }
    }
    
    console.log('[Test Runner] ');
    console.log('[Test Runner] 🎉 Manual testing session complete!');
  }

  async waitForEscKey() {
    return new Promise((resolve) => {
      console.log('[Test Runner] ⌨️  Waiting for ESC key press...');
      
      // Check if stdin is a TTY (interactive terminal)
      if (process.stdin.isTTY) {
        // Set stdin to raw mode
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        
        const onKeyPress = (key) => {
          // ESC key has keycode 27 (0x1b)
          if (key === '\u001b') {
            console.log('[Test Runner] ');
            console.log('[Test Runner] ✅ ESC key detected - initiating cleanup...');
            
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
        console.log('[Test Runner] ⚠️  Not running in interactive terminal mode');
        console.log('[Test Runner] 📍 Session will remain active. Use Ctrl+C to exit and cleanup will run.');
        
        // Set up signal handlers for cleanup
        process.on('SIGINT', () => {
          console.log('[Test Runner] \n✅ Interrupt signal received - initiating cleanup...');
          resolve();
        });
        
        process.on('SIGTERM', () => {
          console.log('[Test Runner] \n✅ Terminate signal received - initiating cleanup...');
          resolve();
        });
      }
    });
  }

  async cleanup() {
    console.log('[Test Runner] 🧹 Performing final cleanup...');
    
    try {
      // Cleanup any remaining containers
      if (this.bootstrap && this.bootstrap.containerManager) {
        await this.bootstrap.containerManager.cleanupAllContainers();
        console.log('[Test Runner] ✅ All containers cleaned up');
      }
    } catch (error) {
      console.warn(`⚠️ Container cleanup failed: ${error.message}`);
    }
    
    try {
      // Cleanup Docker images
      if (this.bootstrap) {
        const permutations = this.generatePermutations();
        await this.bootstrap.cleanupImages(permutations);
        console.log('[Test Runner] ✅ All Docker images cleaned up');
      }
    } catch (error) {
      console.warn(`⚠️ Docker image cleanup failed: ${error.message}`);
    }
  }

  generateReport() {
    const endTime = Date.now();
    const duration = endTime - this.startTime;
    
    console.log('[Test Runner] ');
    console.log('[Test Runner] 📊 Test Results Summary');
    console.log('[Test Runner] ======================');
    
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    
    console.log(`[Test Runner] 📋 Total Tests: ${totalTests}`);
    console.log(`[Test Runner] ✅ Passed: ${passedTests}`);
    console.log(`[Test Runner] ❌ Failed: ${failedTests}`);
    console.log(`[Test Runner] ⏱️ Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`[Test Runner] 🎯 Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (failedTests > 0) {
      console.log('[Test Runner] ');
      console.log('[Test Runner] ❌ Failed Tests:');
      this.results
        .filter(r => !r.success)
        .forEach(result => {
          console.log(`[Test Runner]   - ${result.testFile} (${result.permutation.id}): ${result.error || result.result?.message || 'Unknown error'}`);
        });
    }
    
    console.log('[Test Runner] ');
    console.log(`[Test Runner] 🎉 Integration testing complete!`);
    
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
    versions: null,
    systems: null
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--manual' || arg === '-m') {
      options.manual = true;
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
  --manual, -m            Manual testing mode - bootstrap instance and wait for ESC to exit
  --versions, -v <list>   Override FoundryVTT versions (comma-separated)
  --systems, -s <list>    Override game systems (comma-separated)
  
Description:
  This orchestrator runs integration tests against live FoundryVTT sessions.
  It creates Docker containers, bootstraps FoundryVTT instances, executes tests,
  and manages cleanup automatically.
  
Configuration:
  Tests are configured via tests/config/test.config.json
  Command-line flags override configuration file settings.
  
Examples:
  node run-tests.js                              # Use config defaults
  node run-tests.js --manual                     # Manual testing mode
  node run-tests.js --versions v12,v13           # Test multiple versions
  node run-tests.js --systems dnd5e,pf2e,swade  # Test multiple systems
  node run-tests.js -v v13 -s dnd5e              # Test specific combination
  node run-tests.js -m -v v13 -s dnd5e           # Manual mode with specific version/system
`);
}

// Main execution
async function main() {
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  const orchestrator = new TestOrchestrator();
  
  try {
    await orchestrator.initialize(options);
    
    // Route to appropriate execution mode
    if (orchestrator.manualMode) {
      await orchestrator.runManualSession();
    } else {
      await orchestrator.runAllTests();
    }
  } catch (error) {
    console.error('❌ Test orchestration failed:', error.message);
    console.error(error.stack);
    
    // Try to cleanup even on initialization failure
    try {
      if (orchestrator.bootstrap) {
        await orchestrator.cleanup();
      }
    } catch (cleanupError) {
      console.warn(`⚠️ Emergency cleanup failed: ${cleanupError.message}`);
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