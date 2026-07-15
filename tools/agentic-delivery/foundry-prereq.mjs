#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STATE_PATH = join(ROOT, 'tests', 'e2e', 'setup', '.agentic-delivery-foundry-state.json');
const OWNER = 'simulacrum-agentic-delivery-foundry';
const ENV_PATH = join(ROOT, 'tests', 'e2e', '.env.test');
const VENDOR_DIR = join(ROOT, 'vendor', 'foundry');
const DEFAULT_SYSTEM_IDS = ['dnd5e', 'pf2e'];

const ZIP_INPUT_IDS = {
  '13.351': 'FOUNDRY_V13_351_ZIP',
  '14.364': 'FOUNDRY_V14_364_ZIP',
};

const action = process.argv[2];

if (!['probe', 'prepare', 'verify', 'cleanup'].includes(action)) {
  console.error('Usage: node tools/agentic-delivery/foundry-prereq.mjs <probe|prepare|verify|cleanup>');
  process.exit(2);
}

try {
  if (action === 'probe') await probe();
  if (action === 'prepare') await prepare();
  if (action === 'verify') await verify();
  if (action === 'cleanup') await cleanup();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

async function probe() {
  const state = await readState();
  await assertPrepared(state);
  console.log(
    `Foundry E2E inputs are prepared for versions ${state.foundry_versions.join(', ')} and systems ${state.system_ids.join(', ')}.`
  );
}

async function prepare() {
  const context = await resolveContext();
  const state = await readState().catch(() => null);
  if (state) {
    try {
      await assertPrepared(state, context);
      console.log(
        `Foundry E2E inputs already prepared for versions ${state.foundry_versions.join(', ')} and systems ${state.system_ids.join(', ')}.`
      );
      return;
    } catch {
      await cleanup();
    }
  }

  await mkdir(VENDOR_DIR, { recursive: true });
  if (existsSync(ENV_PATH)) {
    throw new Error(`Refusing to overwrite pre-existing ${relativeRoot(ENV_PATH)}`);
  }

  for (const zipLink of context.zip_links) {
    const zipStat = await lstat(zipLink.input_path);
    if (!zipStat.isFile()) {
      throw new Error(`Foundry zip input is not a regular file: ${zipLink.input_path}`);
    }
    if (existsSync(zipLink.target_path)) {
      throw new Error(
        `Refusing to overwrite pre-existing Foundry zip target ${relativeRoot(zipLink.target_path)}`
      );
    }
  }

  const copiedZips = [];
  for (const zipLink of context.zip_links) {
    const hash = await copyAndHash(zipLink.input_path, zipLink.target_path);
    copiedZips.push({
      foundry_version: zipLink.foundry_version,
      zip_input_id: zipLink.zip_input_id,
      target_path: zipLink.target_path,
      sha256: hash,
    });
  }

  const adminKey = `agentic-${randomUUID()}${randomUUID().replaceAll('-', '')}`;
  const envBody = [
    `# owner=${OWNER}`,
    `# foundry_versions=${context.foundry_versions.join(',')}`,
    `# system_ids=${context.system_ids.join(',')}`,
    `FOUNDRY_LICENSE_KEY=${context.license_key}`,
    `FOUNDRY_ADMIN_KEY=${adminKey}`,
    `TEST_FOUNDRY_VERSIONS=${context.foundry_versions.join(',')}`,
    `TEST_SYSTEM_IDS=${context.system_ids.join(',')}`,
    'TEST_TMPFS_PATH=/tmp',
    '',
  ].join('\n');
  await writeFile(ENV_PATH, envBody, { mode: 0o600 });

  const nextState = {
    schema_version: 1,
    owner: OWNER,
    foundry_versions: context.foundry_versions,
    system_ids: context.system_ids,
    zip_links: copiedZips,
    env_path: ENV_PATH,
    env_sha256: sha256(envBody),
  };
  await mkdir(dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(nextState, null, 2)}\n`, { mode: 0o600 });
  await assertPrepared(nextState, context);
  console.log(
    `Prepared Foundry E2E inputs for versions ${context.foundry_versions.join(', ')} and systems ${context.system_ids.join(', ')}.`
  );
}

async function verify() {
  const context = resolveVerificationContext();
  const state = await readState();
  await assertPrepared(state, context);
  console.log(
    `Verified Foundry E2E inputs for versions ${state.foundry_versions.join(', ')} and systems ${state.system_ids.join(', ')}.`
  );
}

async function cleanup() {
  const state = await readState().catch(() => null);
  if (!state) {
    console.log('No Foundry E2E state to clean up.');
    return;
  }

  for (const zipLink of state.zip_links || []) {
    if (await ownsPreparedZip(zipLink)) {
      await rm(zipLink.target_path, { force: true });
    }
  }
  if (await ownsPreparedEnv(state)) {
    await rm(state.env_path, { force: true });
  }

  await rm(STATE_PATH, { force: true });

  await removeIfEmpty(join(ROOT, 'vendor', 'foundry'));
  await removeIfEmpty(join(ROOT, 'vendor'));

  console.log(
    `Cleaned Foundry E2E inputs for versions ${(state.foundry_versions || []).join(', ')} and systems ${(state.system_ids || []).join(', ')}.`
  );
}

async function resolveContext() {
  const { foundry_versions: foundryVersions, system_ids: systemIds } = resolveRequestedMatrix();
  const licensePath = process.env.AGENTIC_DELIVERY_INPUT_FOUNDRY_LICENSE_KEY;
  if (!licensePath) {
    throw new Error('AGENTIC_DELIVERY_INPUT_FOUNDRY_LICENSE_KEY is required');
  }
  const license_key = (await readFile(licensePath, 'utf8')).trim();
  if (!license_key || /\r|\n/u.test(license_key)) {
    throw new Error('Foundry license input must be a single non-empty line');
  }

  const zip_links = foundryVersions.map(foundryVersion => {
    const zip_input_id = ZIP_INPUT_IDS[foundryVersion];
    const input_path = process.env[`AGENTIC_DELIVERY_INPUT_${zip_input_id}`];
    if (!input_path) {
      throw new Error(`AGENTIC_DELIVERY_INPUT_${zip_input_id} is required`);
    }

    return {
      foundry_version: foundryVersion,
      zip_input_id: zip_input_id.toLowerCase(),
      input_path,
      target_path: join(VENDOR_DIR, `FoundryVTT-Node-${foundryVersion}.zip`),
    };
  });

  return {
    foundry_versions: foundryVersions,
    system_ids: systemIds,
    license_key,
    zip_links,
  };
}

function resolveVerificationContext() {
  const { foundry_versions, system_ids } = resolveRequestedMatrix();
  return {
    foundry_versions,
    system_ids,
    zip_links: foundry_versions.map(foundryVersion => ({
      foundry_version: foundryVersion,
      target_path: join(VENDOR_DIR, `FoundryVTT-Node-${foundryVersion}.zip`),
    })),
  };
}

async function readState() {
  const state = JSON.parse(await readFile(STATE_PATH, 'utf8'));
  if (state.owner !== OWNER) {
    throw new Error('Foundry E2E state owner marker is invalid');
  }
  return state;
}

async function assertPrepared(state, context = null) {
  if (!state || state.owner !== OWNER) {
    throw new Error('Foundry E2E inputs are not prepared');
  }
  if (!Array.isArray(state.foundry_versions) || state.foundry_versions.length === 0) {
    throw new Error('Prepared Foundry versions are missing from state');
  }
  if (!Array.isArray(state.system_ids) || state.system_ids.length === 0) {
    throw new Error('Prepared game systems are missing from state');
  }
  if (!Array.isArray(state.zip_links) || state.zip_links.length === 0) {
    throw new Error('Prepared Foundry zip links are missing from state');
  }
  if (context) {
    for (const foundryVersion of context.foundry_versions) {
      if (!state.foundry_versions.includes(foundryVersion)) {
        throw new Error(`Prepared Foundry versions do not include requested ${foundryVersion}`);
      }
    }
    for (const systemId of context.system_ids) {
      if (!state.system_ids.includes(systemId)) {
        throw new Error(`Prepared game systems do not include requested ${systemId}`);
      }
    }
    for (const zipLink of context.zip_links) {
      const preparedZip = state.zip_links.find(
        candidate => candidate.foundry_version === zipLink.foundry_version
      );
      if (!preparedZip || preparedZip.target_path !== zipLink.target_path) {
        throw new Error(
          `Prepared Foundry zip target does not match requested version ${zipLink.foundry_version}`
        );
      }
    }
  }

  for (const zipLink of state.zip_links) {
    if (!(await ownsPreparedZip(zipLink))) {
      throw new Error(
        `Prepared Foundry zip ownership check failed for ${relativeRoot(zipLink.target_path)}`
      );
    }
  }
  if (!(await ownsPreparedEnv(state))) {
    throw new Error(`Prepared E2E env ownership check failed for ${relativeRoot(state.env_path)}`);
  }
}

async function ownsPreparedZip(zipLink) {
  try {
    const targetStat = await lstat(zipLink.target_path);
    if (!targetStat.isFile()) return false;
    if (!zipLink.sha256) return false;
    const actual = await hashFile(zipLink.target_path);
    return actual === zipLink.sha256;
  } catch {
    return false;
  }
}

async function ownsPreparedEnv(state) {
  try {
    const content = await readFile(state.env_path, 'utf8');
    return content.startsWith(`# owner=${OWNER}\n`) && sha256(content) === state.env_sha256;
  } catch {
    return false;
  }
}

async function removeIfEmpty(path) {
  try {
    await rmdir(path);
  } catch {
    // Preserve directories with unrelated contents.
  }
}

function matrixSelectors() {
  const raw = process.env.AGENTIC_DELIVERY_MATRIX_JSON;
  if (!raw) return {};

  let matrix;
  try {
    matrix = JSON.parse(raw);
  } catch {
    throw new Error('AGENTIC_DELIVERY_MATRIX_JSON must be valid JSON');
  }
  if (!matrix || Array.isArray(matrix) || typeof matrix !== 'object') {
    throw new Error('AGENTIC_DELIVERY_MATRIX_JSON must be a JSON object');
  }
  for (const name of ['foundry_version', 'game_system']) {
    if (
      Object.prototype.hasOwnProperty.call(matrix, name) &&
      (typeof matrix[name] !== 'string' || !matrix[name].trim())
    ) {
      throw new Error(`AGENTIC_DELIVERY_MATRIX_JSON.${name} must be a non-empty string`);
    }
  }
  return matrix;
}

function resolveRequestedMatrix() {
  const matrix = matrixSelectors();
  const foundry_versions = parseRequestedValues(
    process.env.ADP_FOUNDRY_VERSION || matrix.foundry_version,
    Object.keys(ZIP_INPUT_IDS)
  );
  if (foundry_versions.length === 0) {
    throw new Error('Foundry E2E setup requires at least one supported Foundry version');
  }

  const system_ids = parseRequestedValues(
    process.env.ADP_GAME_SYSTEM || matrix.game_system,
    DEFAULT_SYSTEM_IDS
  );
  if (system_ids.length === 0) {
    throw new Error('Foundry E2E setup requires at least one supported game system');
  }

  return { foundry_versions, system_ids };
}

function parseRequestedValues(value, defaults) {
  if (!value) return [...defaults];
  const requested = value
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
  const supported = new Set(defaults);
  const unsupported = requested.filter(entry => !supported.has(entry));
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported value(s): ${unsupported.join(', ')}. Expected subset of ${defaults.join(', ')}`
    );
  }
  return [...new Set(requested)];
}
async function copyAndHash(source, target) {
  const hash = createHash('sha256');
  const stream = createReadStream(source);
  stream.pipe(hash, { end: false });
  await copyFile(source, target);
  await new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

async function hashFile(path) {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  stream.pipe(hash, { end: false });
  await new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}


function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function relativeRoot(path) {
  return path.startsWith(ROOT) ? path.slice(ROOT.length + 1) : path;
}
