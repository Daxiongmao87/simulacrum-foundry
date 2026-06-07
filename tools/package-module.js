#!/usr/bin/env node

/**
 * Package the module into dist/<module-id>-<version>.zip
 */

import { readFileSync, existsSync, mkdirSync, rmSync, statSync, readdirSync } from 'fs';
import { dirname, join, posix } from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';

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
try { mkdirSync(distDir, { recursive: true }); } catch { /* exists */ }

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
  'packs',
].filter(p => existsSync(join(ROOT, p)));

console.log(`[pack] Packaging ${moduleId}@${version} -> ${zipPath}`);

try { rmSync(zipPath); } catch { /* not present */ }

function shouldExclude(archivePath) {
  if (/LOCK/.test(archivePath)) return true;
  if (archivePath === 'packs/_source' || archivePath.startsWith('packs/_source/')) return true;
  return false;
}

function addDirectoryRecursive(zip, absDir, archiveDir) {
  for (const name of readdirSync(absDir)) {
    const absChild = join(absDir, name);
    const archiveChild = archiveDir ? posix.join(archiveDir, name) : name;
    if (shouldExclude(archiveChild)) continue;

    const stat = statSync(absChild);
    if (stat.isDirectory()) {
      addDirectoryRecursive(zip, absChild, archiveChild);
    } else if (stat.isFile()) {
      zip.addFile(archiveChild, readFileSync(absChild));
    }
  }
}

try {
  const zip = new AdmZip();

  for (const entry of include) {
    if (shouldExclude(entry)) continue;
    const absPath = join(ROOT, entry);
    const stat = statSync(absPath);
    if (stat.isDirectory()) {
      addDirectoryRecursive(zip, absPath, entry);
    } else {
      zip.addFile(entry, readFileSync(absPath));
    }
  }

  zip.writeZip(zipPath);
  console.log(`[pack] Created ${zipPath}`);
} catch (err) {
  console.error('[pack] Failed to create zip:', err.message);
  process.exit(1);
}
