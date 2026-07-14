#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LOCKFILE = join(ROOT, 'package-lock.json');
const NODE_MODULES_PATH = join(ROOT, 'node_modules');
const MARKER_PATH = join(ROOT, 'node_modules', '.agentic-delivery-owner.json');
const OWNER = 'simulacrum-agentic-delivery-npm';
const IMAGE_CACHE = process.env.AGENTIC_DELIVERY_NODE_MODULES_CACHE;
const action = process.argv[2];

if (!['probe', 'prepare', 'verify'].includes(action)) {
  console.error('Usage: node tools/agentic-delivery/npm-prereq.mjs <probe|prepare|verify>');
  process.exit(2);
}

try {
  if (action === 'probe') await probe();
  if (action === 'prepare') await prepare();
  if (action === 'verify') await verify();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

async function probe() {
  await assertPrepared();
  console.log('Node dependencies are prepared.');
}

async function prepare() {
  if (await isPrepared()) {
    console.log('Node dependencies already prepared.');
    return;
  }

  await ensureOwnedTarget();

  if (await dependenciesInstalledAt(NODE_MODULES_PATH)) {
    await writeMarker();
  } else if (await dependenciesInstalledAt(IMAGE_CACHE)) {
    await restoreImageCache();
    await writeMarker();
  } else {
    await run('npm', ['ci', '--no-audit', '--no-fund']);
    await writeMarker();
  }

  await assertPrepared();
  console.log('Prepared Node dependencies.');
}

async function verify() {
  await assertPrepared();
  console.log('Verified Node dependencies.');
}

async function assertPrepared() {
  if (!(await isPrepared())) {
    throw new Error('Node dependencies are not prepared for the current package-lock.json');
  }
}

async function isPrepared() {
  if (!(await dependenciesInstalledAt(NODE_MODULES_PATH)) || !existsSync(MARKER_PATH)) return false;

  const [pkg, marker] = await Promise.all([readJson(packageJsonPath()), readJson(MARKER_PATH)]);
  return (
    pkg.version === '3.0.2' &&
    marker.owner === OWNER &&
    marker.lock_sha256 === (await lockfileHash())
  );
}

async function dependenciesInstalledAt(nodeModulesPath) {
  if (!nodeModulesPath) return false;

  const pkgPath = packageJsonPath(nodeModulesPath);
  const eslintPath = eslintBinPath(nodeModulesPath);
  if (!existsSync(pkgPath) || !existsSync(eslintPath)) return false;

  const pkg = await readJson(pkgPath);
  return pkg.version === '3.0.2';
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeMarker() {
  await mkdir(NODE_MODULES_PATH, { recursive: true });
  await writeFile(
    MARKER_PATH,
    `${JSON.stringify(
      {
        schema_version: 1,
        owner: OWNER,
        lock_sha256: await lockfileHash(),
      },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  );
}

async function restoreImageCache() {
  await cp(IMAGE_CACHE, NODE_MODULES_PATH, { recursive: true });
}

async function ensureOwnedTarget() {
  if (!existsSync(NODE_MODULES_PATH)) return;

  const stat = await lstat(NODE_MODULES_PATH);
  if (!stat.isDirectory()) {
    throw new Error('Refusing to replace pre-existing non-directory node_modules path');
  }

  if (await isOwnedPreparedTree()) {
    await rm(NODE_MODULES_PATH, { recursive: true, force: true });
    return;
  }

  const entries = await readdir(NODE_MODULES_PATH);
  if (entries.length === 0) {
    await rm(NODE_MODULES_PATH, { recursive: true, force: true });
    return;
  }

  throw new Error('Refusing to replace pre-existing unowned node_modules directory');
}

async function isOwnedPreparedTree() {
  if (!existsSync(MARKER_PATH)) return false;

  try {
    const marker = await readJson(MARKER_PATH);
    return marker.owner === OWNER;
  } catch {
    return false;
  }
}

function packageJsonPath(nodeModulesPath = NODE_MODULES_PATH) {
  return join(nodeModulesPath, '@foundryvtt', 'foundryvtt-cli', 'package.json');
}

function eslintBinPath(nodeModulesPath = NODE_MODULES_PATH) {
  return join(nodeModulesPath, '.bin', 'eslint');
}

async function lockfileHash() {
  const content = await readFile(LOCKFILE);
  return createHash('sha256').update(content).digest('hex');
}

function run(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: process.env,
      stdio: 'inherit',
    });
    child.once('error', rejectPromise);
    child.once('exit', code => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${command} ${args.join(' ')} failed with exit code ${code ?? 1}`));
    });
  });
}
