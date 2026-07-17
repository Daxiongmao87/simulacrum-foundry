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
const FORMAT_PATTERNS = [
  'scripts/*.js',
  'scripts/**/*.js',
  'tests/**/*.js',
  'tools/**/*.js',
  'tools/**/*.mjs',
  '*.json',
  '*.md',
  '.github/workflows/*.yml',
  '.github/workflows/*.yaml',
];

await run(process.execPath, ['tools/agentic-delivery/npm-prereq.mjs', 'prepare']);
await run(process.execPath, ['tools/agentic-delivery/npm-prereq.mjs', 'verify']);

const baseSha = await resolveBaseSha();
if (!baseSha) {
  fail('Cannot resolve a comparison base for the repository format gate.');
}

const configChanged = await changedFiles(baseSha, 'ACMRD', CONFIG_PATTERNS);
if (configChanged.length > 0) {
  await run('npm', ['run', 'format:check']);
} else {
  const formatFiles = await changedFiles(baseSha, 'ACMR', FORMAT_PATTERNS);
  if (formatFiles.length > 0) {
    await run(PRETTIER, ['--check', ...formatFiles]);
  } else {
    writeStdout(`No formatting-relevant changes detected relative to ${baseSha}.\n`);
  }
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
    process.env.GITHUB_BASE_SHA,
    process.env.GITHUB_BASE_REF,
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
  const ref = await tryGit(['rev-parse', '--verify', value]);
  if (ref) return ref;
  return await tryGit(['rev-parse', '--verify', `origin/${value}`]);
}

async function changedFiles(base, diffFilter, patterns) {
  const tracked = splitPaths(
    await git(['diff', '--name-only', '-z', `--diff-filter=${diffFilter}`, base, '--', ...patterns])
  );
  const untracked = diffFilter.includes('A')
    ? splitPaths(await git(['ls-files', '--others', '--exclude-standard', '-z', '--', ...patterns]))
    : [];
  return [...new Set([...tracked, ...untracked])].sort();
}

function splitPaths(value) {
  return value.split('\0').filter(Boolean);
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

async function git(args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20_000_000,
  });
  return stdout;
}

async function tryGit(args) {
  try {
    return (await git(args)).trim();
  } catch {
    return null;
  }
}

function writeStdout(value) {
  process.stdout.write(value);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
