#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LOCKFILE = join(ROOT, 'package-lock.json');
const NODE_MODULES = join(ROOT, 'node_modules');
const MARKER = join(NODE_MODULES, '.agentic-delivery-npm-prereq.json');
const OWNER = 'simulacrum-agentic-delivery-npm-prereq';
const mode = process.argv[2];

if (!['probe', 'prepare', 'verify', 'cleanup'].includes(mode)) {
  fail('Usage: node tools/agentic-delivery/npm-prereq.mjs <probe|prepare|verify|cleanup>');
}

if (mode === 'probe') process.exit(hasValidInstall() ? 0 : 1);
if (mode === 'verify') {
  if (!hasValidInstall()) fail('npm prerequisite is not ready');
  writeStdout('npm prerequisite verified.\n');
  process.exit(0);
}
if (mode === 'cleanup') {
  cleanupMarker();
  process.exit(0);
}

if (hasValidInstall()) {
  writeStdout('npm prerequisite already satisfied.\n');
  process.exit(0);
}

await run('npm', ['ci']);
writeMarker();
writeStdout('npm prerequisite prepared with npm ci.\n');

function hasValidInstall() {
  if (!existsSync(LOCKFILE) || !existsSync(join(NODE_MODULES, '.bin', 'eslint'))) return false;
  if (!existsSync(join(NODE_MODULES, '.bin', 'prettier'))) return false;
  if (!existsSync(join(NODE_MODULES, '.bin', 'knip'))) return false;
  if (!existsSync(MARKER)) return false;

  try {
    const marker = JSON.parse(readFileSync(MARKER, 'utf8'));
    return (
      marker.schema_version === 1 &&
      marker.owner === OWNER &&
      marker.package_lock_sha256 === packageLockHash()
    );
  } catch {
    return false;
  }
}

function writeMarker() {
  mkdirSync(NODE_MODULES, { recursive: true });
  writeFileSync(
    MARKER,
    `${JSON.stringify(
      {
        schema_version: 1,
        owner: OWNER,
        package_lock_sha256: packageLockHash(),
      },
      null,
      2
    )}\n`
  );
}

function cleanupMarker() {
  if (!existsSync(MARKER)) return;
  try {
    const marker = JSON.parse(readFileSync(MARKER, 'utf8'));
    if (marker.owner === OWNER && marker.schema_version === 1) {
      rmSync(MARKER, { force: true });
    }
  } catch {
    return;
  }
}

function packageLockHash() {
  const hash = createHash('sha256');
  hash.update(readFileSync(LOCKFILE));
  return hash.digest('hex');
}

async function run(command, args) {
  const code = await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: 'inherit',
    });
    child.once('error', rejectPromise);
    child.once('exit', codeValue => resolvePromise(codeValue ?? 1));
  });

  if (code !== 0) process.exit(code);
}

function writeStdout(value) {
  process.stdout.write(value);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
