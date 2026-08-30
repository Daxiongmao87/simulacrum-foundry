#!/usr/bin/env node

// File-size gate: enforces the 1000-line source cap from .omp/RULES.md.
// Grandfathered over-cap files are frozen in tests/baselines/file-sizes.json;
// the check fails on any new over-cap file or growth of a grandfathered file.

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CAP = 1000; // .omp/RULES.md: no source file over 1000 lines (test files included)
const BASELINE = resolve(ROOT, 'tests/baselines/file-sizes.json');

const { stdout } = await execFileAsync('git', ['ls-files', '--', 'scripts', 'tests', 'tools'], {
  cwd: ROOT,
});
const files = stdout.split('\n').filter(path => path.endsWith('.js') || path.endsWith('.mjs'));

const counts = new Map();
for (const path of files) {
  counts.set(path, countLines(await readFile(resolve(ROOT, path), 'utf8')));
}

const baseline = new Map(
  JSON.parse(await readFile(BASELINE, 'utf8')).files.map(file => [file.path, file.lines])
);

const violations = [];
for (const [path, lines] of counts) {
  const allowed = baseline.get(path);
  if (lines > CAP && allowed === undefined) {
    violations.push(`${path}: ${lines} lines exceeds the ${CAP}-line cap, no baseline entry`);
  } else if (allowed !== undefined && lines > allowed) {
    violations.push(`${path}: grew past baseline (${allowed} → ${lines} lines, cap ${CAP})`);
  }
}

if (violations.length > 0) {
  console.error('File-size gate failed:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  console.error(
    'Split the file along an existing seam, or update tests/baselines/file-sizes.json ' +
      'as an explicit reviewed acceptance.'
  );
  process.exit(1);
}

const overCap = [...counts.values()].filter(lines => lines > CAP).length;
console.log(
  `File-size gate passed: ${files.length} files scanned, ${overCap} over ${CAP} lines, all within baseline.`
);

function countLines(content) {
  if (content === '') return 0;
  return content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
}
