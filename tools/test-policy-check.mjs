#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEST_ROOT = join(ROOT, 'tests');
const CONFIG_PATH = join(TEST_ROOT, 'e2e', 'playwright.config.mjs');
const violations = [];

for (const path of await walk(TEST_ROOT)) {
  if (!/\.(?:js|mjs|cjs)$/u.test(path)) continue;
  const source = await readFile(path, 'utf8');
  inspect(path, source);
}

const config = await readFile(CONFIG_PATH, 'utf8');
if (!/forbidOnly:\s*true/u.test(config)) {
  violations.push(`${relative(ROOT, CONFIG_PATH)} must set forbidOnly: true`);
}
if (!/retries:\s*0/u.test(config)) {
  violations.push(`${relative(ROOT, CONFIG_PATH)} must set retries: 0`);
}
if (/on-first-retry/u.test(config)) {
  violations.push(`${relative(ROOT, CONFIG_PATH)} must not depend on retry-only artifacts`);
}

if (violations.length > 0) {
  console.error('Required-test policy violations:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Required-test policy passed: no skip/focus/quarantine/retry-to-pass markers found.');

function inspect(path, source) {
  const checks = [
    [/\b(?:test|it|describe)\.(?:skip|only|fixme)\s*\(/gu, 'skip/focus/fixme marker'],
    [/\btest\.fail\s*\(/gu, 'expected-failure marker'],
    [/\b(?:quarantine|quarantined)\b/giu, 'quarantine marker'],
    [/\bretries\s*:\s*[1-9]\d*/gu, 'nonzero retry count'],
  ];

  for (const [pattern, label] of checks) {
    if (pattern.test(source)) violations.push(`${relative(ROOT, path)} contains ${label}`);
  }
}

async function walk(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'reports', 'test-results'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await walk(path)));
    if (entry.isFile()) paths.push(path);
  }
  return paths;
}
