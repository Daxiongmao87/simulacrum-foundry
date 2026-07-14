#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LOCKFILE = join(ROOT, 'package-lock.json');
const MARKER_PATH = join(ROOT, 'node_modules', '.agentic-delivery-owner.json');
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

  if (!(await dependenciesInstalled())) {
    await run('npm', ['ci', '--no-audit', '--no-fund']);
  }
  await writeMarker();
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
  if (!(await dependenciesInstalled()) || !existsSync(MARKER_PATH)) return false;

  const [pkg, marker] = await Promise.all([readJson(packageJsonPath()), readJson(MARKER_PATH)]);
  return (
    pkg.version === '3.0.2' &&
    marker.owner === 'simulacrum-agentic-delivery-npm' &&
    marker.lock_sha256 === (await lockfileHash())
  );
}

async function dependenciesInstalled() {
  if (!existsSync(packageJsonPath()) || !existsSync(eslintBinPath())) return false;
  const pkg = await readJson(packageJsonPath());
  return pkg.version === '3.0.2';
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeMarker() {
  await mkdir(join(ROOT, 'node_modules'), { recursive: true });
  await writeFile(
    MARKER_PATH,
    `${JSON.stringify(
      {
        schema_version: 1,
        owner: 'simulacrum-agentic-delivery-npm',
        lock_sha256: await lockfileHash(),
      },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  );
}

function packageJsonPath() {
  return join(ROOT, 'node_modules', '@foundryvtt', 'foundryvtt-cli', 'package.json');
}

function eslintBinPath() {
  return join(ROOT, 'node_modules', '.bin', 'eslint');
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
