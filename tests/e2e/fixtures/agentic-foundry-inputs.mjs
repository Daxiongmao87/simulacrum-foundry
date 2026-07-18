import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

const DISTRIBUTIONS = Object.freeze({
  13.351: {
    environmentKey: 'AGENTIC_DELIVERY_INPUT_FOUNDRY_V13_351_ZIP',
    filename: 'FoundryVTT-Node-13.351.zip',
  },
  14.364: {
    environmentKey: 'AGENTIC_DELIVERY_INPUT_FOUNDRY_V14_364_ZIP',
    filename: 'FoundryVTT-Node-14.364.zip',
  },
});

const RUNTIME_OWNER_MARKER = '.simulacrum-runtime-owner.json';
const RUNTIME_OWNER = 'simulacrum-foundry-e2e-runtime';

function requireAbsoluteRegularFile(path, description) {
  if (!isAbsolute(path)) {
    throw new Error(`${description} must be an absolute path`);
  }

  let status;
  try {
    status = lstatSync(path);
  } catch {
    throw new Error(`${description} is unavailable`);
  }
  if (status.isSymbolicLink() || !status.isFile()) {
    throw new Error(`${description} must be a regular non-symbolic file`);
  }
  return path;
}

function parseEnvironmentFile(path) {
  const values = {};
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed
      .slice(0, separator)
      .replace(/^export\s+/u, '')
      .trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    values[key] = rawValue.replace(/^(?:"(.*)"|'(.*)')$/u, '$1$2');
  }
  return values;
}

export function loadFoundryEnvironment({ environment = process.env, localPath } = {}) {
  const externalPath = environment.AGENTIC_DELIVERY_INPUT_FOUNDRY_TEST_ENV;
  const selectedPath = externalPath || localPath;
  if (!selectedPath) return {};

  if (!externalPath && !existsSync(selectedPath)) return {};
  return parseEnvironmentFile(
    requireAbsoluteRegularFile(selectedPath, 'Foundry test environment input')
  );
}

export function resolveFoundryEnvironment({ environment = process.env, localPath } = {}) {
  return {
    ...loadFoundryEnvironment({ environment, localPath }),
    ...environment,
  };
}

export function externalBrokerConfiguration(environment) {
  const baseUrl = environment.ADP_FOUNDRY_ENDPOINT;
  if (!baseUrl) return null;

  for (const name of ['ADP_FOUNDRY_SESSION_FILE', 'ADP_FOUNDRY_VERSION', 'ADP_GAME_SYSTEM']) {
    if (!environment[name]) {
      throw new Error(`External Foundry provider requires ${name}`);
    }
  }
  return {
    baseUrl,
    sessionPath: environment.ADP_FOUNDRY_SESSION_FILE,
    foundryVersion: environment.ADP_FOUNDRY_VERSION,
    systemId: environment.ADP_GAME_SYSTEM,
  };
}

export function playwrightResultsPath(environment, repositoryRoot) {
  return environment.ADP_ARTIFACT_DIR
    ? join(resolve(environment.ADP_ARTIFACT_DIR), 'reports', 'results.json')
    : join(resolve(repositoryRoot), 'tests/e2e/reports/results.json');
}

export function findFoundryDistribution(
  version,
  { environment = process.env, vendorDirectory } = {}
) {
  const definition = DISTRIBUTIONS[version];
  if (!definition) {
    if (/^[0-9]+\.[0-9]+$/u.test(version) && vendorDirectory) {
      const localPath = join(vendorDirectory, `FoundryVTT-Node-${version}.zip`);
      if (existsSync(localPath)) {
        return requireAbsoluteRegularFile(localPath, `Foundry ${version} distribution input`);
      }
    }
    throw new Error(`unsupported Foundry version: ${version}`);
  }

  const externalPath = environment[definition.environmentKey];
  if (externalPath) {
    return requireAbsoluteRegularFile(externalPath, `Foundry ${version} distribution input`);
  }

  if (!vendorDirectory) {
    throw new Error(`Foundry ${version} distribution input is unavailable`);
  }
  const localPath = join(vendorDirectory, definition.filename);
  return requireAbsoluteRegularFile(localPath, `Foundry ${version} distribution input`);
}

export function probeExecutableDirectory(directory) {
  let probeDirectory = null;
  try {
    probeDirectory = mkdtempSync(join(directory, '.simulacrum-exec-check-'));
    const executable = join(probeDirectory, 'true');
    copyFileSync('/bin/true', executable);
    chmodSync(executable, 0o700);
    execFileSync(executable, [], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  } finally {
    if (probeDirectory) {
      rmSync(probeDirectory, { recursive: true, force: true });
    }
  }
}

function requireAbsoluteDirectory(path, description) {
  if (!isAbsolute(path)) {
    throw new Error(`${description} must be an absolute path`);
  }

  let status;
  try {
    status = lstatSync(path);
  } catch {
    throw new Error(`${description} is unavailable`);
  }
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`${description} must be a non-symbolic directory`);
  }
  return path;
}

function requireRuntimeOwnerId(ownerId) {
  if (typeof ownerId !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/u.test(ownerId)) {
    throw new Error('governed Foundry runtime owner ID is unavailable or invalid');
  }
  return ownerId;
}

function readRuntimeOwnership(runtimeRoot) {
  const markerPath = join(runtimeRoot, RUNTIME_OWNER_MARKER);
  try {
    requireAbsoluteRegularFile(markerPath, 'governed Foundry runtime ownership marker');
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    if (
      marker.schema_version !== 1 ||
      marker.owner !== RUNTIME_OWNER ||
      typeof marker.run_id !== 'string' ||
      Object.keys(marker).length !== 3
    ) {
      return null;
    }
    return marker;
  } catch {
    return null;
  }
}

function requireOwnedRuntimeRoot(runtimeRoot, ownerId) {
  const marker = readRuntimeOwnership(runtimeRoot);
  if (!marker || marker.run_id !== requireRuntimeOwnerId(ownerId)) {
    throw new Error('governed Foundry runtime root lacks a valid current-run ownership marker');
  }
}

function claimGovernedRuntimeRoot(runtimeRoot, ownerId) {
  const runId = requireRuntimeOwnerId(ownerId);
  let created = false;
  try {
    mkdirSync(runtimeRoot, { mode: 0o700 });
    created = true;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }

  if (!created) {
    requireAbsoluteDirectory(runtimeRoot, 'governed Foundry runtime root');
    requireOwnedRuntimeRoot(runtimeRoot, runId);
    return;
  }

  const markerPath = join(runtimeRoot, RUNTIME_OWNER_MARKER);
  try {
    writeFileSync(
      markerPath,
      `${JSON.stringify({
        schema_version: 1,
        owner: RUNTIME_OWNER,
        run_id: runId,
      })}\n`,
      { encoding: 'utf8', flag: 'wx', mode: 0o600 }
    );
  } catch (error) {
    rmSync(markerPath, { force: true });
    try {
      rmdirSync(runtimeRoot);
    } catch {
      // Preserve a non-empty root rather than deleting content not proven to be ours.
    }
    throw error;
  }
  requireOwnedRuntimeRoot(runtimeRoot, runId);
}

export function selectFoundryRuntimeRoot({
  artifactRoot,
  requestedPath,
  fallbackRoot,
  executableProbe = probeExecutableDirectory,
  ownerId = process.env.AGENTIC_DELIVERY_RUN_ID,
} = {}) {
  if (artifactRoot) {
    const governedRoot = join(
      requireAbsoluteDirectory(artifactRoot, 'artifact root'),
      '.foundry-runtime'
    );
    claimGovernedRuntimeRoot(governedRoot, ownerId);
    if (!executableProbe(governedRoot)) {
      removeGovernedRuntimeRoot(governedRoot, artifactRoot, ownerId);
      throw new Error('governed Foundry runtime root is not executable');
    }
    return governedRoot;
  }

  if (requestedPath && existsSync(requestedPath)) {
    requireAbsoluteDirectory(requestedPath, 'requested Foundry runtime root');
    if (executableProbe(requestedPath)) return requestedPath;
    console.warn(
      `[setup] runtime path ${requestedPath} is not executable; using repository fallback`
    );
  }

  requireAbsoluteDirectory(fallbackRoot, 'repository Foundry runtime fallback');
  if (!executableProbe(fallbackRoot)) {
    throw new Error('repository Foundry runtime fallback is not executable');
  }
  return fallbackRoot;
}

export function removeGovernedRuntimeRoot(
  runtimeRoot,
  artifactRoot,
  ownerId = process.env.AGENTIC_DELIVERY_RUN_ID
) {
  const expected = resolve(artifactRoot, '.foundry-runtime');
  if (resolve(runtimeRoot) !== expected) {
    throw new Error('refusing to remove an unowned Foundry runtime root');
  }
  if (!existsSync(expected)) return;

  const status = lstatSync(expected);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error('refusing to remove an invalid Foundry runtime root');
  }
  requireOwnedRuntimeRoot(expected, ownerId);
  rmSync(expected, { recursive: true });
}
