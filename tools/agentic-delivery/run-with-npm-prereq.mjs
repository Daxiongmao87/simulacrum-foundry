#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('Usage: node tools/agentic-delivery/run-with-npm-prereq.mjs <command> [args...]');
  process.exit(2);
}

try {
  await run(process.execPath, ['tools/agentic-delivery/npm-prereq.mjs', 'prepare']);
  await run(process.execPath, ['tools/agentic-delivery/npm-prereq.mjs', 'verify']);
  await run(command, args);
} catch (error) {
  if (error && typeof error.exitCode === 'number') process.exit(error.exitCode);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function run(commandName, commandArgs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(commandName, commandArgs, {
      cwd: ROOT,
      env: process.env,
      stdio: 'inherit',
    });
    child.once('error', rejectPromise);
    child.once('exit', exitCode => {
      if (exitCode === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        Object.assign(
          new Error(`${commandName} ${commandArgs.join(' ')} failed with exit code ${exitCode ?? 1}`),
          { exitCode: exitCode ?? 1 }
        )
      );
    });
  });
}
