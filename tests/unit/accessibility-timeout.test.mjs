import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

test('playwright project timeout covers the documented accessibility startup window', async () => {
  const config = await readFile(join(process.cwd(), 'tests', 'e2e', 'playwright.config.mjs'), 'utf8');
  assert.match(config, /timeout:\s*420000,\s*\/\/ 7 minutes per real Foundry test/u);
});

test('gamePage fixture timeout does not undercut the documented accessibility window', async () => {
  const fixtures = await readFile(join(process.cwd(), 'tests', 'e2e', 'fixtures', 'test-base.mjs'), 'utf8');
  assert.match(fixtures, /gamePage:\s*\[/u);
  assert.match(fixtures, /\{\s*timeout:\s*420000\s*\}/u);
  assert.ok(
    fixtures.includes(
      '7 minutes so world launch plus retained accessibility evidence matches the documented Foundry window'
    )
  );
});
