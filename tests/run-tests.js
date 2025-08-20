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
import { join } from 'path';
import { glob } from 'glob';
import { BootstrapRunner } from './helpers/bootstrap/bootstrap-runner.js';

class TestOrchestrator {
  constructor() {
    this.config = null;
    this.bootstrap = null;
    this.results = [];
    this.startTime = Date.now();
  }

  cleanArtifacts() {
    const artifactsPath = join(process.cwd(), 'tests', 'artifacts');
    
    if (existsSync(artifactsPath)) {
      console.log('🧹 Cleaning artifacts directory...');
      
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
          console.log(`✅ Cleaned ${cleanedCount} artifact file(s)`);
        } else {
          console.log('✅ Artifacts directory already clean');
        }
      } catch (error) {
        console.warn(`⚠️ Failed to clean artifacts directory: ${error.message}`);
      }
    }
  }

  async initialize() {
    console.log('🚀 Initializing Test Orchestrator...');
    
    // Clean artifacts directory to ensure only up-to-date artifacts from this test run
    this.cleanArtifacts();
    
    // Load configuration
    this.config = JSON.parse(readFileSync('tests/config/test.config.json', 'utf8'));
    console.log('✅ Configuration loaded');
    
    // Initialize bootstrap infrastructure
    this.bootstrap = new BootstrapRunner(this.config);
    await this.bootstrap.initialize();
    console.log('✅ Bootstrap infrastructure initialized');
    
    console.log(`📊 Versions: ${this.config['foundry-versions'].join(', ')}`);
    console.log(`📊 Systems: ${this.config['foundry-systems'].join(', ')}`);
    console.log(`🔄 Max Concurrent: ${this.config.docker.maxConcurrentInstances}`);
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
    
    console.log(`🔄 Generated ${permutations.length} permutations`);
    return permutations;
  }

  async discoverIntegrationTests() {
    console.log('🔍 Discovering integration tests...');
    
    // If tests are specified in config, use those
    if (this.config['integration-tests'] && this.config['integration-tests'].length > 0) {
      console.log(`📋 Using configured tests: ${this.config['integration-tests'].length} tests`);
      return this.config['integration-tests'].map(test => `tests/integration/${test}`);
    }
    
    // Otherwise discover all test files
    const testFiles = await glob('tests/integration/**/*.test.js');
    console.log(`📋 Discovered ${testFiles.length} test files`);
    
    return testFiles;
  }

  async runSingleIntegrationTest(testFile, permutations) {
    console.log(`🧪 Running integration test: ${testFile}`);
    
    // Import the test function
    let testFunction;
    try {
      const testModule = await import(join(process.cwd(), testFile));
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
      console.log(`  🎯 Testing ${permutation.description}...`);
      
      let session = null;
      try {
        // Create live FoundryVTT session
        session = await this.bootstrap.createSession(permutation);
        console.log(`  ✅ Session created for ${permutation.id}`);
        
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
          console.log(`  ✅ ${permutation.id}: PASSED`);
        } else {
          console.log(`  ❌ ${permutation.id}: FAILED - ${testResult.message}`);
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
            console.log(`  🧹 Session cleaned up for ${permutation.id}`);
          } catch (error) {
            console.warn(`  ⚠️ Session cleanup failed for ${permutation.id}: ${error.message}`);
          }
        }
      }
    }
    
    // Cleanup Docker images after all permutations for this test
    console.log(`🧹 Cleaning up Docker images for ${testFile}...`);
    try {
      await this.bootstrap.cleanupImages(permutations);
      console.log(`✅ Docker images cleaned up for ${testFile}`);
    } catch (error) {
      console.warn(`⚠️ Docker image cleanup failed: ${error.message}`);
    }
    
    return testResults;
  }

  async runAllTests() {
    console.log('🎯 Running all integration tests...');
    
    const permutations = this.generatePermutations();
    const testFiles = await this.discoverIntegrationTests();
    
    if (testFiles.length === 0) {
      console.log('⚠️ No integration tests found');
      return;
    }
    
    // Run each test file across all permutations
    for (const testFile of testFiles) {
      const testResults = await this.runSingleIntegrationTest(testFile, permutations);
      this.results.push(...testResults);
    }
    
    this.generateReport();
  }

  generateReport() {
    const endTime = Date.now();
    const duration = endTime - this.startTime;
    
    console.log('');
    console.log('📊 Test Results Summary');
    console.log('======================');
    
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    
    console.log(`📋 Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`⏱️ Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`🎯 Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (failedTests > 0) {
      console.log('');
      console.log('❌ Failed Tests:');
      this.results
        .filter(r => !r.success)
        .forEach(result => {
          console.log(`  - ${result.testFile} (${result.permutation.id}): ${result.error || result.result?.message || 'Unknown error'}`);
        });
    }
    
    console.log('');
    console.log(`🎉 Integration testing complete!`);
    
    // Exit with appropriate code
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

// Main execution
async function main() {
  const orchestrator = new TestOrchestrator();
  
  try {
    await orchestrator.initialize();
    await orchestrator.runAllTests();
  } catch (error) {
    console.error('❌ Test orchestration failed:', error.message);
    console.error(error.stack);
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