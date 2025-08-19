#!/usr/bin/env node

/**
 * @file tests/run-bootstrap-tests.js
 * @description Main test runner for FoundryVTT bootstrap infrastructure
 * 
 * This script provides multiple execution modes:
 * - Single permutation test (hello-world style)
 * - All permutations concurrent testing
 * - Custom test function execution across permutations
 * - Infrastructure validation and setup checks
 */

import { BootstrapOrchestrator } from './helpers/bootstrap-orchestrator.js';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Sample Hello World test function
 */
async function helloWorldTestFunction(testContext, permutation) {
  console.log(`🎯 Executing Hello World test for ${permutation.id}...`);
  
  // Take screenshot as proof of successful integration
  const screenshotPath = `hello-world-${permutation.id}-${Date.now()}.png`;
  await testContext.page.screenshot({
    path: screenshotPath,
    fullPage: true
  });
  
  // Verify game world state
  const gameState = await testContext.page.evaluate(() => {
    return {
      gameExists: typeof window.game !== 'undefined',
      gameReady: window.game?.ready || false,
      view: window.game?.view || 'unknown',
      worldName: window.game?.world?.title || 'unknown',
      systemId: window.game?.system?.id || 'unknown',
      isGM: window.game?.user?.isGM || false,
      url: window.location.href,
      uiElements: {
        sidebar: !!document.querySelector('#sidebar'),
        canvas: !!document.querySelector('canvas#board'),
        chatLog: !!document.querySelector('#chat-log')
      }
    };
  });
  
  // Validate required state
  const verifications = [
    { check: gameState.gameExists, message: 'Game object exists' },
    { check: gameState.gameReady, message: 'Game is ready' },
    { check: gameState.view === 'game', message: 'In game view' },
    { check: gameState.systemId === permutation.system, message: `System is ${permutation.system}` },
    { check: gameState.isGM, message: 'User is GM' }
  ];
  
  const failedVerifications = verifications.filter(v => !v.check);
  if (failedVerifications.length > 0) {
    throw new Error(`Verification failed: ${failedVerifications.map(f => f.message).join(', ')}`);
  }
  
  console.log(`✅ Hello World test passed for ${permutation.id}`);
  console.log(`📸 Screenshot: ${screenshotPath}`);
  
  return {
    success: true,
    gameState,
    screenshotPath,
    verifications: verifications.length
  };
}

/**
 * System compatibility test function
 */
async function systemCompatibilityTestFunction(testContext, permutation) {
  console.log(`🧪 Executing system compatibility test for ${permutation.id}...`);
  
  // Get detailed system information
  const systemInfo = await testContext.page.evaluate(() => {
    const system = window.game?.system;
    return {
      id: system?.id,
      title: system?.title,
      version: system?.version,
      compatibility: {
        minimum: system?.compatibility?.minimum,
        verified: system?.compatibility?.verified,
        maximum: system?.compatibility?.maximum
      },
      authors: system?.authors?.map(a => a.name) || [],
      description: system?.description,
      manifest: system?.manifest,
      ready: system?.ready,
      foundryVersion: window.game?.version
    };
  });
  
  // Take system info screenshot
  const screenshotPath = `system-compatibility-${permutation.id}-${Date.now()}.png`;
  await testContext.page.screenshot({
    path: screenshotPath,
    fullPage: true
  });
  
  console.log(`✅ System compatibility test completed for ${permutation.id}`);
  console.log(`📊 System: ${systemInfo.title} v${systemInfo.version}`);
  console.log(`🏗️  FoundryVTT: ${systemInfo.foundryVersion}`);
  
  return {
    success: true,
    systemInfo,
    screenshotPath
  };
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'hello-world';
  
  console.log('🚀 FoundryVTT Bootstrap Infrastructure Test Runner');
  console.log('================================================\n');
  
  try {
    const orchestrator = new BootstrapOrchestrator('tests/config/test.config.json');
    
    switch (command) {
      case 'hello-world':
        console.log('🌟 Running Hello World test across all permutations...\n');
        await runHelloWorldTests(orchestrator);
        break;
        
      case 'system-compatibility':
        console.log('🧪 Running system compatibility tests across all permutations...\n');
        await runSystemCompatibilityTests(orchestrator);
        break;
        
      case 'single':
        const permutationId = args[1];
        if (!permutationId) {
          console.error('❌ Please specify a permutation ID (e.g., v13-dnd5e)');
          process.exit(1);
        }
        console.log(`🎯 Running single permutation test: ${permutationId}\n`);
        await runSinglePermutationTest(orchestrator, permutationId);
        break;
        
      case 'validate':
        console.log('🔍 Validating infrastructure setup...\n');
        await validateInfrastructure(orchestrator);
        break;
        
      case 'permutations':
        console.log('📊 Listing available test permutations...\n');
        listPermutations(orchestrator);
        break;
        
      case 'help':
        showHelp();
        break;
        
      default:
        console.error(`❌ Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
    
  } catch (error) {
    console.error('\n💥 FATAL ERROR:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

/**
 * Run Hello World tests across all permutations
 */
async function runHelloWorldTests(orchestrator) {
  const results = await orchestrator.executeIntegrationTests(helloWorldTestFunction, {
    maxConcurrent: 2, // Conservative for demo
    timeoutMs: 900000, // 15 minutes per test
    retries: 1
  });
  
  console.log(`\n🎉 Hello World tests completed!`);
  console.log(`✅ Success: ${results.completed}/${results.totalPermutations}`);
  console.log(`❌ Failed: ${results.failed}/${results.totalPermutations}`);
}

/**
 * Run system compatibility tests
 */
async function runSystemCompatibilityTests(orchestrator) {
  const results = await orchestrator.executeIntegrationTests(systemCompatibilityTestFunction, {
    maxConcurrent: 1, // Sequential for detailed analysis
    timeoutMs: 600000, // 10 minutes per test
    retries: 1
  });
  
  console.log(`\n🧪 System compatibility tests completed!`);
  console.log(`✅ Success: ${results.completed}/${results.totalPermutations}`);
  console.log(`❌ Failed: ${results.failed}/${results.totalPermutations}`);
  
  // Print system compatibility matrix
  if (results.completed > 0) {
    console.log('\n📊 SYSTEM COMPATIBILITY MATRIX:');
    console.log('================================');
    results.results
      .filter(r => r.success)
      .forEach(r => {
        const systemInfo = r.result.systemInfo;
        console.log(`${r.permutation.id}: ${systemInfo.title} v${systemInfo.version} (FoundryVTT ${systemInfo.foundryVersion})`);
      });
  }
}

/**
 * Run test on single permutation
 */
async function runSinglePermutationTest(orchestrator, permutationId) {
  const permutations = orchestrator.generateTestPermutations();
  const target = permutations.find(p => p.id === permutationId);
  
  if (!target) {
    console.error(`❌ Permutation ${permutationId} not found`);
    console.log('Available permutations:');
    permutations.forEach(p => console.log(`  - ${p.id}`));
    process.exit(1);
  }
  
  console.log(`🎯 Testing single permutation: ${target.description}`);
  
  try {
    const result = await orchestrator.executePermutationTest(
      target,
      helloWorldTestFunction,
      { timeoutMs: 900000, retries: 1, index: 0, total: 1 }
    );
    
    console.log('\n✅ Single permutation test completed successfully!');
    console.log(`📊 Duration: ${result.duration}ms`);
    console.log(`🎯 Result:`, result.result);
    
  } catch (error) {
    console.error(`\n❌ Single permutation test failed: ${error.message}`);
    throw error;
  }
}

/**
 * Validate infrastructure setup
 */
async function validateInfrastructure(orchestrator) {
  console.log('🔍 Validating Docker availability...');
  const dockerValid = await orchestrator.containerManager.verifyDockerAvailable();
  
  if (!dockerValid) {
    console.error('❌ Docker is not available. Please install Docker and ensure it is running.');
    process.exit(1);
  }
  
  console.log('✅ Docker is available');
  
  console.log('\n📊 Docker system information:');
  const dockerInfo = await orchestrator.containerManager.getDockerInfo();
  console.log(`Version: ${dockerInfo.version}`);
  console.log(`System Info:\n${dockerInfo.systemInfo}`);
  
  console.log('\n📋 Port Manager status:');
  const portStatus = orchestrator.portManager.getStatus();
  console.log(`Available ports: ${portStatus.availablePorts}`);
  console.log(`Port range: ${portStatus.totalPorts} ports`);
  console.log(`Max concurrent: ${portStatus.maxConcurrentInstances}`);
  
  console.log('\n🎯 Test permutations:');
  const permutations = orchestrator.generateTestPermutations();
  permutations.forEach(p => {
    console.log(`  ✓ ${p.id}: ${p.description}`);
  });
  
  console.log('\n✅ Infrastructure validation completed successfully!');
}

/**
 * List available permutations
 */
function listPermutations(orchestrator) {
  const permutations = orchestrator.generateTestPermutations();
  
  console.log(`📊 Available Test Permutations (${permutations.length} total):`);
  console.log('='.repeat(60));
  
  permutations.forEach((p, index) => {
    console.log(`${index + 1}. ${p.id}`);
    console.log(`   Description: ${p.description}`);
    console.log(`   Docker Image: ${p.dockerImage}`);
    console.log(`   Version: ${p.version}, System: ${p.system}`);
    console.log('');
  });
  
  console.log('Usage: node run-bootstrap-tests.js single <permutation-id>');
  console.log('Example: node run-bootstrap-tests.js single v13-dnd5e');
}

/**
 * Show help information
 */
function showHelp() {
  console.log(`
🚀 FoundryVTT Bootstrap Infrastructure Test Runner

Usage: node run-bootstrap-tests.js <command> [options]

Commands:
  hello-world           Run Hello World tests across all permutations
  system-compatibility  Run system compatibility tests across all permutations  
  single <id>          Run test on single permutation (e.g., v13-dnd5e)
  validate             Validate infrastructure setup (Docker, ports, etc.)
  permutations         List all available test permutations
  help                 Show this help message

Examples:
  node run-bootstrap-tests.js hello-world
  node run-bootstrap-tests.js single v13-dnd5e
  node run-bootstrap-tests.js validate
  node run-bootstrap-tests.js permutations

Configuration:
  Edit tests/config/test.config.json to modify:
  - FoundryVTT versions and systems to test
  - Docker settings and port ranges
  - Bootstrap timeouts and retries
  - Puppeteer browser settings

Requirements:
  - Docker installed and running
  - FoundryVTT binary files in expected locations
  - Valid FoundryVTT license key in config
  `);
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, performing emergency cleanup...');
  try {
    const orchestrator = new BootstrapOrchestrator('tests/config/test.config.json');
    await orchestrator.emergencyCleanup();
    console.log('✅ Emergency cleanup completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Emergency cleanup failed:', error.message);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, performing emergency cleanup...');
  try {
    const orchestrator = new BootstrapOrchestrator('tests/config/test.config.json');
    await orchestrator.emergencyCleanup();
    console.log('✅ Emergency cleanup completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Emergency cleanup failed:', error.message);
    process.exit(1);
  }
});

// Run main function
main().catch(error => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});