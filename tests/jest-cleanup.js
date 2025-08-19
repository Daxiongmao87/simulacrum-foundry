/**
 * @file tests/jest-cleanup.js
 * @description Jest cleanup script for automatic container cleanup
 * 
 * This script ensures that FoundryVTT test containers are automatically
 * cleaned up after Jest test runs complete, regardless of success/failure.
 * 
 * It integrates with Jest's globalTeardown to provide comprehensive cleanup.
 */

import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Cleanup function that can be called from Jest
 */
export async function cleanupTestContainers() {
  try {
    console.log('🧹 Jest cleanup: Cleaning up test containers...');
    
    // Run the cleanup script
    const cleanupScript = join(__dirname, 'cleanup-test-containers.js');
    execSync(`node ${cleanupScript} --force`, { 
      stdio: 'inherit',
      cwd: __dirname 
    });
    
    console.log('✅ Jest cleanup: Test containers cleaned up');
  } catch (error) {
    console.error('❌ Jest cleanup: Failed to clean up containers:', error.message);
  }
}

/**
 * Global teardown function for Jest
 * This runs after ALL tests complete
 */
export async function globalTeardown() {
  console.log('🏁 Jest global teardown: Starting cleanup...');
  await cleanupTestContainers();
  console.log('🏁 Jest global teardown: Cleanup complete');
}

/**
 * Setup function that runs after each test file
 * This ensures cleanup happens even if tests are interrupted
 */
export function setupAfterEach() {
  // Register cleanup on process exit
  process.on('exit', () => {
    console.log('🚪 Process exit: Cleaning up test containers...');
    try {
      execSync('node tests/cleanup-test-containers.js --force', { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
    } catch (error) {
      // Ignore errors during exit
    }
  });
  
  // Register cleanup on SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    console.log('🛑 SIGINT received: Cleaning up test containers...');
    try {
      execSync('node tests/cleanup-test-containers.js --force', { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
    } catch (error) {
      // Ignore errors during SIGINT
    }
    process.exit(0);
  });
  
  // Register cleanup on SIGTERM
  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received: Cleaning up test containers...');
    try {
      execSync('node tests/cleanup-test-containers.js --force', { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
    } catch (error) {
      // Ignore errors during SIGTERM
    }
    process.exit(0);
  });
}

// Export the globalTeardown function for Jest
export default globalTeardown;
