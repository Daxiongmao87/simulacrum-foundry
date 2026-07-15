#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PRETTIER = resolve(ROOT, 'node_modules/.bin/prettier');
const BASE_BRANCH = 'main';
const CONFIG_PATTERNS = ['.eslintrc.cjs', '.prettierrc.json', 'knip.json'];
const WORKFLOW_PATTERNS = ['.github/workflows/*.yml', '.github/workflows/*.yaml'];
const FORMAT_PATTERNS = [
  'scripts/*.js',
  'scripts/**/*.js',
  'tests/**/*.js',
  'tools/**/*.js',
  'tools/**/*.mjs',
  '*.json',
  '*.md',
  ...WORKFLOW_PATTERNS,
];

const baseSha = await resolveBaseSha();
let ranCheck = false;

if (!baseSha) {
  console.log('No comparison base was available for the repository format gate; nothing to check.');
  process.exit(0);
}

const configChanged = await changedFiles(baseSha, 'ACMRD', CONFIG_PATTERNS);
if (configChanged.length > 0) {
  await run('npm', ['run', 'format:check']);
  ranCheck = true;
}

const workflowFiles = await changedFiles(baseSha, 'ACMR', WORKFLOW_PATTERNS);
if (workflowFiles.length > 0) {
  await run(PRETTIER, ['--check', ...workflowFiles]);
  ranCheck = true;
}

if (configChanged.length === 0) {
  const formatFiles = await changedFiles(baseSha, 'ACMR', FORMAT_PATTERNS);
  if (formatFiles.length > 0) {
    await run(PRETTIER, ['--check', ...formatFiles]);
    ranCheck = true;
  }
}

if (!ranCheck) {
  console.log(`No formatting-relevant changes detected relative to ${baseSha}.`);
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

async function run(command, args) {
  await new Promise((resolvePromise, rejectPromise) => {
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
