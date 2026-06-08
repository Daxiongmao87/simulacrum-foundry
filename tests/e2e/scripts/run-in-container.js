#!/usr/bin/env node
/**
 * Run the Simulacrum e2e test suite inside a pre-built e2e container image.
 *
 * Usage:
 *   node tests/e2e/scripts/run-in-container.js [13|14|14.363.0]
 *   npm run test:e2e:container -- 14
 *
 * The script uses the pre-built ghcr.io image (npm + Playwright already
 * installed) so each run only pays for npm ci and the test suite itself.
 * On first use, or when the Dockerfile changes, rebuild locally with:
 *   npm run test:e2e:container:build -- 14
 *
 * Optional env overrides:
 *   CONTAINER_ENGINE        — force a specific engine (podman, docker, nerdctl, finch…)
 *   E2E_IMAGE               — override the full image reference
 *   FOUNDRY_ADMIN_KEY       — admin password passed to Foundry (default: test-admin-key)
 *   TEST_SYSTEM_IDS         — comma-separated system IDs (default: dnd5e)
 *
 * The script auto-detects the container engine, reads the host Foundry
 * license.json, and passes it into the container as FOUNDRY_LICENSE_JSON_B64.
 */

import { execFileSync, spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../../..');
const DOCKERFILE = join(__dirname, '../docker/Dockerfile');

// Accept tags like: 14, 13, 14.363.0, 13.351.0
const tag = process.argv[2] || '14';
const majorMatch = tag.match(/^(\d+)/);
if (!majorMatch) {
  console.error(`ERROR: Cannot parse major version from tag '${tag}'`);
  console.error('       Expected format: 14, 13, 14.363.0, 13.351.0');
  process.exit(1);
}
const FOUNDRY_MAJOR = majorMatch[1];
const IMAGE = process.env.E2E_IMAGE || `ghcr.io/daxiongmao87/simulacrum-foundry/e2e:${FOUNDRY_MAJOR}`;

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
// Build container run args
// ---------------------------------------------------------------------------
const engine = detectEngine();
console.log(`[container] Engine: ${engine}`);
console.log(`[container] Image:  ${IMAGE}`);

const envArgs = [
  '--env', `FOUNDRY_INSTALL_PATH=/home/node/resources/app`,
  '--env', `FOUNDRY_VERSION=${FOUNDRY_MAJOR}`,
  '--env', `FOUNDRY_ADMIN_KEY=${process.env.FOUNDRY_ADMIN_KEY || 'test-admin-key'}`,
  '--env', `TEST_SYSTEM_IDS=${process.env.TEST_SYSTEM_IDS || 'dnd5e'}`,
];

const licenseB64 = process.env.FOUNDRY_LICENSE_JSON_B64 || resolveLicenseB64();
if (licenseB64) {
  const source = process.env.FOUNDRY_LICENSE_JSON_B64 ? 'from environment' : 'resolved from host';
  console.log(`[container] License ${source} — passing as FOUNDRY_LICENSE_JSON_B64`);
  envArgs.push('--env', `FOUNDRY_LICENSE_JSON_B64=${licenseB64}`);
} else {
  console.warn('[container] WARNING: No license.json found — Foundry will prompt for license/EULA');
}

// Pass through .env.test if present (explicit --env args above take precedence
// because they appear later in the arg list)
const envTestPath = join(REPO_ROOT, 'tests/e2e/.env.test');
if (existsSync(envTestPath)) {
  envArgs.push('--env-file', envTestPath);
}

const runArgs = [
  'run', '--rm',
  '--user', 'root',
  '--entrypoint', 'bash',
  '--volume', `${REPO_ROOT}:/workspace`,
  // Anonymous volume shadows node_modules so root-owned install files don't leak to the host
  '--volume', '/workspace/node_modules',
  '--workdir', '/workspace',
  ...envArgs,
  IMAGE,
  '-c',
  'npm ci && npx playwright install chromium && npm run test:e2e',
];

console.log('[container] Mounting repo at /workspace and running tests...');

const result = spawnSync(engine, runArgs, { stdio: 'inherit' });
process.exit(result.status ?? 1);
