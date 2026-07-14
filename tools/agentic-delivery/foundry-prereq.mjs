#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  rmdir,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STATE_PATH = '/tmp/simulacrum-agentic-delivery-foundry-state.json';
const OWNER = 'simulacrum-agentic-delivery-foundry';
const ENV_PATH = join(ROOT, 'tests', 'e2e', '.env.test');
const VENDOR_DIR = join(ROOT, 'vendor', 'foundry');

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
  console.log(`Foundry E2E inputs are prepared for ${state.foundry_version}/${state.system_id}.`);
}

async function prepare() {
  const context = await resolveContext();
  const state = await readState().catch(() => null);
  if (state) {
    try {
      await assertPrepared(state, context);
      console.log(`Foundry E2E inputs already prepared for ${state.foundry_version}/${state.system_id}.`);
      return;
    } catch {
      await cleanup();
    }
  }

  await mkdir(VENDOR_DIR, { recursive: true });
  const zipStat = await lstat(context.zip_input_path);
  if (!zipStat.isFile()) {
    throw new Error(`Foundry zip input is not a regular file: ${context.zip_input_path}`);
  }

  if (existsSync(context.target_zip_path)) {
    throw new Error(
      `Refusing to overwrite pre-existing Foundry zip target ${relativeRoot(context.target_zip_path)}`
    );
  }
  if (existsSync(ENV_PATH)) {
    throw new Error(`Refusing to overwrite pre-existing ${relativeRoot(ENV_PATH)}`);
  }

  await symlink(context.zip_input_path, context.target_zip_path);

  const adminKey = `agentic-${randomUUID()}${randomUUID().replaceAll('-', '')}`;
  const envBody = [
    `# owner=${OWNER}`,
    `# foundry_version=${context.foundry_version}`,
    `# system_id=${context.system_id}`,
    `FOUNDRY_LICENSE_KEY=${context.license_key}`,
    `FOUNDRY_ADMIN_KEY=${adminKey}`,
    `TEST_FOUNDRY_VERSIONS=${context.foundry_version}`,
    `TEST_SYSTEM_IDS=${context.system_id}`,
    'TEST_TMPFS_PATH=/tmp',
    '',
  ].join('\n');
  await writeFile(ENV_PATH, envBody, { mode: 0o600 });

  const nextState = {
    schema_version: 1,
    owner: OWNER,
    foundry_version: context.foundry_version,
    system_id: context.system_id,
    zip_input_id: context.zip_input_id,
    zip_input_path: context.zip_input_path,
    target_zip_path: context.target_zip_path,
    env_path: ENV_PATH,
    env_sha256: sha256(envBody),
  };
  await writeFile(STATE_PATH, `${JSON.stringify(nextState, null, 2)}\n`, { mode: 0o600 });
  await assertPrepared(nextState, context);
  console.log(`Prepared Foundry E2E inputs for ${context.foundry_version}/${context.system_id}.`);
}

async function verify() {
  const context = await resolveContext();
  const state = await readState();
  await assertPrepared(state, context);
  console.log(`Verified Foundry E2E inputs for ${state.foundry_version}/${state.system_id}.`);
}

async function cleanup() {
  const state = await readState().catch(() => null);
  if (!state) {
    console.log('No Foundry E2E state to clean up.');
    return;
  }

  if (await ownsPreparedZip(state)) {
    await unlink(state.target_zip_path);
  }
  if (await ownsPreparedEnv(state)) {
    await rm(state.env_path, { force: true });
  }

  await rm(STATE_PATH, { force: true });

  await removeIfEmpty(join(ROOT, 'vendor', 'foundry'));
  await removeIfEmpty(join(ROOT, 'vendor'));

  console.log(`Cleaned Foundry E2E inputs for ${state.foundry_version}/${state.system_id}.`);
}

async function resolveContext() {
  const foundry_version = process.env.ADP_FOUNDRY_VERSION;
  if (!foundry_version || !Object.hasOwn(ZIP_INPUT_IDS, foundry_version)) {
    throw new Error(
      `ADP_FOUNDRY_VERSION must be one of ${Object.keys(ZIP_INPUT_IDS).join(', ')} for Foundry E2E setup`
    );
  }

  const system_id = process.env.ADP_GAME_SYSTEM || 'dnd5e';
  const licensePath = process.env.AGENTIC_DELIVERY_INPUT_FOUNDRY_LICENSE_KEY;
  if (!licensePath) {
    throw new Error('AGENTIC_DELIVERY_INPUT_FOUNDRY_LICENSE_KEY is required');
  }
  const license_key = (await readFile(licensePath, 'utf8')).trim();
  if (!license_key || /\r|\n/u.test(license_key)) {
    throw new Error('Foundry license input must be a single non-empty line');
  }

  const zip_input_id = ZIP_INPUT_IDS[foundry_version];
  const zip_input_path = process.env[`AGENTIC_DELIVERY_INPUT_${zip_input_id}`];
  if (!zip_input_path) {
    throw new Error(`AGENTIC_DELIVERY_INPUT_${zip_input_id} is required`);
  }

  return {
    foundry_version,
    system_id,
    license_key,
    zip_input_id: zip_input_id.toLowerCase(),
    zip_input_path,
    target_zip_path: join(VENDOR_DIR, `FoundryVTT-Node-${foundry_version}.zip`),
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
  if (context) {
    if (state.foundry_version !== context.foundry_version) {
      throw new Error(
        `Prepared Foundry version ${state.foundry_version} does not match requested ${context.foundry_version}`
      );
    }
    if (state.system_id !== context.system_id) {
      throw new Error(
        `Prepared game system ${state.system_id} does not match requested ${context.system_id}`
      );
    }
    if (state.target_zip_path !== context.target_zip_path) {
      throw new Error('Prepared Foundry zip target does not match requested version');
    }
  }

  if (!(await ownsPreparedZip(state))) {
    throw new Error(`Prepared Foundry zip ownership check failed for ${relativeRoot(state.target_zip_path)}`);
  }
  if (!(await ownsPreparedEnv(state))) {
    throw new Error(`Prepared E2E env ownership check failed for ${relativeRoot(state.env_path)}`);
  }
}

async function ownsPreparedZip(state) {
  try {
    const targetStat = await lstat(state.target_zip_path);
    if (!targetStat.isSymbolicLink()) return false;
    const targetRealPath = await realpath(state.target_zip_path);
    const inputRealPath = await realpath(state.zip_input_path);
    return targetRealPath === inputRealPath;
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function relativeRoot(path) {
  return path.startsWith(ROOT) ? path.slice(ROOT.length + 1) : path;
}
