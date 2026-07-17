#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = process.argv.slice(2);

if (target.length === 0) {
  process.stderr.write(
    'Usage: node tools/agentic-delivery/run-with-npm-prereq.mjs <command> [args...]\n'
  );
  process.exit(1);
}

await run(process.execPath, ['tools/agentic-delivery/npm-prereq.mjs', 'prepare']);
await run(process.execPath, ['tools/agentic-delivery/npm-prereq.mjs', 'verify']);
await run(target[0], target.slice(1));

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
