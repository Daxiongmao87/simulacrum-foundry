import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const SCRIPT_SOURCE = join(process.cwd(), 'tools', 'agentic-delivery', 'npm-prereq.mjs');

test('npm prerequisite restores node_modules from the image cache without npm install', async () => {
  const root = await createTempRepo();
  const cache = join(root, '.cache', 'node_modules');

  try {
    await seedCache(cache);

    const result = await runPrereq(root, 'prepare', {
      AGENTIC_DELIVERY_NODE_MODULES_CACHE: cache,
    });

    assert.equal(result.exitCode, 0, result.stderr || result.stdout);
    assert.equal(
      JSON.parse(await readFile(join(root, 'node_modules', '.agentic-delivery-owner.json'), 'utf8')).owner,
      'simulacrum-agentic-delivery-npm'
    );
    assert.equal(
      JSON.parse(
        await readFile(
          join(root, 'node_modules', '@foundryvtt', 'foundryvtt-cli', 'package.json'),
          'utf8'
        )
      ).version,
      '3.0.2'
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('npm prerequisite overlays the image cache onto a pre-existing unowned node_modules directory', async () => {
  const root = await createTempRepo();
  const cache = join(root, '.cache', 'node_modules');

  try {
    await seedCache(cache);
    await mkdir(join(root, 'node_modules'), { recursive: true });
    await writeFile(join(root, 'node_modules', 'sentinel.txt'), 'user-owned');

    const result = await runPrereq(root, 'prepare', {
      AGENTIC_DELIVERY_NODE_MODULES_CACHE: cache,
    });

    assert.equal(result.exitCode, 0, result.stderr || result.stdout);
    assert.equal(await readFile(join(root, 'node_modules', 'sentinel.txt'), 'utf8'), 'user-owned');
    assert.equal(
      JSON.parse(await readFile(join(root, 'node_modules', '.agentic-delivery-owner.json'), 'utf8')).owner,
      'simulacrum-agentic-delivery-npm'
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('npm prerequisite preserves a pre-existing unowned node_modules directory when no cache is available', async () => {
  const root = await createTempRepo();

  try {
    await mkdir(join(root, 'node_modules'), { recursive: true });
    await writeFile(join(root, 'node_modules', 'sentinel.txt'), 'user-owned');

    const result = await runPrereq(root, 'prepare', {});

    assert.notEqual(result.exitCode, 0);
    assert.equal(await readFile(join(root, 'node_modules', 'sentinel.txt'), 'utf8'), 'user-owned');
    await assert.rejects(readFile(join(root, 'node_modules', '.agentic-delivery-owner.json'), 'utf8'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function createTempRepo() {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-npm-prereq-'));
  const target = join(root, 'tools', 'agentic-delivery');
  await mkdir(target, { recursive: true });
  await writeFile(join(root, 'package-lock.json'), '{"name":"simulacrum","lockfileVersion":3}\n');
  await writeFile(join(target, 'npm-prereq.mjs'), await readFile(SCRIPT_SOURCE, 'utf8'));
  return root;
}

async function seedCache(cache) {
  await mkdir(join(cache, '@foundryvtt', 'foundryvtt-cli'), { recursive: true });
  await mkdir(join(cache, '.bin'), { recursive: true });
  await writeFile(
    join(cache, '@foundryvtt', 'foundryvtt-cli', 'package.json'),
    JSON.stringify({ version: '3.0.2' })
  );
  await writeFile(join(cache, '.bin', 'eslint'), '#!/bin/sh\nexit 0\n');
}

function runPrereq(root, action, extraEnv) {
  const scriptPath = join(root, 'tools', 'agentic-delivery', 'npm-prereq.mjs');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, action], {
      cwd: root,
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.once('error', reject);
    child.once('exit', exitCode => {
      resolve({
        exitCode,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
}
