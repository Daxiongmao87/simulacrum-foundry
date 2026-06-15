#!/usr/bin/env node
/**
 * Seed the Foundry /data directory for the e2e container image.
 *
 * Runs INSIDE the test container (simulacrum-foundry-e2e:N).
 * Called by build-seed.js via `podman run --entrypoint node ... seed-data.js`.
 *
 * Produces a seeded /data containing:
 *   - Config/license.json  — EULA accepted for this container's hardware fingerprint
 *   - Config/options.json  — placeholder config (port/dataPath patched at test time)
 *   - Data/systems/<id>/   — game system installed
 *   - Data/modules/simulacrum/ — module deployed from current workspace
 *   - Data/worlds/seed-world/  — test world pre-created on disk
 */

import { spawn, execFileSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';
import { pollForServer, pollUntilGone } from '../fixtures/poll-utils.js';
import { killAndWait } from '../fixtures/platform-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../../..');
const INSTALL_DIR = '/home/node/resources/app';
const DATA_DIR = process.env.FOUNDRY_DATA_DIR || '/data';
const CONTAINER_CACHE = process.env.CONTAINER_CACHE || '/foundry-cache';
const SYSTEM_ID = (process.env.TEST_SYSTEM_IDS || 'dnd5e').split(',')[0].trim();
const ADMIN_KEY = process.env.FOUNDRY_ADMIN_KEY || 'seed-admin-key';
const SEED_PORT = 32765;
const BASE_URL = `http://localhost:${SEED_PORT}`;

function log(msg) { console.log(`[seed] ${msg}`); }
function err(msg) { console.error(`[seed] ERROR: ${msg}`); }

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Download and extract a game system directly — no Foundry UI required.
 * Foundry v13 discovers systems by scanning the filesystem on startup.
 */
async function installSystem(systemsDir, systemId) {
  const manifestUrls = {
    dnd5e: 'https://raw.githubusercontent.com/foundryvtt/dnd5e/master/system.json',
    pf2e:  'https://github.com/foundryvtt/pf2e/releases/latest/download/system.json',
  };
  const manifestUrl = manifestUrls[systemId];
  if (!manifestUrl) throw new Error(`No manifest URL known for system: ${systemId}`);

  log(`Fetching manifest for ${systemId}...`);
  const manifestResp = await fetch(manifestUrl);
  if (!manifestResp.ok) throw new Error(`Manifest fetch failed: ${manifestResp.status} ${manifestUrl}`);
  const manifest = await manifestResp.json();
  const downloadUrl = manifest.download;
  if (!downloadUrl) throw new Error(`No download URL in manifest for ${systemId}`);

  log(`Downloading ${systemId} from ${downloadUrl}...`);
  const downloadResp = await fetch(downloadUrl);
  if (!downloadResp.ok) throw new Error(`Download failed: ${downloadResp.status} ${downloadUrl}`);

  const zipPath = `/tmp/${systemId}.zip`;
  writeFileSync(zipPath, Buffer.from(await downloadResp.arrayBuffer()));
  log(`Downloaded ${systemId} (${(existsSync(zipPath) ? readFileSync(zipPath).length / 1024 / 1024 : 0).toFixed(1)} MB)`);

  const tmpExtract = `/tmp/${systemId}-extract`;
  execFileSync('rm', ['-rf', tmpExtract]);
  mkdirSync(tmpExtract, { recursive: true });
  execFileSync('unzip', ['-q', zipPath, '-d', tmpExtract]);

  // Some packages zip with a subdirectory; detect and flatten
  const entries = readdirSync(tmpExtract);
  const targetDir = join(systemsDir, systemId);
  mkdirSync(targetDir, { recursive: true });
  if (entries.length === 1 && existsSync(join(tmpExtract, entries[0], 'system.json'))) {
    cpSync(join(tmpExtract, entries[0]), targetDir, { recursive: true });
  } else {
    cpSync(tmpExtract, targetDir, { recursive: true });
  }

  execFileSync('rm', ['-rf', tmpExtract, zipPath]);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Resolve Foundry version
  let foundryVersion = process.env.FOUNDRY_VERSION || '';
  if (!foundryVersion) {
    const zips = readdirSync(CONTAINER_CACHE).filter(f => /foundryvtt-\d+\.\d+\.zip/i.test(f));
    if (!zips.length) { err(`No Foundry zip in ${CONTAINER_CACHE}`); process.exit(1); }
    foundryVersion = zips[0].match(/(\d+\.\d+)/)[1];
  }
  log(`Foundry version: ${foundryVersion}`);

  // 2. Install Foundry binary
  if (!existsSync(join(INSTALL_DIR, 'main.mjs'))) {
    const zip = join(CONTAINER_CACHE, `foundryvtt-${foundryVersion}.zip`);
    if (!existsSync(zip)) { err(`Zip not found: ${zip}`); process.exit(1); }
    log(`Extracting Foundry from ${basename(zip)}...`);
    execFileSync('unzip', ['-q', zip, '-d', INSTALL_DIR]);
    log('Extraction complete.');
  } else {
    log('Foundry already extracted.');
  }

  // 3. Prepare data directory
  const configDir   = join(DATA_DIR, 'Config');
  const userDataDir = join(DATA_DIR, 'Data');
  const modulesDir  = join(userDataDir, 'modules');
  const systemsDir  = join(userDataDir, 'systems');
  const worldsDir   = join(userDataDir, 'worlds');

  for (const d of [configDir, modulesDir, systemsDir, worldsDir]) {
    mkdirSync(d, { recursive: true });
  }

  // License — write from env so EULA is pre-accepted with this container's fingerprint
  const licenseB64 = process.env.FOUNDRY_LICENSE_JSON_B64;
  if (licenseB64) {
    writeFileSync(join(configDir, 'license.json'), Buffer.from(licenseB64, 'base64'));
    log('License written from FOUNDRY_LICENSE_JSON_B64.');
  } else {
    log('WARNING: No FOUNDRY_LICENSE_JSON_B64 — EULA will be prompted.');
  }

  // Placeholder options.json — port/dataPath are patched at test-run time
  writeFileSync(join(configDir, 'options.json'), JSON.stringify({
    dataPath: DATA_DIR,
    port: SEED_PORT,
    upnp: false,
    adminKey: ADMIN_KEY,
  }, null, 2));

  // 4. Deploy module
  log('Deploying module...');
  const moduleTarget = join(modulesDir, 'simulacrum');
  mkdirSync(moduleTarget, { recursive: true });
  for (const entry of ['module.json', 'scripts', 'styles', 'templates', 'lang']) {
    const src = join(REPO_ROOT, entry);
    if (existsSync(src)) cpSync(src, join(moduleTarget, entry), { recursive: true });
  }
  if (existsSync(join(REPO_ROOT, 'assets'))) {
    cpSync(join(REPO_ROOT, 'assets'), join(moduleTarget, 'assets'), { recursive: true });
  }
  log('Module deployed.');

  // 5. Start Foundry
  log(`Starting Foundry on port ${SEED_PORT}...`);
  const server = spawn('node', [join(INSTALL_DIR, 'main.mjs'), `--dataPath=${DATA_DIR}`, `--port=${SEED_PORT}`], {
    cwd: INSTALL_DIR,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  server.stdout.on('data', d => { const m = d.toString().trim(); if (m) log(`foundry: ${m}`); });
  server.stderr.on('data', d => { const m = d.toString().trim(); if (m) log(`foundry: ${m}`); });

  await pollForServer(BASE_URL, { timeout: 60000 });
  log('Foundry ready.');

  // 6. Browser automation — EULA + system install
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  try {
    await page.goto(`${BASE_URL}/setup`);
    await page.waitForLoadState('networkidle');

    // License key prompt means no license.json was provided — abort
    const licenseInput = page.locator('input[name="licenseKey"]');
    if (await licenseInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      log('License key prompt — no FOUNDRY_LICENSE_JSON_B64 was provided.');
      process.exitCode = 1;
      return; // valid inside an async function
    }

    // EULA (hardware fingerprint mismatch inside container)
    const eulaCheckbox = page.getByRole('checkbox', { name: /I agree/i });
    if (await eulaCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      log('Accepting EULA...');
      await eulaCheckbox.check();
      await page.locator('button:has-text("Agree"):not(:has-text("Decline"))').first().click();
      await page.waitForLoadState('networkidle');
      log('EULA accepted.');
    }

    // Dismiss usage-data / consent dialogs
    for (let i = 0; i < 5; i++) {
      const decline = page.locator('dialog[open] button[data-action="no"], button:has-text("Decline Sharing")').first();
      if (await decline.isVisible({ timeout: 500 }).catch(() => false)) {
        await decline.click({ force: true }).catch(() => {});
        await page.waitForTimeout(200);
      } else break;
    }

    // Dismiss tour overlay
    await page.keyboard.press('Escape');
    await pollUntilGone(page, '.tour-overlay', { timeout: 2000 }).catch(() => {});

    // Install system (direct download — no UI, Foundry discovers on next startup)
    if (!existsSync(join(systemsDir, SYSTEM_ID))) {
      log(`Installing system: ${SYSTEM_ID}...`);
      await installSystem(systemsDir, SYSTEM_ID);
      log(`System ${SYSTEM_ID} installed.`);
    } else {
      log(`System ${SYSTEM_ID} already present.`);
    }

    // Collect the installed system version for the world manifest
    let systemVersion = '1.0.0';
    try {
      const sysJson = JSON.parse(readFileSync(join(systemsDir, SYSTEM_ID, 'system.json'), 'utf-8'));
      systemVersion = sysJson.version ?? '1.0.0';
    } catch { /* use default */ }

    // Pre-create world on disk — Foundry picks it up on next /setup load
    const worldId = 'seed-world';
    const worldDir = join(worldsDir, worldId);
    if (!existsSync(worldDir)) {
      mkdirSync(worldDir, { recursive: true });
      const major = parseInt(foundryVersion, 10);
      writeFileSync(join(worldDir, 'world.json'), JSON.stringify({
        id: worldId,
        name: worldId,
        title: 'Seed World',
        version: '1.0.0',
        system: SYSTEM_ID,
        coreVersion: foundryVersion,
        compatibility: { minimum: String(major), verified: String(major) },
        systemVersion,
        description: '',
        flags: {},
      }, null, 2));
      log(`World pre-created: ${worldId}`);
    }

  } finally {
    await ctx.close();
    await browser.close();
  }

  // 7. Stop Foundry
  log('Stopping Foundry...');
  await killAndWait(server, { escalateAfterMs: 3000, timeoutMs: 10000 });
  log('Foundry stopped. Seed complete.');
}

main().catch(e => {
  err(e.message || String(e));
  process.exit(1);
});
