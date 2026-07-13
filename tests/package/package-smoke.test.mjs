import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = resolve(import.meta.dirname, '../..');

test('release package is buildable and contains the production module contract', async () => {
  const manifest = JSON.parse(await readFile(resolve(ROOT, 'module.json'), 'utf8'));
  await execFileAsync(process.execPath, ['tools/package-module.js'], { cwd: ROOT });

  const archive = resolve(ROOT, 'dist', `${manifest.id}-${manifest.version}.zip`);
  const { stdout } = await execFileAsync('unzip', ['-Z1', archive], { cwd: ROOT });
  const entries = new Set(stdout.trim().split('\n'));

  for (const required of [
    'module.json',
    'scripts/simulacrum.js',
    'styles/simulacrum.css',
    'templates/simulacrum/sidebar.hbs',
    'lang/en.json',
  ]) {
    assert.ok(entries.has(required), `package is missing ${required}`);
  }

  assert.equal([...entries].some(entry => /(?:^|\/)\.env(?:\.|$)/u.test(entry)), false);
  assert.equal([...entries].some(entry => entry.startsWith('tests/')), false);
});
