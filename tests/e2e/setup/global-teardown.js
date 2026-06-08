/**
 * Playwright Global Teardown - MINIMAL
 * 
 * Per-test cleanup is handled by fixtures.
 * This just does final cleanup of any orphaned resources.
 */

import { existsSync, rmSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');

/**
 * Global Teardown - Clean up orphaned test directories
 */
export default async function globalTeardown() {
  console.log('============================================================');
  console.log('[teardown] Simulacrum E2E Test Teardown');
  console.log('============================================================');
  
  // Check for orphaned Foundry (main.mjs) processes by name — ports are dynamic
  // so we can't scan a fixed range.
  console.log('[teardown] Checking for orphaned Foundry processes...');
  try {
    let orphanPids = [];
    if (process.platform === 'win32') {
      const out = execSync('wmic process where "CommandLine like \'%main.mjs%\'" get ProcessId', { encoding: 'utf-8' });
      orphanPids = out.split('\n').map(l => l.trim()).filter(l => /^\d+$/.test(l));
    } else {
      const out = execSync('pgrep -f main.mjs 2>/dev/null || true', { encoding: 'utf-8', shell: true });
      orphanPids = out.split('\n').map(l => l.trim()).filter(Boolean);
    }
    if (orphanPids.length > 0) {
      console.warn(`[teardown] Orphaned Foundry processes: PIDs ${orphanPids.join(', ')} — kill them manually if tests did not clean up.`);
    }
  } catch (e) {
    console.warn(`[teardown] Could not scan for orphaned processes: ${e.message}`);
  }
  
  // Clean up any orphaned test directories
  console.log('[teardown] Cleaning up orphaned test directories...');
  try {
    const rootContents = readdirSync(ROOT);
    for (const item of rootContents) {
      if (item.startsWith('.foundry-test-') || item.startsWith('.foundry-data-')) {
        const itemPath = join(ROOT, item);
        console.log(`[teardown] Removing orphaned directory: ${item}`);
        try {
          rmSync(itemPath, { recursive: true, force: true });
        } catch (e) {
          console.warn(`[teardown] Failed to remove ${item}: ${e.message}`);
        }
      }
    }
  } catch (e) {
    console.warn(`[teardown] Error scanning for orphaned directories: ${e.message}`);
  }
  
  // Also clean up legacy single test directories if they exist
  const legacyDirs = ['.foundry-test', '.foundry-test-data'];
  for (const dir of legacyDirs) {
    const dirPath = join(ROOT, dir);
    if (existsSync(dirPath)) {
      console.log(`[teardown] Removing legacy directory: ${dir}`);
      try {
        rmSync(dirPath, { recursive: true, force: true });
      } catch (e) {
        console.warn(`[teardown] Failed to remove ${dir}: ${e.message}`);
      }
    }
  }
  
  console.log('============================================================');
  console.log('[teardown] Cleanup complete');
  console.log('============================================================');
}
