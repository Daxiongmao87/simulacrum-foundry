/**
 * Playwright Global Setup - MINIMAL
 *
 * This only does truly one-time validation work:
 * 1. Validates Foundry zip exists
 * 2. Validates license key exists
 * 3. Pre-caches game systems (to speed up per-test setup)
 *
 * Per-test setup (server start, world creation) is handled by fixtures.
 * This ensures each test is completely isolated.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  installSystemPackage,
  validateInstalledSystemPackage,
} from '../fixtures/package-install.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
const TEST_ENV_PATH = join(ROOT, 'tests/e2e/.env.test');
const FOUNDRY_VENDOR_DIR = join(ROOT, 'vendor/foundry');
const SYSTEM_CACHE_DIR = join(ROOT, '.foundry-system-cache');

/**
 * Load environment variables from .env.test
 */
function loadEnv() {
  const fileEnv = {};

  if (!existsSync(TEST_ENV_PATH)) {
    console.error(`[setup] ERROR: Missing ${TEST_ENV_PATH}`);
    console.error('[setup] Copy .env.test.example to .env.test and configure it.');
    process.exit(1);
  }

  const envContent = readFileSync(TEST_ENV_PATH, 'utf-8');

  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    fileEnv[key] = value;
  }

  return { ...fileEnv, ...process.env };
}

/**
 * Find the Foundry zip file in vendor/foundry/
 */
function findFoundryZip(foundryVersion) {
  if (!existsSync(FOUNDRY_VENDOR_DIR)) {
    console.error(`[setup] ERROR: Missing ${FOUNDRY_VENDOR_DIR}`);
    console.error('[setup] Create vendor/foundry/ and place your FoundryVTT zip file there.');
    process.exit(1);
  }

  const files = execSync(`ls -1 "${FOUNDRY_VENDOR_DIR}"`, { encoding: 'utf-8' })
    .split('\n')
    .filter(f => f.toLowerCase().endsWith('.zip'));

  const expectedZip = `FoundryVTT-Node-${foundryVersion}.zip`;
  const matchingZip = files.find(f => f === expectedZip);
  if (matchingZip) return join(FOUNDRY_VENDOR_DIR, matchingZip);

  if (files.length === 0) {
    console.error(`[setup] ERROR: No .zip file found in ${FOUNDRY_VENDOR_DIR}`);
    console.error('[setup] Download FoundryVTT and place the zip file in vendor/foundry/');
    process.exit(1);
  }

  console.error(`[setup] ERROR: Missing ${expectedZip} in ${FOUNDRY_VENDOR_DIR}`);
  console.error(`[setup] Available zips: ${files.join(', ')}`);
  process.exit(1);
}

/**
 * Parse system IDs from environment
 */
function parseSystemIds(env) {
  const systemIdsRaw = env.TEST_SYSTEM_IDS || env.TEST_SYSTEM_ID || 'dnd5e';
  return systemIdsRaw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Parse Foundry versions from environment
 */
function parseFoundryVersions(env) {
  const versionsRaw = env.TEST_FOUNDRY_VERSIONS || env.TEST_FOUNDRY_VERSION || '13.351';
  return versionsRaw
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function getSystemCacheDir(foundryVersion) {
  return join(SYSTEM_CACHE_DIR, foundryVersion);
}

/**
 * Global Setup - Validation Only
 */
export default async function globalSetup() {
  console.log('============================================================');
  console.log('[setup] Simulacrum E2E Test Setup (Validation Only)');
  console.log('============================================================');

  const env = loadEnv();
  if (env.ADP_FOUNDRY_ENDPOINT) {
    for (const name of ['ADP_FOUNDRY_ENDPOINT', 'ADP_FOUNDRY_SESSION_FILE']) {
      if (!env[name]) throw new Error(`External Foundry provider requires ${name}`);
    }
    console.log('[setup] External broker mode: licensed stores and lifecycle are provider-owned.');
    return;
  }

  // 1. Load and validate environment
  const systemIds = parseSystemIds(env);
  const foundryVersions = parseFoundryVersions(env);

  console.log(`[setup] Systems to test: ${systemIds.join(', ')}`);
  console.log(`[setup] Foundry versions to test: ${foundryVersions.join(', ')}`);

  // 2. Validate Foundry zips exist
  const foundryZips = foundryVersions.map(foundryVersion => {
    const foundryZip = findFoundryZip(foundryVersion);
    console.log(`[setup] Foundry ${foundryVersion} zip: ${foundryZip}`);
    return { foundryVersion, foundryZip };
  });

  // 3. Validate license key exists
  if (!env.FOUNDRY_LICENSE_KEY) {
    console.error('[setup] ERROR: FOUNDRY_LICENSE_KEY not set in .env.test');
    process.exit(1);
  }
  console.log('[setup] License key: configured');

  // 4. Package the module once (this is safe to share between tests)
  console.log('[setup] Packaging Simulacrum module...');
  try {
    execSync('node tools/package-module.js', {
      cwd: ROOT,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    console.log('[setup] Module packaged successfully');
  } catch (e) {
    console.error('[setup] ERROR packaging module:', e.message);
    process.exit(1);
  }

  // 5. Pre-cache systems per Foundry version (speeds up per-test setup significantly)
  for (const { foundryVersion } of foundryZips) {
    const versionCacheDir = getSystemCacheDir(foundryVersion);
    const needsCaching = [];

    for (const systemId of systemIds) {
      const cachedSystem = join(versionCacheDir, systemId);
      if (existsSync(cachedSystem)) {
        try {
          validateInstalledSystemPackage(cachedSystem, systemId, foundryVersion);
          console.log(`[setup] System ${systemId} already cached for Foundry ${foundryVersion}`);
        } catch (error) {
          needsCaching.push(systemId);
          console.log(
            `[setup] System ${systemId} cache is not usable for Foundry ${foundryVersion}: ${error.message}`
          );
        }
      } else {
        needsCaching.push(systemId);
        console.log(`[setup] System ${systemId} needs caching for Foundry ${foundryVersion}`);
      }
    }

    if (needsCaching.length > 0) {
      console.log(
        `[setup] Pre-caching ${needsCaching.length} system(s) for Foundry ${foundryVersion}...`
      );
      await preCacheSystems(needsCaching, foundryVersion, env);
    }
  }

  console.log('============================================================');
  console.log('[setup] Validation complete. Tests will each start their own Foundry instance.');
  console.log('============================================================');
}

/**
 * Pre-cache game systems in Foundry's expected Data/systems layout.
 */
async function preCacheSystems(systemIds, foundryVersion, env) {
  const versionCacheDir = getSystemCacheDir(foundryVersion);

  mkdirSync(versionCacheDir, { recursive: true });

  for (const systemId of systemIds) {
    console.log(`[cache] Installing system package ${systemId} for Foundry ${foundryVersion}...`);
    const result = await installSystemPackage(systemId, versionCacheDir, { env, foundryVersion });
    console.log(
      `[cache] Cached ${systemId} ${result.version || 'unknown version'} for Foundry ${foundryVersion}`
    );
  }
}
