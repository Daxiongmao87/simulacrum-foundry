import { execFileSync } from 'child_process';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';

const PACKAGE_OPERATION_MARKER = '.simulacrum-package-operation.json';

const SYSTEM_MANIFEST_URLS = {
  dnd5e: 'https://github.com/foundryvtt/dnd5e/releases/latest/download/system.json',
  pf2e: 'https://github.com/foundryvtt/pf2e/releases/latest/download/system.json',
};

export function getSystemManifestUrl(systemId, env = process.env) {
  const envKey = `TEST_SYSTEM_${systemId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_MANIFEST_URL`;
  return env[envKey] || SYSTEM_MANIFEST_URLS[systemId];
}

export class SystemManifestCompatibilityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SystemManifestCompatibilityError';
  }
}

export function validateInstalledSystemPackage(systemDir, systemId, foundryVersion) {
  const manifestPath = join(systemDir, 'system.json');

  if (!existsSync(manifestPath)) {
    throw new Error(`Cached system ${systemId} is missing ${manifestPath}`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  if (manifest.id !== systemId) {
    throw new Error(
      `Cached system ${manifestPath} has id "${manifest.id}", expected "${systemId}"`
    );
  }

  const compatibility = assertSystemManifestCompatibility(manifest, foundryVersion, manifestPath);
  return {
    systemId,
    version: manifest.version,
    compatibility,
  };
}

export function assertSystemManifestCompatibility(manifest, foundryVersion, source = 'manifest') {
  if (!foundryVersion) return null;

  const currentVersion = parseVersionParts(foundryVersion);
  if (!currentVersion) {
    throw new Error(`Invalid Foundry version "${foundryVersion}" for system compatibility check`);
  }

  const compatibility = getFoundryCompatibility(manifest);
  if (!hasCompatibilityDeclaration(compatibility)) {
    throw new SystemManifestCompatibilityError(
      `${source} does not declare Foundry compatibility for ${manifest.id || 'unknown system'}`
    );
  }

  const minimum = parseCompatibilityVersion(compatibility.minimum, 'minimum', source);
  if (minimum && compareVersionParts(currentVersion, minimum) < 0) {
    throw new SystemManifestCompatibilityError(
      `${source} requires Foundry ${compatibility.minimum} or newer; current Foundry is ${foundryVersion}`
    );
  }

  const maximum = parseCompatibilityVersion(compatibility.maximum, 'maximum', source);
  if (maximum && !isAtOrBelowMaximum(currentVersion, maximum)) {
    throw new SystemManifestCompatibilityError(
      `${source} supports Foundry ${compatibility.maximum} or older; current Foundry is ${foundryVersion}`
    );
  }

  return compatibility;
}

export async function installSystemPackage(systemId, systemsDir, options = {}) {
  const manifestUrl = options.manifestUrl || getSystemManifestUrl(systemId, options.env);

  if (!manifestUrl) {
    throw new Error(
      `No manifest URL configured for system "${systemId}". Set TEST_SYSTEM_${systemId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_MANIFEST_URL.`
    );
  }

  mkdirSync(systemsDir, { recursive: true });
  const targetDir = join(systemsDir, systemId);
  if (existsSync(targetDir)) {
    throw new Error(`Refusing to replace pre-existing system package directory ${targetDir}`);
  }

  const manifest = await fetchJson(manifestUrl);
  if (manifest.id !== systemId) {
    throw new Error(`Manifest ${manifestUrl} has id "${manifest.id}", expected "${systemId}"`);
  }

  const compatibility = assertSystemManifestCompatibility(
    manifest,
    options.foundryVersion,
    manifestUrl
  );

  if (!manifest.download) {
    throw new Error(`Manifest ${manifestUrl} does not define a download URL`);
  }

  await downloadAndExtractSystemPackage(manifest, systemId, systemsDir);

  return {
    systemId,
    version: manifest.version,
    manifestUrl,
    downloadUrl: manifest.download,
    compatibility,
  };
}

async function downloadAndExtractSystemPackage(manifest, systemId, systemsDir) {
  const targetDir = join(systemsDir, systemId);
  if (existsSync(targetDir)) {
    throw new Error(`Refusing to replace pre-existing system package directory ${targetDir}`);
  }

  const operationRoot = mkdtempSync(join(systemsDir, `.simulacrum-package-${safePart(systemId)}-`));
  const operationMarker = join(operationRoot, PACKAGE_OPERATION_MARKER);
  const operation = {
    schema_version: 1,
    owner: 'simulacrum-system-package-install',
    operation_root: operationRoot,
  };
  writeFileSync(operationMarker, `${JSON.stringify(operation)}\n`, { flag: 'wx', mode: 0o600 });
  const zipPath = join(operationRoot, 'package.zip');
  const extractDir = join(operationRoot, 'extract');
  let targetCreated = false;

  try {
    mkdirSync(extractDir);
    await downloadFile(manifest.download, zipPath);
    execFileSync('unzip', ['-q', zipPath, '-d', extractDir], { stdio: 'pipe' });

    const extractedSystemDir = findExtractedSystemDir(extractDir, systemId);
    if (existsSync(targetDir)) {
      throw new Error(`Refusing to replace concurrently-created system package ${targetDir}`);
    }
    renameSync(extractedSystemDir, targetDir);
    targetCreated = true;
    if (!existsSync(join(targetDir, 'system.json'))) {
      throw new Error(`System package ${systemId} did not extract to ${targetDir}`);
    }
  } catch (error) {
    if (targetCreated && existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true });
    }
    throw error;
  } finally {
    cleanPackageOperation(operationRoot, operation);
  }
}

function cleanPackageOperation(operationRoot, expected) {
  if (!existsSync(operationRoot)) return;
  const markerPath = join(operationRoot, PACKAGE_OPERATION_MARKER);
  try {
    const stat = lstatSync(operationRoot);
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      marker.schema_version !== expected.schema_version ||
      marker.owner !== expected.owner ||
      marker.operation_root !== operationRoot
    ) {
      throw new Error('operation ownership marker differs');
    }
  } catch (error) {
    throw new Error(`Refusing cleanup of unverified package operation ${operationRoot}: ${error.message}`);
  }
  rmSync(operationRoot, { recursive: true, force: true });
}

export function cacheInstalledSystemPackage(
  installedSystem,
  versionCacheDir,
  systemId,
  foundryVersion
) {
  validateInstalledSystemPackage(installedSystem, systemId, foundryVersion);
  mkdirSync(versionCacheDir, { recursive: true });
  const target = join(versionCacheDir, systemId);

  if (existsSync(target)) {
    try {
      const existing = validateInstalledSystemPackage(target, systemId, foundryVersion);
      return { status: 'reused', target, version: existing.version };
    } catch (error) {
      return { status: 'preserved-invalid', target, error: error.message };
    }
  }

  let targetCreated = false;
  try {
    mkdirSync(target);
    targetCreated = true;
    writeFileSync(
      join(target, '.simulacrum-cache-owned.json'),
      `${JSON.stringify({
        schema_version: 1,
        owner: 'simulacrum-system-cache',
        system_id: systemId,
        foundry_version: foundryVersion,
        cache_dir: target,
      })}\n`,
      { flag: 'wx', mode: 0o600 }
    );
    for (const entry of readdirSync(installedSystem)) {
      const source = join(installedSystem, entry);
      const destination = join(target, entry);
      if (existsSync(destination)) {
        throw new Error(`Refusing cache copy collision at ${destination}`);
      }
      cpEntry(source, destination);
    }
    const cached = validateInstalledSystemPackage(target, systemId, foundryVersion);
    return { status: 'created', target, version: cached.version };
  } catch (error) {
    if (targetCreated && existsSync(target)) {
      rmSync(target, { recursive: true, force: true });
    }
    throw error;
  }
}

function cpEntry(source, destination) {
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing symbolic link in installed system package: ${source}`);
  }
  if (stat.isDirectory()) {
    mkdirSync(destination);
    for (const entry of readdirSync(source)) {
      cpEntry(join(source, entry), join(destination, entry));
    }
    return;
  }
  if (!stat.isFile()) {
    throw new Error(`Refusing non-file system package entry: ${source}`);
  }
  const contents = readFileSync(source);
  writeFileSync(destination, contents, { flag: 'wx', mode: stat.mode & 0o777 });
}

function safePart(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/gu, '-').slice(0, 64) || 'system';
}

function getFoundryCompatibility(manifest) {
  const compatibility = manifest.compatibility || {};
  return {
    minimum: compatibility.minimum ?? manifest.minimumCoreVersion,
    verified: compatibility.verified ?? manifest.compatibleCoreVersion,
    maximum: compatibility.maximum ?? manifest.maximumCoreVersion,
  };
}

function hasCompatibilityDeclaration(compatibility) {
  return [compatibility.minimum, compatibility.verified, compatibility.maximum].some(hasValue);
}

function parseCompatibilityVersion(value, fieldName, source) {
  if (!hasValue(value)) return null;

  const parsed = parseVersionParts(value);
  if (!parsed) {
    throw new SystemManifestCompatibilityError(
      `${source} declares invalid Foundry compatibility ${fieldName} version "${value}"`
    );
  }

  return parsed;
}

function parseVersionParts(version) {
  const match = String(version ?? '')
    .trim()
    .match(/\d+(?:\.\d+)*/);

  if (!match) return null;

  return match[0].split('.').map(part => Number.parseInt(part, 10));
}

function compareVersionParts(left, right) {
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index] ?? 0;
    const rightPart = right[index] ?? 0;

    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1;
    }
  }

  return 0;
}

function isAtOrBelowMaximum(currentVersion, maximum) {
  if (currentVersion.length > maximum.length && startsWithVersion(currentVersion, maximum)) {
    return true;
  }

  return compareVersionParts(currentVersion, maximum) <= 0;
}

function startsWithVersion(version, prefix) {
  return prefix.every((part, index) => version[index] === part);
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
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
  writeFileSync(path, buffer, { flag: 'wx', mode: 0o600 });
}
