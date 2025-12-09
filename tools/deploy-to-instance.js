#!/usr/bin/env node

/**
 * Deploy the Simulacrum module into a running FoundryVTT container.
 * Copies project root into /data/Data/modules/<id> (overwrites existing).
 *
 * Usage:
 *   node tools/deploy-to-instance.js --container foundry-v13-30001
 *
 * Invoked via npm script:
 *   npm run deploy:module -- --container <name-or-id>
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const res = { container: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '--container' || a === '-c') && args[i + 1]) res.container = args[++i];
  }
  if (!res.container) {
    console.error('Usage: node tools/deploy-to-instance.js --container <name-or-id>');
    process.exit(1);
  }
  return res;
}

function getModuleId() {
  const moduleJsonPath = join(ROOT, 'module.json');
  if (!existsSync(moduleJsonPath)) throw new Error('module.json not found');
  const moduleJson = JSON.parse(readFileSync(moduleJsonPath, 'utf-8'));
  return moduleJson.id || moduleJson.name || 'simulacrum';
}

function main() {
  const { container } = parseArgs();
  const id = getModuleId();
  const dest = `/data/Data/modules/${id}`;
  console.log(`[deploy] Target container: ${container}`);
  console.log(`[deploy] Deploying to ${dest}`);

  // Ensure destination exists
  execSync(`docker exec ${container} mkdir -p ${dest}`, { stdio: 'inherit' });
  // Copy project files
  execSync(`docker cp ${ROOT}/module.json ${container}:${dest}/module.json`, { stdio: 'inherit' });
  for (const dir of ['scripts', 'styles', 'templates', 'lang', 'assets', 'packs']) {
    const src = join(ROOT, dir);
    try {
      if (existsSync(src)) {
        execSync(`docker cp ${src} ${container}:${dest}/`, { stdio: 'inherit' });
      }
    } catch { }
  }
  // Force-clear the LevelDB cache for macros to ensure .db modifications are picked up
  try {
    const packsDest = `${dest}/packs/macros`;
    console.log(`[deploy] Clearing LevelDB cache at ${packsDest}`);
    execSync(`docker exec ${container} rm -rf ${packsDest}`, { stdio: 'inherit' });
  } catch (e) {
    console.warn('[deploy] Warning: Failed to clear LevelDB cache (might not exist yet)', e.message);
  }

  console.log('[deploy] Deployed successfully. Reload the Foundry page to see changes.');
}

try { main(); } catch (e) { console.error('[deploy] Failed:', e.message); process.exit(1); }
