/**
 * Playwright Global Teardown
 * 
 * Executes AFTER all tests complete:
 * 1. Kills the Foundry server process
 * 2. Nukes the entire .foundry-test/ directory for clean slate
 * 3. Cleans up any temporary files
 */

import { existsSync, rmSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
const STATE_FILE = join(__dirname, '.test-state.json');
const FOUNDRY_TEST_DIR = join(ROOT, '.foundry-test');
// Data directory is separate from application directory (Foundry restriction)
const FOUNDRY_DATA_DIR = join(ROOT, '.foundry-test-data');

/**
 * Kill a process by PID
 */
function killProcess(pid) {
  if (!pid) return;
  
  try {
    // Send SIGTERM first
    process.kill(pid, 'SIGTERM');
    console.log(`[teardown] Sent SIGTERM to PID ${pid}`);
    
    // Give it a moment to gracefully shutdown
    execSync('sleep 2');
    
    // Check if still running and force kill
    try {
      process.kill(pid, 0); // Test if process exists
      process.kill(pid, 'SIGKILL');
      console.log(`[teardown] Sent SIGKILL to PID ${pid}`);
    } catch {
      // Process already dead - good
    }
  } catch (err) {
    // Process might already be dead
    if (err.code !== 'ESRCH') {
      console.warn(`[teardown] Warning: Failed to kill PID ${pid}: ${err.message}`);
    }
  }
}

/**
 * Kill any stray Foundry processes
 */
function killStrayFoundryProcesses() {
  try {
    // Find any node processes running Foundry
    const result = execSync(
      "pgrep -f 'main.mjs|main.js' | grep -v $$",
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
    
    if (result) {
      const pids = result.split('\n').filter(Boolean);
      for (const pid of pids) {
        killProcess(parseInt(pid, 10));
      }
    }
  } catch {
    // No matching processes found - that's fine
  }
}

/**
 * Remove the test Foundry directory
 */
function cleanupFoundryDirectory() {
  // Clean up application directory
  if (existsSync(FOUNDRY_TEST_DIR)) {
    console.log(`[teardown] Removing ${FOUNDRY_TEST_DIR}...`);
    
    try {
      rmSync(FOUNDRY_TEST_DIR, { recursive: true, force: true, maxRetries: 3 });
      console.log('[teardown] Test directory removed.');
    } catch (err) {
      console.error(`[teardown] Failed to remove directory: ${err.message}`);
      
      // Try with shell command as fallback
      try {
        execSync(`rm -rf "${FOUNDRY_TEST_DIR}"`, { stdio: 'inherit' });
        console.log('[teardown] Test directory removed via shell.');
      } catch {
        console.error('[teardown] WARNING: Could not remove test directory.');
      }
    }
  } else {
    console.log('[teardown] No test directory to clean up.');
  }
  
  // Clean up data directory (separate from application)
  if (existsSync(FOUNDRY_DATA_DIR)) {
    console.log(`[teardown] Removing ${FOUNDRY_DATA_DIR}...`);
    
    try {
      rmSync(FOUNDRY_DATA_DIR, { recursive: true, force: true, maxRetries: 3 });
      console.log('[teardown] Data directory removed.');
    } catch (err) {
      console.error(`[teardown] Failed to remove data directory: ${err.message}`);
      
      try {
        execSync(`rm -rf "${FOUNDRY_DATA_DIR}"`, { stdio: 'inherit' });
        console.log('[teardown] Data directory removed via shell.');
      } catch {
        console.error('[teardown] WARNING: Could not remove data directory.');
      }
    }
  }
}

/**
 * Remove state file
 */
function cleanupStateFile() {
  if (existsSync(STATE_FILE)) {
    rmSync(STATE_FILE, { force: true });
  }
}

/**
 * Main teardown function
 */
export default async function globalTeardown() {
  console.log('='.repeat(60));
  console.log('[teardown] Simulacrum E2E Test Teardown');
  console.log('='.repeat(60));
  
  // Load state from setup
  let state = null;
  if (existsSync(STATE_FILE)) {
    try {
      state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    } catch {
      console.warn('[teardown] Could not read state file');
    }
  }
  
  // Kill the Foundry process
  if (state?.pid) {
    console.log(`[teardown] Stopping Foundry server (PID: ${state.pid})...`);
    killProcess(state.pid);
  }
  
  // Kill any stray processes just in case
  killStrayFoundryProcesses();
  
  // Wait a moment for processes to die
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Remove the test directory
  cleanupFoundryDirectory();
  
  // Remove state file
  cleanupStateFile();
  
  console.log('='.repeat(60));
  console.log('[teardown] Cleanup complete!');
  console.log('='.repeat(60));
}
