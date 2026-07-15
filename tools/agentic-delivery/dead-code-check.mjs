#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE_BRANCH = 'main';
const CONFIG_PATTERNS = ['.eslintrc.cjs', '.prettierrc.json', 'knip.json'];
const JS_PATTERNS = [
  'scripts/*.js',
  'scripts/**/*.js',
  'tests/**/*.js',
  'tools/**/*.js',
  'tools/**/*.mjs',
];
const DEP_PATTERNS = ['package.json', 'package-lock.json'];

export function shouldRunDeadCodeCheck({ configChanged, changedRuntime }) {
  if (configChanged.length > 0) return { mode: 'full' };
  if (changedRuntime.length > 0) return { mode: 'baseline-diff' };
  return { mode: 'skip' };
}

if (isMain()) {
  await main();
}

async function main() {
  const baseSha = await resolveBaseSha();

  if (!baseSha) {
    console.log('No comparison base was available for the repository dead-code gate; nothing to check.');
    return;
  }

  const configChanged = await changedFiles(baseSha, 'ACMRD', CONFIG_PATTERNS);
  const changedRuntime = await changedFiles(baseSha, 'ACMRD', [...JS_PATTERNS, ...DEP_PATTERNS]);
  const decision = shouldRunDeadCodeCheck({ configChanged, changedRuntime });

  if (decision.mode === 'full') {
    await run('npm', ['run', 'dead-code']);
    return;
  }

  if (decision.mode === 'skip') {
    console.log(`No dead-code-relevant changes detected relative to ${baseSha}.`);
    return;
  }

  await run('bash', ['.github/scripts/dead-code-diff.sh', baseSha], {
    ...process.env,
    GITHUB_WORKSPACE: ROOT,
  });
}

async function resolveBaseSha() {
  for (const candidate of await baseCandidates()) {
    const sha = await tryGit(['merge-base', 'HEAD', candidate]);
    if (sha) return sha;
  }

  return await tryGit(['rev-parse', 'HEAD^']);
}

async function baseCandidates() {
  const values = [
    process.env.GITHUB_BASE_REF,
    process.env.GITHUB_BASE_SHA,
    `origin/${BASE_BRANCH}`,
    BASE_BRANCH,
  ].filter(Boolean);

  const candidates = [];
  for (const value of values) {
    const ref = await resolveRef(value);
    if (ref && !candidates.includes(ref)) candidates.push(ref);
  }
  return candidates;
}

async function resolveRef(value) {
  if (!value) return null;

  const ref = await tryGit(['rev-parse', '--verify', value]);
  if (ref) return ref;

  const remoteRef = await tryGit(['rev-parse', '--verify', `origin/${value}`]);
  if (remoteRef) return remoteRef;

  return null;
}

async function changedFiles(base, diffFilter, patterns) {
  const stdout = await git([
    'diff',
    '--name-only',
    `--diff-filter=${diffFilter}`,
    base,
    'HEAD',
    '--',
    ...patterns,
  ]);
  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function run(command, args, env = process.env) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env,
      stdio: 'inherit',
    });
    child.once('error', rejectPromise);
    child.once('exit', code => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${command} ${args.join(' ')} failed with exit code ${code ?? 1}`));
    });
  });
}

async function git(args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: ROOT,
    maxBuffer: 20_000_000,
  });
  return stdout.trim();
}

async function tryGit(args) {
  try {
    return await git(args);
  } catch {
    return null;
  }
}

function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
