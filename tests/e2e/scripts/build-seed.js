#!/usr/bin/env node
/**
 * Build the e2e seed data images.
 *
 * Usage:
 *   node tests/e2e/scripts/build-seed.js [13|14]
 *   npm run test:e2e:seed:build -- 13
 *
 * Produces two local images (never published):
 *   simulacrum-foundry-e2e-data:<major>    — seeded /data (Config, worlds, systems)
 *   simulacrum-foundry-e2e-module:<major>  — current module build
 *
 * Requires the test image to already exist:
 *   npm run test:e2e:container:build -- <major>
 */

import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, readdirSync, readFileSync, cpSync } from 'fs';
import { join, dirname, basename } from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = join(__dirname, '../../..');
const DOCKER_DIR = join(__dirname, '../docker');
const VENDOR_DIR = join(REPO_ROOT, 'vendor/foundry');

const tag = process.argv[2] || '14';
const majorMatch = tag.match(/^(\d+)/);
if (!majorMatch) {
  console.error(`ERROR: Cannot parse major version from tag '${tag}'`);
  process.exit(1);
}
const FOUNDRY_MAJOR  = majorMatch[1];
const TEST_IMAGE     = process.env.E2E_IMAGE        || `localhost/simulacrum-foundry-e2e:${FOUNDRY_MAJOR}`;
const DATA_IMAGE     = process.env.E2E_DATA_IMAGE   || `localhost/simulacrum-foundry-e2e-data:${FOUNDRY_MAJOR}`;
const MODULE_IMAGE   = process.env.E2E_MODULE_IMAGE || `localhost/simulacrum-foundry-e2e-module:${FOUNDRY_MAJOR}`;

const SEED_CONTAINER = `fvtt-seed-builder-${FOUNDRY_MAJOR}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectEngine() {
  for (const engine of ['podman', 'docker', 'nerdctl', 'finch']) {
    try { execFileSync(engine, ['--version'], { stdio: 'pipe' }); return engine; }
    catch { /* try next */ }
  }
  console.error('ERROR: No container engine found.');
  process.exit(1);
}

function findFoundryZip(major) {
  if (!existsSync(VENDOR_DIR)) return null;
  const zip = readdirSync(VENDOR_DIR)
    .filter(f => f.toLowerCase().endsWith('.zip'))
    .find(f => new RegExp(`${major}\\.`, 'i').test(f));
  return zip ? join(VENDOR_DIR, zip) : null;
}

function versionFromZip(zipPath) {
  const m = basename(zipPath).match(/(\d+\.\d+)/);
  return m ? m[1] : null;
}

function resolveLicenseB64() {
  const explicit = process.env.FOUNDRY_LICENSE_JSON_PATH;
  if (explicit && existsSync(explicit)) return readFileSync(explicit).toString('base64');

  const defaults = {
    win32:  join(process.env.LOCALAPPDATA || '', 'FoundryVTT', 'Config', 'license.json'),
    darwin: join(os.homedir(), 'Library', 'Application Support', 'FoundryVTT', 'Config', 'license.json'),
    linux:  join(os.homedir(), '.local', 'share', 'FoundryVTT', 'Config', 'license.json'),
  };
  const p = defaults[process.platform];
  if (p && existsSync(p)) return readFileSync(p).toString('base64');
  return null;
}

function run(engine, args, opts = {}) {
  const result = spawnSync(engine, args, { stdio: 'inherit', ...opts });
  if (result.status !== 0) {
    console.error(`ERROR: ${engine} ${args[0]} exited ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const engine = detectEngine();
console.log(`[seed-build] Engine:        ${engine}`);
console.log(`[seed-build] Test image:    ${TEST_IMAGE}`);
console.log(`[seed-build] Data image:    ${DATA_IMAGE}`);
console.log(`[seed-build] Module image:  ${MODULE_IMAGE}`);

const foundryZip = findFoundryZip(FOUNDRY_MAJOR);
if (!foundryZip) {
  console.error(`ERROR: No Foundry zip found in ${VENDOR_DIR} for major version ${FOUNDRY_MAJOR}`);
  process.exit(1);
}
const foundryVersion = versionFromZip(foundryZip);
console.log(`[seed-build] Foundry zip:   ${basename(foundryZip)} (${foundryVersion})`);

const licenseB64 = process.env.FOUNDRY_LICENSE_JSON_B64 || resolveLicenseB64();
if (!licenseB64) {
  console.error('ERROR: No license.json found — cannot seed EULA acceptance.');
  console.error('       Set FOUNDRY_LICENSE_JSON_B64 or ensure Foundry is installed locally.');
  process.exit(1);
}

// Clean up any leftover seed container from a previous failed run
try { execFileSync(engine, ['rm', '-f', SEED_CONTAINER], { stdio: 'pipe' }); } catch { /* fine */ }

const extractDir = join(REPO_ROOT, `.tmp-seed-data-${FOUNDRY_MAJOR}`);
try {
  // ── Step 1: Run the seed script inside the test container ──────────────────
  console.log('\n[seed-build] Step 1: Running seed-data.js inside test container...');
  run(engine, [
    'run',
    '--name', SEED_CONTAINER,
    '--entrypoint', '/bin/bash',     // bypass entrypoint.sh — seed-data.js installs Foundry itself
    '--volume', `${VENDOR_DIR}:/foundry-cache`,
    '--volume', `${REPO_ROOT}:/workspace`,
    '--volume', '/workspace/node_modules', // anonymous vol: Linux packages, don't leak to Windows host
    '--env', `CONTAINER_CACHE=/foundry-cache`,
    '--env', `FOUNDRY_VERSION=${foundryVersion}`,
    '--env', `FOUNDRY_LICENSE_JSON_B64=${licenseB64}`,
    '--env', `FOUNDRY_ADMIN_KEY=${process.env.FOUNDRY_ADMIN_KEY || 'seed-admin-key'}`,
    '--env', `TEST_SYSTEM_IDS=${process.env.TEST_SYSTEM_IDS || 'dnd5e'}`,
    '--workdir', '/workspace',
    TEST_IMAGE,
    '-c', 'npm ci --silent && node tests/e2e/scripts/seed-data.js',
  ]);

  // ── Step 2: Extract /data from the seed container ──────────────────────────
  console.log('\n[seed-build] Step 2: Extracting /data from seed container...');
  if (existsSync(extractDir)) rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });
  run(engine, ['cp', `${SEED_CONTAINER}:/data/.`, extractDir]);
  console.log(`[seed-build] Extracted to ${extractDir}`);

  // ── Step 3: Build the data image ───────────────────────────────────────────
  // data.Dockerfile does COPY . / so the image root contains Config/ and Data/
  // directly. --mount type=image,dst=/data then lands them at /data/Config/ etc.
  console.log('\n[seed-build] Step 3: Building data image...');
  run(engine, [
    'build',
    '--file', join(DOCKER_DIR, 'data.Dockerfile'),
    '--tag', DATA_IMAGE,
    extractDir,
  ]);
  console.log(`[seed-build] Data image built: ${DATA_IMAGE}`);

  // ── Step 4: Build the module image ─────────────────────────────────────────
  // module.Dockerfile does COPY . / so the image root contains module.json etc.
  // --mount type=image,dst=/data/Data/modules/simulacrum lands them correctly.
  console.log('\n[seed-build] Step 4: Building module image...');

  const moduleDir = join(REPO_ROOT, `.tmp-module-${FOUNDRY_MAJOR}`);
  if (existsSync(moduleDir)) rmSync(moduleDir, { recursive: true, force: true });
  mkdirSync(moduleDir, { recursive: true });

  for (const entry of ['module.json', 'scripts', 'styles', 'templates', 'lang']) {
    const src = join(REPO_ROOT, entry);
    if (existsSync(src)) cpSync(src, join(moduleDir, entry), { recursive: true });
  }
  if (existsSync(join(REPO_ROOT, 'assets'))) {
    cpSync(join(REPO_ROOT, 'assets'), join(moduleDir, 'assets'), { recursive: true });
  }

  run(engine, [
    'build',
    '--file', join(DOCKER_DIR, 'module.Dockerfile'),
    '--tag', MODULE_IMAGE,
    moduleDir,
  ]);
  console.log(`[seed-build] Module image built: ${MODULE_IMAGE}`);

  rmSync(moduleDir, { recursive: true, force: true });

} finally {
  // ── Cleanup ────────────────────────────────────────────────────────────────
  console.log('\n[seed-build] Cleaning up...');
  try { execFileSync(engine, ['rm', '-f', SEED_CONTAINER], { stdio: 'pipe' }); } catch { /* fine */ }
  if (existsSync(extractDir)) rmSync(extractDir, { recursive: true, force: true });
}

console.log('\n[seed-build] Done.');
console.log(`  Data image:   ${DATA_IMAGE}`);
console.log(`  Module image: ${MODULE_IMAGE}`);
