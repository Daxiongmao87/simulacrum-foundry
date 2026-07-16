import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

test('playwright project timeout covers the documented accessibility startup window', async () => {
  const config = await readFile(join(process.cwd(), 'tests', 'e2e', 'playwright.config.mjs'), 'utf8');
  assert.match(config, /timeout:\s*420000,\s*\/\/ 7 minutes per real Foundry test/u);
});

test('accessibility fixtures inherit the documented seven-minute startup window', async () => {
  const fixtures = await readFile(join(process.cwd(), 'tests', 'e2e', 'fixtures', 'test-base.mjs'), 'utf8');
  assert.match(
    fixtures,
    /gamePage:[\s\S]*\{\s*timeout:\s*420000\s*\}[\s\S]*7 minutes for world launch and join/u
  );
  assert.match(
    fixtures,
    /simulacrumPage:[\s\S]*\{\s*timeout:\s*420000\s*\}[\s\S]*7 minutes for module enable via UI/u
  );
});
