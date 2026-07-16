import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

test('playwright project timeout covers the documented accessibility startup window', async () => {
  const config = await readFile(join(process.cwd(), 'tests', 'e2e', 'playwright.config.mjs'), 'utf8');
  assert.match(config, /timeout:\s*420000,\s*\/\/ 7 minutes per real Foundry test/u);
});

test('foundry page fixtures do not undercut the documented accessibility timeout', async () => {
  const fixtures = await readFile(join(process.cwd(), 'tests', 'e2e', 'fixtures', 'test-base.mjs'), 'utf8');
  const fixtureTimeouts = fixtures.match(/\{\s*timeout:\s*420000\s*\}/gu) ?? [];
  assert.ok(
    fixtureTimeouts.length >= 2,
    'expected gamePage and simulacrumPage fixtures to allow the seven-minute accessibility window'
  );
});
