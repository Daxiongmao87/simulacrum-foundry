#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'node:fs';

if (process.argv[1] && process.argv[1].endsWith('foundry-release-payload.mjs')) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const options = {
      moduleJsonPath: '',
      version: '',
      repoUrl: '',
      dryRun: false,
      outputPath: '',
    };

    for (const [key, value] of Object.entries(args)) {
      if (Object.hasOwn(options, key)) {
        options[key] = value;
      }
    }

    if (!options.moduleJsonPath || !options.version || !options.repoUrl) {
      fail('module json path, version, and repo URL are required');
    }

    const moduleJson = safeJsonParse(readText(options.moduleJsonPath, 'module JSON'));
    const payload = buildFoundryReleasePayload({
      moduleJson,
      releaseVersion: options.version,
      repoUrl: options.repoUrl,
      dryRun: options.dryRun,
    });

    if (options.outputPath) {
      fs.writeFileSync(options.outputPath, `${JSON.stringify(payload, null, 2)}\n`);
    }

    console.log(JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

function buildFoundryReleasePayload({ moduleJson, releaseVersion, repoUrl, dryRun = false }) {
  const moduleId = resolveModuleId(moduleJson);
  const manifestVersion = resolveTrimmedValue(releaseVersion, 'release version is required');
  const moduleVersion = String((moduleJson && moduleJson.version) ?? '').trim();
  if (moduleVersion !== manifestVersion) {
    fail(
      `module.json version (${moduleVersion}) does not match workflow version (${manifestVersion})`
    );
  }

  const compatibility = buildCompatibilityPayload(moduleJson && moduleJson.compatibility);
  const normalizedRepoUrl = normalizeRepoUrl(repoUrl);
  const payload = {
    id: moduleId,
    release: {
      version: manifestVersion,
      manifest: `${normalizedRepoUrl}/releases/download/${manifestVersion}/module.json`,
      notes: `${normalizedRepoUrl}/releases/tag/${manifestVersion}`,
      compatibility,
    },
    ...(dryRun ? { 'dry-run': true } : {}),
  };

  return payload;
}

export { buildFoundryReleasePayload };

function resolveModuleId(moduleJson) {
  const moduleId = moduleJson && moduleJson.id;
  if (typeof moduleId !== 'string' || !moduleId.trim()) {
    fail('module json is missing required id');
  }
  return moduleId;
}

function resolveTrimmedValue(value, message) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    fail(message);
  }
  return trimmed;
}

function buildCompatibilityPayload(compatibility) {
  const minimum = resolveTrimmedValue(
    compatibility && compatibility.minimum,
    'compatibility.minimum is required'
  );
  const verified = resolveTrimmedValue(
    compatibility && compatibility.verified,
    'compatibility.verified is required'
  );

  const compatibilityPayload = {
    minimum,
    verified,
  };

  const maximum = resolveOptionalTrimmedValue(compatibility && compatibility.maximum);
  if (maximum !== null) {
    compatibilityPayload.maximum = maximum;
  }

  return compatibilityPayload;
}

function resolveOptionalTrimmedValue(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function parseArgs(rawArgs) {
  const values = {};
  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];
    if (!arg.startsWith('--')) {
      continue;
    }
    if (arg === '--dry-run') {
      values.dryRun = true;
      continue;
    }
    const key = toCamelCase(arg.replace(/^--/, ''));
    const next = rawArgs[i + 1];
    if (next === undefined || next.startsWith('--')) {
      continue;
    }
    values[key] = next;
    i += 1;
  }
  return values;
}

function toCamelCase(value) {
  return value
    .split('-')
    .map((segment, index) =>
      index === 0 ? segment : segment.charAt(0).toUpperCase() + segment.slice(1)
    )
    .join('');
}

function normalizeRepoUrl(value) {
  return value.replace(/\/$/, '');
}

function readText(filePath, label) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    fail(`Unable to read ${label}: ${error.message}`);
  }
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    fail(`Invalid module JSON: ${error.message}`);
  }
}

function fail(message) {
  throw new Error(message);
}
