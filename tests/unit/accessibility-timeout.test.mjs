import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

test('playwright project preserves the shared seven-minute Foundry window', async () => {
  const config = await readFile(
    join(process.cwd(), 'tests', 'e2e', 'playwright.config.mjs'),
    'utf8'
  );
  assert.match(config, /timeout:\s*420000,\s*\/\/ 7 minutes per real Foundry test/u);
});

test('accessibility spec pins the long timeout needed by the Foundry startup path', async () => {
  const spec = await readFile(
    join(process.cwd(), 'tests', 'e2e', 'specs', 'common', 'accessibility.spec.mjs'),
    'utf8'
  );
  assert.match(spec, /test\.describe\.configure\(\{\s*timeout:\s*600000\s*\}\);/u);
});

test('e2e evidence keeps the page-wide accessibility scan bounded during teardown', async () => {
  const fixture = await readFile(
    join(process.cwd(), 'tests', 'e2e', 'fixtures', 'test-base.mjs'),
    'utf8'
  );
  assert.match(
    fixture,
    /scanAccessibility\(page,\s*'body',\s*\{\s*maxControls:\s*600,\s*maxImages:\s*200,\s*maxIds:\s*1500,\s*\}\)/u
  );
});
