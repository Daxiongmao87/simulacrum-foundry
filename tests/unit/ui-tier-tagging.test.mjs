import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Simulacrum sidebar accessibility scenario retains @accessibility and @ui tags', async () => {
  const source = await readFile('tests/e2e/specs/common/accessibility.spec.mjs', 'utf8');
  assert.match(
    source,
    /test\(\s*'@accessibility @ui Simulacrum sidebar exposes named, structurally valid controls'/u
  );
});
