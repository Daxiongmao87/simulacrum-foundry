import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
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

export function findFoundryDistribution(
  version,
  { environment = process.env, vendorDirectory } = {}
) {
  const definition = DISTRIBUTIONS[version];
  if (!definition) {
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

function requireAbsoluteDirectory(path, description, { create = false } = {}) {
  if (!isAbsolute(path)) {
    throw new Error(`${description} must be an absolute path`);
  }
  if (create) mkdirSync(path, { recursive: true, mode: 0o700 });

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

export function selectFoundryRuntimeRoot({
  artifactRoot,
  requestedPath,
  fallbackRoot,
  executableProbe = probeExecutableDirectory,
} = {}) {
  if (artifactRoot) {
    const governedRoot = join(
      requireAbsoluteDirectory(artifactRoot, 'artifact root'),
      '.foundry-runtime'
    );
    requireAbsoluteDirectory(governedRoot, 'governed Foundry runtime root', {
      create: true,
    });
    if (!executableProbe(governedRoot)) {
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

export function removeGovernedRuntimeRoot(runtimeRoot, artifactRoot) {
  const expected = resolve(artifactRoot, '.foundry-runtime');
  if (resolve(runtimeRoot) !== expected) {
    throw new Error('refusing to remove an unowned Foundry runtime root');
  }
  if (!existsSync(expected)) return;

  const status = lstatSync(expected);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error('refusing to remove an invalid Foundry runtime root');
  }
  rmSync(expected, { recursive: true });
}
