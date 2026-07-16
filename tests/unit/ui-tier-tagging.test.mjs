import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('accessibility-only Playwright coverage is not tagged into the UI tier', async () => {
  const source = await readFile('tests/e2e/specs/common/accessibility.spec.mjs', 'utf8');
  assert.match(source, /@accessibility/u);
  assert.doesNotMatch(source, /@accessibility\s+@ui|@ui\s+@accessibility/u);
});
