#!/usr/bin/env node
/**
 * Run the Simulacrum e2e test suite inside the e2e container image.
 *
 * Usage:
 *   node tests/e2e/scripts/run-in-container.js [13|14]
 *   npm run test:e2e:container -- 14
 *
 * Optional env overrides:
 *   CONTAINER_ENGINE        — force a specific engine (podman, docker, nerdctl, finch…)
 *   E2E_IMAGE               — override the full image reference
 *   E2E_DATA_IMAGE          — override the seed data image
 *   E2E_MODULE_IMAGE        — override the module image
 *   FOUNDRY_ADMIN_KEY       — admin password passed to Foundry (default: test-admin-key)
 *   TEST_SYSTEM_IDS         — comma-separated system IDs (default: dnd5e)
 *
 * When simulacrum-foundry-e2e-data:<major> and simulacrum-foundry-e2e-module:<major>
 * exist locally, they are mounted via --mount type=image so /data in the container
 * is pre-seeded with immutable image content. Tests run in per-worker seeded mode.
 * Build them with: npm run test:e2e:seed:build -- <major>
 */

import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../../..');
const VENDOR_DIR = join(REPO_ROOT, 'vendor/foundry');

// Accept tags like: 14, 13
const tag = process.argv[2] || '14';
const majorMatch = tag.match(/^(\d+)/);
if (!majorMatch) {
  console.error(`ERROR: Cannot parse major version from tag '${tag}'`);
  console.error('       Expected format: 14, 13');
  process.exit(1);
}
const FOUNDRY_MAJOR  = majorMatch[1];
const IMAGE          = process.env.E2E_IMAGE          || `localhost/simulacrum-foundry-e2e:${FOUNDRY_MAJOR}`;
const DATA_IMAGE     = process.env.E2E_DATA_IMAGE     || `localhost/simulacrum-foundry-e2e-data:${FOUNDRY_MAJOR}`;
const MODULE_IMAGE   = process.env.E2E_MODULE_IMAGE   || `localhost/simulacrum-foundry-e2e-module:${FOUNDRY_MAJOR}`;

// ---------------------------------------------------------------------------
// Detect container engine
// ---------------------------------------------------------------------------
function detectEngine() {
  const override = process.env.CONTAINER_ENGINE;
  if (override) {
    try {
      execFileSync(override, ['--version'], { stdio: 'pipe' });
      return override;
    } catch {
      console.error(`ERROR: CONTAINER_ENGINE='${override}' not found or not executable`);
      process.exit(1);
    }
  }

  for (const engine of ['podman', 'docker', 'nerdctl', 'finch']) {
    try {
      execFileSync(engine, ['--version'], { stdio: 'pipe' });
      return engine;
    } catch { /* not found, try next */ }
  }

  console.error('ERROR: No container engine found.');
  console.error('       Install one of: podman, docker, nerdctl, finch');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Find the Foundry zip in vendor/foundry/ for the requested major version
// ---------------------------------------------------------------------------
function findFoundryZip(majorVersion) {
  if (!existsSync(VENDOR_DIR)) {
    return null;
  }
  // Accept any zip whose name contains the major version followed by a dot —
  // handles both "foundryvtt-14.363.zip" (CI-downloaded) and
  // "FoundryVTT-WindowsPortable-14.363.zip" (local dev download).
  const zip = readdirSync(VENDOR_DIR)
    .filter(f => f.toLowerCase().endsWith('.zip'))
    .find(f => new RegExp(`${majorVersion}\\.`, 'i').test(f));
  return zip ? join(VENDOR_DIR, zip) : null;
}

// Extract full version from zip filename, e.g. "FoundryVTT-WindowsPortable-14.363.zip" → "14.363"
function versionFromZip(zipPath) {
  const m = basename(zipPath).match(/(\d+\.\d+)/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Resolve Foundry license.json from the host
// ---------------------------------------------------------------------------
function resolveLicenseB64() {
  const explicit = process.env.FOUNDRY_LICENSE_JSON_PATH;
  if (explicit && existsSync(explicit)) {
    return readFileSync(explicit).toString('base64');
  }

  const defaults = {
    win32: join(process.env.LOCALAPPDATA || '', 'FoundryVTT', 'Config', 'license.json'),
    darwin: join(os.homedir(), 'Library', 'Application Support', 'FoundryVTT', 'Config', 'license.json'),
    linux: join(os.homedir(), '.local', 'share', 'FoundryVTT', 'Config', 'license.json'),
  };
  const defaultPath = defaults[process.platform];
  if (defaultPath && existsSync(defaultPath)) {
    return readFileSync(defaultPath).toString('base64');
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function imageExists(engine, image) {
  try {
    execFileSync(engine, ['image', 'inspect', image, '--format', '{{.Id}}'], { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Build container run args
// ---------------------------------------------------------------------------
const engine = detectEngine();
console.log(`[container] Engine: ${engine}`);
console.log(`[container] Image:  ${IMAGE}`);

// Ensure the cache dir exists — podman/docker won't mount a non-existent host path.
mkdirSync(VENDOR_DIR, { recursive: true });

const foundryZip = findFoundryZip(FOUNDRY_MAJOR);
if (foundryZip) {
  console.log(`[container] Foundry zip found: ${basename(foundryZip)}`);
  console.log(`[container] Mounting as /foundry-cache for entrypoint`);
} else {
  console.log(`[container] No local Foundry zip in ${VENDOR_DIR}`);
  console.log(`[container] Entrypoint will fail — place foundryvtt-<version>.zip in ${VENDOR_DIR}`);
}

const volumeArgs = [
  '--volume', `${REPO_ROOT}:/workspace`,
  '--volume', '/workspace/node_modules',  // anonymous: keeps root-owned files off host
  '--volume', `${VENDOR_DIR}:/foundry-cache`,
];

const foundryVersion = foundryZip ? versionFromZip(foundryZip) : null;

const envArgs = [
  '--env', 'CI=true',
  '--env', `FOUNDRY_INSTALL_PATH=/home/node/resources/app`,
  '--env', `CONTAINER_CACHE=/foundry-cache`,
  '--env', `FOUNDRY_ADMIN_KEY=${process.env.FOUNDRY_ADMIN_KEY || 'test-admin-key'}`,
  '--env', `TEST_SYSTEM_IDS=${process.env.TEST_SYSTEM_IDS || 'dnd5e'}`,
];

if (foundryVersion) {
  envArgs.push('--env', `FOUNDRY_VERSION=${foundryVersion}`);
}

const licenseB64 = process.env.FOUNDRY_LICENSE_JSON_B64 || resolveLicenseB64();
if (licenseB64) {
  const source = process.env.FOUNDRY_LICENSE_JSON_B64 ? 'from environment' : 'resolved from host';
  console.log(`[container] License ${source} — passing as FOUNDRY_LICENSE_JSON_B64`);
  envArgs.push('--env', `FOUNDRY_LICENSE_JSON_B64=${licenseB64}`);
} else {
  console.warn('[container] WARNING: No license.json found — Foundry will prompt for license/EULA');
}

// Pass through .env.test if present (explicit --env args above take precedence)
const envTestPath = join(REPO_ROOT, 'tests/e2e/.env.test');
if (existsSync(envTestPath)) {
  envArgs.push('--env-file', envTestPath);
}

// ── Seed images ───────────────────────────────────────────────────────────────

const dataImageAvailable   = imageExists(engine, DATA_IMAGE);
const moduleImageAvailable = imageExists(engine, MODULE_IMAGE);
const seeded = dataImageAvailable && moduleImageAvailable;

if (seeded) {
  console.log(`[container] Seed images found — mounting /data from ${DATA_IMAGE} + ${MODULE_IMAGE}`);
  console.log(`[container] Workers will use pre-seeded data (per-worker Foundry instances)`);
  // --mount type=image mounts the image filesystem directly (no volume seeding needed).
  // data.Dockerfile and module.Dockerfile both use COPY . / so the image root maps
  // to the destination path without an extra nesting level.
  volumeArgs.push(
    '--mount', `type=image,source=${DATA_IMAGE},dst=/data,rw=false`,
    '--mount', `type=image,source=${MODULE_IMAGE},dst=/data/Data/modules/simulacrum,rw=false`,
  );
  envArgs.push('--env', 'SEEDED_DATA_DIR=/data');
} else {
  console.log(`[container] Seed images not found — per-test isolation mode`);
  if (!dataImageAvailable)   console.log(`[container]   Missing: ${DATA_IMAGE}`);
  if (!moduleImageAvailable) console.log(`[container]   Missing: ${MODULE_IMAGE}`);
  console.log(`[container]   Run: npm run test:e2e:seed:build -- ${FOUNDRY_MAJOR}`);
}

const runArgs = [
  'run', '--rm',
  '--user', 'root',
  '--workdir', '/home/node',
  ...volumeArgs,
  ...envArgs,
  IMAGE,
];

console.log('[container] Starting — entrypoint will install Foundry then run tests...');

const result = spawnSync(engine, runArgs, { stdio: 'inherit' });
process.exit(result.status ?? 1);
