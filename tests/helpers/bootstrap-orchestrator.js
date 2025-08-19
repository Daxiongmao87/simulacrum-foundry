/**
 * @file tests/helpers/bootstrap-orchestrator.js
 * @description Main orchestrator for FoundryVTT integration testing infrastructure
 * 
 * This orchestrator coordinates the complete testing workflow:
 * - Generates system/version permutations from test.config.json
 * - Manages concurrent Docker container execution
 * - Handles the complete Foundry bootstrap process
 * - Orchestrates integration test execution
 */

import { ContainerManager } from './container-manager.js';
// import { ConcurrentDockerTestRunner } from './concurrent-docker-test-runner.js'; // TODO: Restore missing file
import { PortManager } from './port-manager.js';
import { readFileSync } from 'fs';
import path from 'path';

export class BootstrapOrchestrator {
  constructor(configPath = 'tests/config/test.config.json') {
    this.config = JSON.parse(readFileSync(configPath, 'utf8'));
    this.portManager = new PortManager(this.config);
    this.containerManager = new ContainerManager(this.config, this.portManager);
    // this.testRunner = new ConcurrentDockerTestRunner(this.config); // TODO: Restore missing file
    
    // Track running test instances
    this.activeInstances = new Map(); // instanceId -> { port, containerId, permutation }
    this.completedTests = [];
    this.failedTests = [];
  }

  /**
   * Generate test permutations from config
   * @returns {Array} Array of test permutations
   */
  generateTestPermutations() {
    const permutations = [];
    
    for (const version of this.config['foundry-versions']) {
      for (const system of this.config['foundry-systems']) {
        const systemName = this.getSystemDisplayName(system);
        const dockerImage = `${this.config.docker.imagePrefix}-${version.toLowerCase()}`;
        
        permutations.push({
          id: `${version}-${system}`,
          version,
          system,
          systemName,
          dockerImage,
          description: `FoundryVTT ${version} with ${systemName}`
        });
      }
    }
    
    console.log(`📊 Generated ${permutations.length} test permutations:`);
    permutations.forEach(p => console.log(`  - ${p.id}: ${p.description}`));
    
    return permutations;
  }

  /**
   * Get display name for game system
   * @param {string} systemId - System identifier
   * @returns {string} Display name
   */
  getSystemDisplayName(systemId) {
    const systemNames = {
      'dnd5e': 'Dungeons & Dragons 5th Edition',
      'pf2e': 'Pathfinder 2nd Edition',
      'swade': 'Savage Worlds Adventure Edition',
      'fate': 'Fate Core System'
    };
    return systemNames[systemId] || systemId;
  }

  /**
   * Execute integration tests across all permutations
   * @param {Function} testFunction - Test function to execute
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Test execution results
   */
  async executeIntegrationTests(testFunction, options = {}) {
    const {
      maxConcurrent = this.config.docker.maxConcurrentInstances,
      timeoutMs = 600000, // 10 minutes default
      retries = 1
    } = options;

    console.log('🚀 Starting FoundryVTT integration test orchestration...');
    console.log(`📊 Config: ${maxConcurrent} max concurrent, ${timeoutMs}ms timeout, ${retries} retries`);

    const permutations = this.generateTestPermutations();
    const results = {
      totalPermutations: permutations.length,
      completed: 0,
      failed: 0,
      skipped: 0,
      results: [],
      startTime: Date.now(),
      endTime: null
    };

    // Execute permutations with concurrency control
    const executionPromises = [];
    const semaphore = new Array(maxConcurrent).fill(null).map(() => Promise.resolve());

    for (const [index, permutation] of permutations.entries()) {
      // Wait for available slot
      const availableSlot = await Promise.race(semaphore);
      const slotIndex = semaphore.indexOf(availableSlot);

      // Execute test for this permutation
      const executionPromise = this.executePermutationTest(
        permutation, 
        testFunction, 
        { timeoutMs, retries, index, total: permutations.length }
      );

      // Update semaphore slot with this execution
      semaphore[slotIndex] = executionPromise.finally(() => {
        // Slot becomes available again
        return Promise.resolve();
      });

      executionPromises.push(executionPromise);
    }

    // Wait for all executions to complete
    const permutationResults = await Promise.allSettled(executionPromises);

    // Process results
    for (const [index, result] of permutationResults.entries()) {
      const permutation = permutations[index];
      
      if (result.status === 'fulfilled') {
        results.completed++;
        results.results.push({
          permutation,
          success: true,
          result: result.value,
          error: null
        });
      } else {
        results.failed++;
        results.results.push({
          permutation,
          success: false,
          result: null,
          error: result.reason?.message || 'Unknown error'
        });
      }
    }

    results.endTime = Date.now();
    results.duration = results.endTime - results.startTime;

    this.logExecutionSummary(results);
    
    return results;
  }

  /**
   * Execute test for a single permutation
   * @param {Object} permutation - Test permutation
   * @param {Function} testFunction - Test function to execute
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Test result
   */
  async executePermutationTest(permutation, testFunction, options = {}) {
    const { timeoutMs, retries, index, total } = options;
    const instanceId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🧪 [${index + 1}/${total}] Starting test for ${permutation.id}...`);

    let lastError = null;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`🔄 [${permutation.id}] Attempt ${attempt}/${retries}`);

        // Set up test environment with timeout
        const testContext = await Promise.race([
          this.setupTestEnvironment(permutation, instanceId),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Setup timeout')), timeoutMs / 2)
          )
        ]);

        // Track active instance
        this.activeInstances.set(instanceId, {
          port: testContext.port,
          containerId: testContext.containerId,
          permutation,
          startTime: Date.now()
        });

        try {
          // Execute the test function with timeout
          const testResult = await Promise.race([
            testFunction(testContext, permutation),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Test execution timeout')), timeoutMs)
            )
          ]);

          console.log(`✅ [${permutation.id}] Test completed successfully`);
          
          return {
            permutation,
            success: true,
            result: testResult,
            attempt,
            duration: Date.now() - testContext.startTime
          };

        } finally {
          // Clean up test environment
          await this.cleanupTestEnvironment(instanceId, testContext);
        }

      } catch (error) {
        lastError = error;
        console.error(`❌ [${permutation.id}] Attempt ${attempt} failed:`, error.message);
        
        // Clean up on error
        if (this.activeInstances.has(instanceId)) {
          const instance = this.activeInstances.get(instanceId);
          await this.cleanupTestEnvironment(instanceId, instance).catch(cleanupError => {
            console.error(`⚠️ Cleanup error for ${instanceId}:`, cleanupError.message);
          });
        }

        // Don't retry on the last attempt
        if (attempt === retries) {
          break;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.error(`💥 [${permutation.id}] All attempts failed. Last error:`, lastError?.message);
    throw lastError;
  }

  /**
   * Set up test environment for a permutation
   * @param {Object} permutation - Test permutation
   * @param {string} instanceId - Unique instance identifier
   * @returns {Promise<Object>} Test context
   */
  async setupTestEnvironment(permutation, instanceId) {
    console.log(`🔧 [${permutation.id}] Setting up test environment...`);
    
    const startTime = Date.now();
    
    // Use the test runner to set up complete environment
    const testContext = await this.testRunner.setupTestEnvironment(permutation, {
      instanceId,
      fullBootstrap: true
    });

    console.log(`✅ [${permutation.id}] Environment ready in ${Date.now() - startTime}ms`);
    
    return {
      ...testContext,
      startTime,
      instanceId,
      permutation
    };
  }

  /**
   * Clean up test environment
   * @param {string} instanceId - Instance identifier
   * @param {Object} testContext - Test context to clean up
   */
  async cleanupTestEnvironment(instanceId, testContext) {
    console.log(`🧹 [${instanceId}] Cleaning up test environment...`);

    try {
      // Close browser if exists
      if (testContext.browser) {
        await testContext.browser.close().catch(e => 
          console.warn(`Browser cleanup warning: ${e.message}`)
        );
      }

      // Stop and remove container
      if (testContext.containerId) {
        await this.containerManager.stopContainer(testContext.containerId);
        await this.containerManager.removeContainer(testContext.containerId);
      }

      // Release port
      if (testContext.port) {
        this.portManager.releasePort(instanceId, testContext.port);
      }

      // Remove from active instances
      this.activeInstances.delete(instanceId);

      console.log(`✅ [${instanceId}] Environment cleaned up successfully`);

    } catch (error) {
      console.error(`⚠️ [${instanceId}] Cleanup error:`, error.message);
    }
  }

  /**
   * Get orchestrator status
   * @returns {Object} Current status
   */
  getStatus() {
    return {
      activeInstances: this.activeInstances.size,
      completedTests: this.completedTests.length,
      failedTests: this.failedTests.length,
      portManagerStatus: this.portManager.getStatus(),
      containerManagerStatus: this.containerManager.getStatus(),
      instances: Array.from(this.activeInstances.entries()).map(([id, instance]) => ({
        instanceId: id,
        permutation: instance.permutation.id,
        port: instance.port,
        containerId: instance.containerId,
        runningFor: Date.now() - instance.startTime
      }))
    };
  }

  /**
   * Log execution summary
   * @param {Object} results - Execution results
   */
  logExecutionSummary(results) {
    console.log('\n📊 INTEGRATION TEST EXECUTION SUMMARY');
    console.log('=====================================');
    console.log(`Total Permutations: ${results.totalPermutations}`);
    console.log(`✅ Completed: ${results.completed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`⏭️  Skipped: ${results.skipped}`);
    console.log(`⏱️  Duration: ${results.duration}ms`);
    console.log('');

    if (results.failed > 0) {
      console.log('❌ FAILED PERMUTATIONS:');
      results.results
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`  - ${r.permutation.id}: ${r.error}`);
        });
      console.log('');
    }

    if (results.completed > 0) {
      console.log('✅ SUCCESSFUL PERMUTATIONS:');
      results.results
        .filter(r => r.success)
        .forEach(r => {
          console.log(`  - ${r.permutation.id}: ${r.result.duration || 'N/A'}ms`);
        });
    }

    console.log('=====================================\n');
  }

  /**
   * Emergency cleanup - stop all active instances
   */
  async emergencyCleanup() {
    console.log('🚨 Emergency cleanup initiated...');
    
    const cleanupPromises = [];
    
    for (const [instanceId, instance] of this.activeInstances) {
      cleanupPromises.push(
        this.cleanupTestEnvironment(instanceId, instance).catch(error => {
          console.error(`Emergency cleanup failed for ${instanceId}:`, error.message);
        })
      );
    }

    await Promise.allSettled(cleanupPromises);
    
    // Force cleanup stale port allocations
    const staleCount = this.portManager.cleanupStaleAllocations(0);
    
    console.log(`✅ Emergency cleanup completed. Cleaned up ${cleanupPromises.length} instances and ${staleCount} stale ports.`);
  }
}