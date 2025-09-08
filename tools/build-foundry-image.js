#!/usr/bin/env node

/**
 * Build a local Docker image for FoundryVTT using a provided Node zip.
 * Falls back to an existing v13 zip from your prior project if not provided.
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, rmSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const res = { zip: null, version: 'v13', tag: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '--zip' || a === '-z') && args[i+1]) res.zip = args[++i];
    else if ((a === '--version' || a === '-v') && args[i+1]) res.version = args[++i];
    else if (a === '--tag' && args[i+1]) res.tag = args[++i];
  }
  return res;
}

function discoverDefaultZip(version) {
  // Expect developer to place zips in vendor/foundry
  const defaultPath = resolve(ROOT, 'vendor/foundry');
  try {
    const entries = readdirSync(defaultPath).filter(f => f.toLowerCase().endsWith('.zip'));
    if (entries.length) return resolve(defaultPath, entries[0]);
  } catch {}
  return null;
}

function main() {
  const { zip, version, tag } = parseArgs();
  const zipPath = zip ? resolve(zip) : discoverDefaultZip(version);
  if (!zipPath || !existsSync(zipPath)) {
    console.error('FoundryVTT zip not found. Place it in vendor/foundry or pass --zip <path/to/FoundryVTT-Node-*.zip>');
    process.exit(1);
  }

  // Package module into dist first
  console.log('[build] Packaging module...');
  execSync('node tools/package-module.js', { stdio: 'inherit', cwd: ROOT });

  // Prepare build context cache
  const cacheDir = join(ROOT, '.foundry-cache', version);
  mkdirSync(cacheDir, { recursive: true });
  const cachedZip = join(cacheDir, 'FoundryVTT.zip');
  copyFileSync(zipPath, cachedZip);

  const imageTag = tag || `${version}-local`;
  const imageName = `simulacrum-foundry:${imageTag}`;

  const dockerfile = 'tools/docker/Dockerfile.foundry';
  const mainJsPath = '/app/main.js';

  console.log(`[build] Building image ${imageName} from ${zipPath}`);
  const relZip = ['.foundry-cache', version, 'FoundryVTT.zip'].join('/');
  execSync(
    `docker build -f ${dockerfile} --build-arg FOUNDRY_VERSION_ZIP=${relZip} ` +
    `--build-arg FOUNDRY_MAIN_JS_PATH=${mainJsPath} ` +
    `-t ${imageName} .`,
    { stdio: 'inherit', cwd: ROOT }
  );

  // Optional cleanup: keep cache so subsequent builds are fast
  console.log('[build] Image built:', imageName);
}

try { main(); } catch (e) { console.error('[build] Failed:', e.message); process.exit(1); }
