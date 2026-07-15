#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ESLINT = resolve(ROOT, 'node_modules/.bin/eslint');
const BASELINE = resolve(ROOT, 'tests/baselines/eslint.json');
const baseline = JSON.parse(await readFile(BASELINE, 'utf8'));

let stdout;
try {
  ({ stdout } = await execFileAsync(ESLINT, ['scripts', 'tests', 'tools', '--format', 'json'], {
    cwd: ROOT,
    maxBuffer: 20_000_000,
  }));
} catch (error) {
  if (typeof error.stdout !== 'string') throw error;
  if (!error.stdout.trim()) {
    const reason =
      typeof error.stderr === 'string' && error.stderr.trim() ? error.stderr.trim() : error.message;
    throw new Error(`ESLint baseline execution did not return JSON output: ${reason}`);
  }
  stdout = error.stdout;
}

const current = summarize(JSON.parse(stdout));
const allowed = new Map(baseline.entries.map(entry => [fingerprint(entry), entry.count]));
const regressions = current.filter(entry => entry.count > (allowed.get(fingerprint(entry)) || 0));

if (regressions.length > 0) {
  console.error('ESLint introduced findings beyond the committed baseline:');
  for (const entry of regressions) {
    const previous = allowed.get(fingerprint(entry)) || 0;
    console.error(
      `- ${entry.path}: ${entry.rule_id}: ${entry.message} (current ${entry.count}, baseline ${previous})`
    );
  }
  process.exit(1);
}

const currentCount = current.reduce((sum, entry) => sum + entry.count, 0);
const baselineCount = baseline.entries.reduce((sum, entry) => sum + entry.count, 0);
console.log(
  `ESLint baseline passed: ${currentCount} errors present, ${baselineCount} allowed, no new errors.`
);

function summarize(results) {
  const counts = new Map();
  for (const result of results) {
    for (const message of result.messages) {
      if (message.severity !== 2) continue;
      const entry = {
        path: relative(ROOT, result.filePath),
        rule_id: message.ruleId,
        message: message.message,
      };
      const key = fingerprint(entry);
      counts.set(key, { ...entry, count: (counts.get(key)?.count || 0) + 1 });
    }
  }
  return [...counts.values()];
}

function fingerprint(entry) {
  return JSON.stringify([entry.path, entry.rule_id, entry.message]);
}
