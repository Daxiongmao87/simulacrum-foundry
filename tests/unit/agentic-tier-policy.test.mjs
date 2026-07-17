import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '../..');

test('accessibility spec remains tagged for both accessibility and ui tiers', async () => {
  const source = await readFile(
    resolve(ROOT, 'tests/e2e/specs/common/accessibility.spec.mjs'),
    'utf8'
  );

  assert.match(source, /@accessibility/u);
  assert.match(source, /@ui/u);
});

test('test-tier runner preserves separate ui and accessibility grep selectors', async () => {
  const source = await readFile(resolve(ROOT, 'tools/test-tier-runner.mjs'), 'utf8');

  assert.match(source, /ui:\s*\[playwrightStep\('@ui'\)\]/u);
  assert.match(source, /accessibility:\s*\[playwrightStep\('@accessibility'\)\]/u);
});
