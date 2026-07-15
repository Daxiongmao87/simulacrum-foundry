import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '../..');

test('docker build context excludes workspace-owned dependency and test artifact paths', async () => {
  const dockerignore = await readFile(resolve(ROOT, '.dockerignore'), 'utf8');

  for (const entry of ['node_modules/', 'vendor/foundry/*.zip', 'tests/e2e/test-results/']) {
    assert.match(dockerignore, new RegExp(`^${escape(entry)}$`, 'mu'));
  }
});

function escape(value) {
  return value.replace(/[|\\{}()[\]^$+*?.]/gu, '\\$&');
}
