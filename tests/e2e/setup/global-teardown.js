/**
 * Playwright Global Teardown - MINIMAL
 * 
 * Per-test cleanup is handled by fixtures.
 * This just does final cleanup of any orphaned resources.
 */

import { existsSync, rmSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { isPortInUse } from '../fixtures/platform-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');

/**
 * Global Teardown - Clean up orphaned test directories
 */
export default async function globalTeardown() {
  console.log('============================================================');
  console.log('[teardown] Simulacrum E2E Test Teardown');
  console.log('============================================================');
  
  console.log('[teardown] Checking for orphaned listeners on test ports...');
  const stuckPorts = [];
  for (let port = 30000; port <= 30010; port++) {
    if (await isPortInUse(port)) stuckPorts.push(port);
  }
  if (stuckPorts.length > 0) {
    console.warn(`[teardown] Ports still in use: ${stuckPorts.join(', ')} — kill orphans manually.`);
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
