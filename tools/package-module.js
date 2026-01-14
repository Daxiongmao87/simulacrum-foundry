#!/usr/bin/env node

/**
 * Package the module into dist/<module-id>-<version>.zip
 * Minimal, no dependencies: shells out to `zip`.
 */

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..';
const moduleJsonPath = join(ROOT, 'module.json');
if (!existsSync(moduleJsonPath)) {
  console.error('module.json not found at project root');
  process.exit(1);
}

const moduleJson = JSON.parse(readFileSync(moduleJsonPath, 'utf-8'));
const moduleId = moduleJson.id || moduleJson.name || 'simulacrum';
const version = moduleJson.version || '0.0.0';

const distDir = join(ROOT, 'dist');
try { mkdirSync(distDir, { recursive: true }); } catch { }

const zipName = `${moduleId}-${version}.zip`;
const zipPath = join(distDir, zipName);

const include = [
  'module.json',
  'README.md',
  'scripts',
  'styles',
  'templates',
  'lang',
  'assets',
  'packs'
].filter((p) => existsSync(join(ROOT, p)));

console.log(`[pack] Packaging ${moduleId}@${version} -> ${zipPath}`);

try {
  // Build zip with reproducible path
  const cmd = `cd ${ROOT} && zip -r -q ${zipPath} ${include.join(' ')} -x "*LOCK*"`;
  execSync(cmd, { stdio: 'inherit' });
  console.log(`[pack] Created ${zipPath}`);
} catch (err) {
  console.error('[pack] Failed to create zip:', err.message);
  process.exit(1);
}
