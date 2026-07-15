/**
 * Playwright Global Teardown - MINIMAL
 *
 * Per-test cleanup is handled by fixtures.
 * This just does final cleanup of any orphaned resources.
 */

import { existsSync, readFileSync, rmSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
const OWNERSHIP_MARKER = '.simulacrum-e2e-owned.json';
const TEST_ENV_PATH = join(ROOT, 'tests/e2e/.env.test');

function loadEnv() {
  if (!existsSync(TEST_ENV_PATH)) return { ...process.env };

  const env = {};
  for (const line of readFileSync(TEST_ENV_PATH, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    env[trimmed.slice(0, eqIndex).trim()] = trimmed.slice(eqIndex + 1).trim();
  }
  return { ...env, ...process.env };
}

/**
 * Global Teardown - Clean up orphaned test directories
 */
export default async function globalTeardown() {
  console.log('============================================================');

  const env = loadEnv();
  if (env.ADP_FOUNDRY_ENDPOINT) {
    console.log('[teardown] External broker mode: lifecycle cleanup remains broker-owned.');
    return;
  }
  console.log('[teardown] Simulacrum E2E Test Teardown');
  console.log('============================================================');

  // Clean up any orphaned test directories
  console.log('[teardown] Cleaning up orphaned test directories...');
  try {
    const rootContents = readdirSync(ROOT);
    for (const item of rootContents) {
      if (item.startsWith('.foundry-test-') || item.startsWith('.foundry-data-')) {
        const itemPath = join(ROOT, item);
        const marker = readOwnershipMarker(itemPath);
        if (!marker) {
          console.log(`[teardown] Preserving unowned directory: ${item}`);
          continue;
        }
        const targets = verifiedOperationTargets(marker);
        if (!targets) {
          console.log(`[teardown] Preserving incompletely-owned operation: ${item}`);
          continue;
        }
        console.log(`[teardown] Verified owned cleanup targets: ${targets.join(', ')}`);
        stopOwnedFoundry(marker);
        for (const target of targets) {
          if (!existsSync(target)) continue;
          try {
            rmSync(target, { recursive: true, force: true });
          } catch (e) {
            console.warn(`[teardown] Failed to remove ${target}: ${e.message}`);
          }
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
    if (existsSync(dirPath) && isOwnedTestDirectory(dirPath)) {
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

export function isOwnedTestDirectory(directory) {
  return readOwnershipMarker(directory) !== null;
}

export function readOwnershipMarker(directory) {
  const markerPath = join(directory, OWNERSHIP_MARKER);
  if (!existsSync(markerPath)) return null;

  try {
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    if (marker.schema_version !== 1 || marker.owner !== 'simulacrum-e2e') return null;
    if (![marker.test_dir, marker.data_dir].includes(directory)) return null;
    if (!marker.test_id || !marker.test_dir || !marker.data_dir) return null;
    return marker;
  } catch {
    return null;
  }
}

function verifiedOperationTargets(marker) {
  const targets = [marker.test_dir, marker.data_dir];
  if (new Set(targets).size !== 2) return null;
  for (const target of targets) {
    const paired = readOwnershipMarker(target);
    if (!paired) return null;
    for (const key of ['test_id', 'test_dir', 'data_dir', 'foundry_pid', 'port', 'main_mjs']) {
      if (paired[key] !== marker[key]) return null;
    }
  }
  return targets;
}

function stopOwnedFoundry(marker) {
  if (!Number.isSafeInteger(marker.foundry_pid) || !marker.main_mjs) return;

  try {
    const command = readFileSync(`/proc/${marker.foundry_pid}/cmdline`, 'utf8').replaceAll(
      '\0',
      ' '
    );
    if (!command.includes(marker.main_mjs)) {
      console.log(`[teardown] Preserving PID ${marker.foundry_pid}; command does not match marker`);
      return;
    }
    console.log(`[teardown] Stopping owned Foundry PID: ${marker.foundry_pid}`);
    process.kill(marker.foundry_pid, 'SIGKILL');
  } catch {
    // The recorded process already exited or is no longer inspectable.
  }
}
