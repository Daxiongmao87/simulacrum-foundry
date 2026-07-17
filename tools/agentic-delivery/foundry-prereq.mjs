#!/usr/bin/env node

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STATE_DIR = join(ROOT, '.agentic-delivery', 'state');
const MARKER = join(STATE_DIR, 'foundry-prereq.json');
const OWNER = 'simulacrum-agentic-delivery-foundry-prereq';
const ENV_FILE = join(ROOT, 'tests/e2e/.env.test');
const VENDOR_DIR = join(ROOT, 'vendor/foundry');
const REQUIRED_ZIPS = [
  ['13.351', join(VENDOR_DIR, 'FoundryVTT-Node-13.351.zip')],
  ['14.364', join(VENDOR_DIR, 'FoundryVTT-Node-14.364.zip')],
];
const mode = process.argv[2];

if (!['probe', 'prepare', 'verify', 'cleanup'].includes(mode)) {
  fail('Usage: node tools/agentic-delivery/foundry-prereq.mjs <probe|prepare|verify|cleanup>');
}

if (mode === 'probe') process.exit(isReady() ? 0 : 1);
if (mode === 'verify') {
  if (!isReady()) fail('Foundry prerequisite is not ready');
  process.stdout.write('Foundry prerequisite verified.\n');
  process.exit(0);
}
if (mode === 'cleanup') {
  cleanup();
  process.exit(0);
}

prepare();
process.stdout.write('Foundry prerequisite prepared.\n');

function prepare() {
  mkdirSync(VENDOR_DIR, { recursive: true });
  mkdirSync(STATE_DIR, { recursive: true });

  const createdPaths = [];
  const marker = loadMarker();

  if (!existsSync(ENV_FILE)) {
    writeFileSync(ENV_FILE, buildEnvFile(), { flag: 'wx', mode: 0o600 });
    createdPaths.push(relativePath(ENV_FILE));
  } else if (!envFileMatches(readFileSync(ENV_FILE, 'utf8'))) {
    fail(`Refusing to replace existing tests/e2e/.env.test with unmanaged contents`);
  }

  for (const [version, destination] of REQUIRED_ZIPS) {
    if (existsSync(destination)) continue;
    const source = requiredInput(`foundry_v${version.startsWith('13') ? '13' : '14'}_zip`);
    copyFileSync(source, destination, 0);
    createdPaths.push(relativePath(destination));
  }

  writeFileSync(
    MARKER,
    `${JSON.stringify(
      {
        schema_version: 1,
        owner: OWNER,
        created_paths: unique([...(marker?.created_paths || []), ...createdPaths]),
      },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  );

  if (!isReady()) fail('Foundry prerequisite prepare completed without a valid result');
}

function cleanup() {
  const marker = loadMarker();
  if (!marker || marker.owner !== OWNER || marker.schema_version !== 1) return;

  for (const relative of [...marker.created_paths].sort().reverse()) {
    const target = join(ROOT, relative);
    if (!target.startsWith(ROOT + '/')) continue;
    if (!existsSync(target)) continue;
    rmSync(target, { recursive: true, force: true });
  }

  rmSync(MARKER, { force: true });
}

function isReady() {
  if (!existsSync(ENV_FILE)) return false;
  if (!envFileMatches(readFileSync(ENV_FILE, 'utf8'))) return false;
  return REQUIRED_ZIPS.every(
    ([, destination]) => existsSync(destination) && statSync(destination).isFile()
  );
}

function buildEnvFile() {
  const licenseKey = readTrimmed(requiredInput('foundry_license_key'));
  if (!licenseKey) fail('Foundry license input is empty');
  return [
    `FOUNDRY_LICENSE_KEY=${licenseKey}`,
    'FOUNDRY_ADMIN_KEY=agentic-delivery-admin-key-000000000000',
    'DEBUG_FOUNDRY=false',
    'TEST_SYSTEM_IDS=dnd5e,pf2e',
    'TEST_WORLD_ID=simulacrum-test-world',
    'TEST_WORLD_TITLE=Simulacrum Test World',
    'TEST_FOUNDRY_VERSIONS=13.351,14.364',
    '',
  ].join('\n');
}

function envFileMatches(content) {
  return (
    /^FOUNDRY_LICENSE_KEY=.+$/mu.test(content) &&
    /^FOUNDRY_ADMIN_KEY=agentic-delivery-admin-key-000000000000$/mu.test(content) &&
    /^TEST_SYSTEM_IDS=dnd5e,pf2e$/mu.test(content) &&
    /^TEST_FOUNDRY_VERSIONS=13\.351,14\.364$/mu.test(content)
  );
}

function requiredInput(id) {
  const envName = `AGENTIC_DELIVERY_INPUT_${id.toUpperCase()}`;
  const value = process.env[envName];
  if (!value || !isAbsolute(value) || !existsSync(value)) {
    fail(`Missing required Agentic Delivery input ${id}`);
  }
  return value;
}

function readTrimmed(path) {
  return readFileSync(path, 'utf8').trim();
}

function loadMarker() {
  if (!existsSync(MARKER)) return null;
  try {
    return JSON.parse(readFileSync(MARKER, 'utf8'));
  } catch {
    return null;
  }
}

function unique(values) {
  return [...new Set(values)];
}

function relativePath(path) {
  return path.slice(ROOT.length + 1);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
