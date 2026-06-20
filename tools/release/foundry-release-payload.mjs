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
  const normalizedRepoUrl = normalizeRepoUrl(repoUrl);
  const moduleId = moduleJson && moduleJson.id;
  if (!moduleId || typeof moduleId !== 'string' || !moduleId.trim()) {
    fail('module json is missing required id');
  }

  const manifestVersion = String(releaseVersion || '').trim();
  if (!manifestVersion) {
    fail('release version is required');
  }
  const moduleVersion = String(moduleJson.version || '').trim();
  if (moduleVersion !== manifestVersion) {
    fail(
      `module.json version (${moduleVersion}) does not match workflow version (${manifestVersion})`
    );
  }

  const compatibility = moduleJson.compatibility || {};
  const minimum = compatibility.minimum;
  const verified = compatibility.verified;
  if (minimum === undefined || minimum === null || String(minimum).trim() === '') {
    fail('compatibility.minimum is required');
  }
  if (verified === undefined || verified === null || String(verified).trim() === '') {
    fail('compatibility.verified is required');
  }

  const compatibilityPayload = {
    minimum: String(minimum),
    verified: String(verified),
  };
  const maximum = compatibility.maximum;
  if (maximum !== undefined && maximum !== null && String(maximum).trim() !== '') {
    compatibilityPayload.maximum = String(maximum);
  }

  const payload = {
    id: moduleId,
    release: {
      version: manifestVersion,
      manifest: `${normalizedRepoUrl}/releases/download/${manifestVersion}/module.json`,
      notes: `${normalizedRepoUrl}/releases/tag/${manifestVersion}`,
      compatibility: compatibilityPayload,
    },
  };

  if (dryRun) {
    payload['dry-run'] = true;
  }

  return payload;
}

export { buildFoundryReleasePayload };

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
