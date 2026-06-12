import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

const SYSTEM_MANIFEST_URLS = {
  dnd5e: 'https://github.com/foundryvtt/dnd5e/releases/latest/download/system.json',
  pf2e: 'https://github.com/foundryvtt/pf2e/releases/latest/download/system.json',
};

export function getSystemManifestUrl(systemId, env = process.env) {
  const envKey = `TEST_SYSTEM_${systemId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_MANIFEST_URL`;
  return env[envKey] || SYSTEM_MANIFEST_URLS[systemId];
}

export async function installSystemPackage(systemId, systemsDir, options = {}) {
  const manifestUrl = options.manifestUrl || getSystemManifestUrl(systemId, options.env);

  if (!manifestUrl) {
    throw new Error(
      `No manifest URL configured for system "${systemId}". Set TEST_SYSTEM_${systemId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_MANIFEST_URL.`
    );
  }

  mkdirSync(systemsDir, { recursive: true });

  const manifest = await fetchJson(manifestUrl);
  if (manifest.id !== systemId) {
    throw new Error(`Manifest ${manifestUrl} has id "${manifest.id}", expected "${systemId}"`);
  }

  if (!manifest.download) {
    throw new Error(`Manifest ${manifestUrl} does not define a download URL`);
  }

  const targetDir = join(systemsDir, systemId);
  const zipPath = join(systemsDir, `.${systemId}-${Date.now()}.zip`);
  const extractDir = join(systemsDir, `.${systemId}-extract-${Date.now()}`);

  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
  }

  try {
    mkdirSync(extractDir, { recursive: true });
    await downloadFile(manifest.download, zipPath);
    execFileSync('unzip', ['-q', zipPath, '-d', extractDir], { stdio: 'pipe' });

    const extractedSystemDir = findExtractedSystemDir(extractDir, systemId);
    renameSync(extractedSystemDir, targetDir);
  } finally {
    if (existsSync(zipPath)) {
      rmSync(zipPath, { force: true });
    }
    if (existsSync(extractDir)) {
      rmSync(extractDir, { recursive: true, force: true });
    }
  }

  if (!existsSync(join(targetDir, 'system.json'))) {
    throw new Error(`System package ${systemId} did not extract to ${targetDir}`);
  }

  return {
    systemId,
    version: manifest.version,
    manifestUrl,
    downloadUrl: manifest.download,
  };
}

function findExtractedSystemDir(extractDir, systemId) {
  if (existsSync(join(extractDir, 'system.json'))) {
    return extractDir;
  }

  const expectedNestedDir = join(extractDir, systemId);
  if (existsSync(join(expectedNestedDir, 'system.json'))) {
    return expectedNestedDir;
  }

  const entries = readdirSync(extractDir, { withFileTypes: true });
  const candidate = entries.find(entry => {
    return entry.isDirectory() && existsSync(join(extractDir, entry.name, 'system.json'));
  });

  if (candidate) {
    return join(extractDir, candidate.name);
  }

  const names = entries.map(entry => entry.name).join(', ');
  throw new Error(
    `Unable to find system.json for ${systemId} in extracted package. Entries: ${names}`
  );
}

async function fetchJson(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }
  return response.json();
}

async function downloadFile(url, path) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(path, buffer);
}
