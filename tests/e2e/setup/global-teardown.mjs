/**
 * Playwright Global Teardown - MINIMAL
 *
 * Per-test cleanup is handled by fixtures.
 * This just does final cleanup of any orphaned resources.
 */

import { existsSync, readFileSync, rmSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  loadFoundryEnvironment,
  removeGovernedRuntimeRoot,
} from '../fixtures/agentic-foundry-inputs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
const OWNERSHIP_MARKER = '.simulacrum-e2e-owned.json';
const RUNTIME_OWNER_MARKER = '.simulacrum-runtime-owner.json';
const TEST_ENV_PATH = join(ROOT, 'tests/e2e/.env.test');

/**
 * Global Teardown - Clean up orphaned test directories
 */
export default async function globalTeardown() {
  console.log('============================================================');
  const env = {
    ...loadFoundryEnvironment({
      environment: process.env,
      localPath: TEST_ENV_PATH,
    }),
    ...process.env,
  };

  if (env.ADP_FOUNDRY_ENDPOINT) {
    console.log('[teardown] External broker mode: lifecycle cleanup remains broker-owned.');
    return;
  }
  console.log('[teardown] Simulacrum E2E Test Teardown');
  console.log('============================================================');

  const artifactRoot = env.ADP_ARTIFACT_DIR ? resolve(env.ADP_ARTIFACT_DIR) : null;
  const cleanupRoot = artifactRoot ? join(artifactRoot, '.foundry-runtime') : ROOT;
  const legacyDirs = ['.foundry-test', '.foundry-test-data'];
  let cleanupSafe = true;

  // Clean up any orphaned test directories
  console.log('[teardown] Cleaning up orphaned test directories...');
  try {
    const rootContents = existsSync(cleanupRoot) ? readdirSync(cleanupRoot) : [];
    for (const item of rootContents) {
      if (item.startsWith('.foundry-test-') || item.startsWith('.foundry-data-')) {
        const itemPath = join(cleanupRoot, item);
        if (!existsSync(itemPath)) continue;
        const marker = readOwnershipMarker(itemPath);
        if (!marker) {
          cleanupSafe = false;
          console.log(`[teardown] Preserving unowned directory: ${item}`);
          continue;
        }
        const targets = verifiedOperationTargets(marker);
        if (!targets) {
          cleanupSafe = false;
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
            cleanupSafe = false;
            console.warn(`[teardown] Failed to remove ${target}: ${e.message}`);
          }
        }
      } else if (
        artifactRoot &&
        item !== RUNTIME_OWNER_MARKER &&
        item !== 'system-cache' &&
        !legacyDirs.includes(item)
      ) {
        cleanupSafe = false;
        console.log(`[teardown] Preserving unexpected runtime entry: ${item}`);
      }
    }
  } catch (e) {
    cleanupSafe = false;
    console.warn(`[teardown] Error scanning for orphaned directories: ${e.message}`);
  }

  // Also clean up legacy single test directories if they exist
  for (const dir of legacyDirs) {
    const dirPath = join(cleanupRoot, dir);
    if (!existsSync(dirPath)) continue;
    if (!isOwnedTestDirectory(dirPath)) {
      cleanupSafe = false;
      console.log(`[teardown] Preserving unowned legacy directory: ${dir}`);
      continue;
    }
    console.log(`[teardown] Removing legacy directory: ${dir}`);
    try {
      rmSync(dirPath, { recursive: true, force: true });
    } catch (e) {
      cleanupSafe = false;
      console.warn(`[teardown] Failed to remove ${dir}: ${e.message}`);
    }
  }

  if (artifactRoot) {
    if (cleanupSafe) {
      removeGovernedRuntimeRoot(cleanupRoot, artifactRoot, env.AGENTIC_DELIVERY_RUN_ID);
    } else {
      console.log('[teardown] Preserving governed runtime root with unowned content.');
    }
  }

  console.log('============================================================');
  console.log('[teardown] Cleanup complete');
  console.log('============================================================');
  if (artifactRoot && !cleanupSafe) {
    throw new Error('refusing to remove unowned runtime content');
  }
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
