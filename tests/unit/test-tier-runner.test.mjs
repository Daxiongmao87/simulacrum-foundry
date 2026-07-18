import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('non-Playwright tiers ignore unavailable governed Foundry inputs', async t => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-non-foundry-tier-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const outcomePath = join(root, 'outcomes', 'policy.json');
  const result = await execFileAsync(process.execPath, ['tools/test-tier-runner.mjs', 'policy'], {
    cwd: ROOT,
    env: {
      ...process.env,
      AGENTIC_DELIVERY_INPUT_FOUNDRY_TEST_ENV: join(root, 'unavailable-foundry-env'),
      ADP_TEST_OUTCOME_FILE: outcomePath,
      ADP_TEST_OUTCOME_SCHEMA_VERSION: '1',
    },
  });

  assert.match(result.stdout, /\[test-tier\] policy: pass/u);
});

test('direct Playwright config derives one project from a file-sourced broker matrix', async t => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-broker-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const environmentFile = join(root, 'foundry-test-env');
  await writeFile(
    environmentFile,
    [
      'ADP_FOUNDRY_ENDPOINT=http://foundry-12345678-1234-4123-8123-123456789abc:30000',
      'ADP_FOUNDRY_SESSION_FILE=/tmp/session.json',
      'ADP_FOUNDRY_VERSION=14.364',
      'ADP_GAME_SYSTEM=pf2e',
      '',
    ].join('\n')
  );

  const environment = { ...process.env };
  for (const key of [
    'ADP_FOUNDRY_ENDPOINT',
    'ADP_FOUNDRY_SESSION_FILE',
    'ADP_FOUNDRY_VERSION',
    'ADP_GAME_SYSTEM',
    'TEST_FOUNDRY_VERSION',
    'TEST_FOUNDRY_VERSIONS',
    'TEST_SYSTEM_ID',
    'TEST_SYSTEM_IDS',
  ]) {
    delete environment[key];
  }
  environment.AGENTIC_DELIVERY_INPUT_FOUNDRY_TEST_ENV = environmentFile;

  const program = [
    "import configuration from './tests/e2e/playwright.config.mjs';",
    'console.log(`PROJECTS=${JSON.stringify(configuration.projects.map(project => project.name))}`);',
  ].join('\n');
  const result = await execFileAsync(process.execPath, ['--input-type=module', '--eval', program], {
    cwd: ROOT,
    env: environment,
  });
  const match = result.stdout.match(/^PROJECTS=(.+)$/mu);
  assert.ok(match, `project list was not emitted: ${result.stdout}`);
  assert.deepEqual(JSON.parse(match[1]), ['chromium-foundry-14.364-pf2e']);
});
