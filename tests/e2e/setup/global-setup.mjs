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

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  installSystemPackage,
  validateInstalledSystemPackage,
} from '../fixtures/package-install.mjs';
import {
  externalBrokerConfiguration,
  findFoundryDistribution,
  removeGovernedRuntimeRoot,
  resolveFoundryEnvironment,
  selectFoundryRuntimeRoot,
} from '../fixtures/agentic-foundry-inputs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
const TEST_ENV_PATH = join(ROOT, 'tests/e2e/.env.test');
const FOUNDRY_VENDOR_DIR = join(ROOT, 'vendor/foundry');
let systemCacheRoot = join(ROOT, '.foundry-system-cache');

function loadEnv() {
  return resolveFoundryEnvironment({
    environment: process.env,
    localPath: TEST_ENV_PATH,
  });
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
  return join(systemCacheRoot, foundryVersion);
}

/**
 * Global Setup - Validation Only
 */
export default async function globalSetup() {
  console.log('============================================================');
  console.log('[setup] Simulacrum E2E Test Setup (Validation Only)');
  console.log('============================================================');

  // 1. Load and validate environment
  const env = loadEnv();
  if (externalBrokerConfiguration(env)) {
    console.log('[setup] External broker mode: licensed stores and lifecycle are provider-owned.');
    return;
  }
  let governedRuntimeRoot = null;
  try {
    if (env.ADP_ARTIFACT_DIR) {
      governedRuntimeRoot = selectFoundryRuntimeRoot({
        artifactRoot: env.ADP_ARTIFACT_DIR,
        requestedPath: env.TEST_TMPFS_PATH,
        fallbackRoot: ROOT,
        ownerId: env.AGENTIC_DELIVERY_RUN_ID,
      });
      systemCacheRoot = join(governedRuntimeRoot, 'system-cache');
    }
    await completeGlobalSetup(env);
  } catch (error) {
    if (governedRuntimeRoot) {
      removeGovernedRuntimeRoot(
        governedRuntimeRoot,
        env.ADP_ARTIFACT_DIR,
        env.AGENTIC_DELIVERY_RUN_ID
      );
    }
    throw error;
  }
}

async function completeGlobalSetup(env) {
  const systemIds = parseSystemIds(env);
  const foundryVersions = parseFoundryVersions(env);

  console.log(`[setup] Systems to test: ${systemIds.join(', ')}`);
  console.log(`[setup] Foundry versions to test: ${foundryVersions.join(', ')}`);

  // 2. Validate Foundry zips exist
  const foundryZips = foundryVersions.map(foundryVersion => {
    findFoundryDistribution(foundryVersion, {
      environment: env,
      vendorDirectory: FOUNDRY_VENDOR_DIR,
    });
    console.log(`[setup] Foundry ${foundryVersion} distribution: configured`);
    return { foundryVersion };
  });

  // 3. Validate license key exists
  if (!env.FOUNDRY_LICENSE_KEY) {
    throw new Error('FOUNDRY_LICENSE_KEY is not configured');
  }
  console.log('[setup] License key: configured');

  // 4. Package the module once (this is safe to share between tests)
  console.log('[setup] Packaging Simulacrum module...');
  try {
    execFileSync('node', ['tools/package-module.js'], {
      cwd: ROOT,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    console.log('[setup] Module packaged successfully');
  } catch (error) {
    throw new Error(`module packaging failed: ${error.message}`, { cause: error });
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
