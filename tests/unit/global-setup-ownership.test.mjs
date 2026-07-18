import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import globalSetup from '../e2e/setup/global-setup.mjs';
import globalTeardown from '../e2e/setup/global-teardown.mjs';
import { selectFoundryRuntimeRoot } from '../e2e/fixtures/agentic-foundry-inputs.mjs';

const ENVIRONMENT_KEYS = [
  'ADP_ARTIFACT_DIR',
  'ADP_FOUNDRY_ENDPOINT',
  'AGENTIC_DELIVERY_INPUT_FOUNDRY_TEST_ENV',
  'AGENTIC_DELIVERY_RUN_ID',
  'AGENTIC_DELIVERY_INPUT_FOUNDRY_V13_351_ZIP',
  'FOUNDRY_LICENSE_KEY',
  'TEST_FOUNDRY_VERSION',
  'TEST_FOUNDRY_VERSIONS',
  'TEST_SYSTEM_ID',
  'TEST_SYSTEM_IDS',
];

test('global setup failure removes governed runtime state and redacts the input path', async t => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-global-setup-'));
  const artifactRoot = join(root, 'artifacts');
  const environmentFile = join(root, 'foundry-test-env');
  const distributionFile = join(root, 'foundry-v13.zip');
  const previousEnvironment = new Map(ENVIRONMENT_KEYS.map(key => [key, process.env[key]]));
  const originalExit = process.exit;
  const originalLog = console.log;
  const setupLogs = [];

  t.after(async () => {
    process.exit = originalExit;
    console.log = originalLog;
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  });

  await mkdir(artifactRoot);
  await writeFile(environmentFile, 'TEST_SYSTEM_ID=dnd5e\nTEST_FOUNDRY_VERSION=13.351\n');
  await writeFile(distributionFile, 'not-read-before-license-validation');

  for (const key of ENVIRONMENT_KEYS) delete process.env[key];
  process.env.ADP_ARTIFACT_DIR = artifactRoot;
  process.env.AGENTIC_DELIVERY_RUN_ID = 'global-setup-failure-test';
  process.env.AGENTIC_DELIVERY_INPUT_FOUNDRY_TEST_ENV = environmentFile;
  process.env.AGENTIC_DELIVERY_INPUT_FOUNDRY_V13_351_ZIP = distributionFile;
  process.exit = code => {
    throw new Error(`unexpected process.exit(${code})`);
  };
  console.log = (...values) => setupLogs.push(values.join(' '));

  await assert.rejects(globalSetup(), /FOUNDRY_LICENSE_KEY|process\.exit/u);

  assert.equal(existsSync(join(artifactRoot, '.foundry-runtime')), false);
  assert.equal(
    setupLogs.some(line => line.includes(distributionFile)),
    false
  );
});

test('global teardown preserves an unowned runtime child', async t => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-global-teardown-'));
  const artifactRoot = join(root, 'artifacts');
  const previousEnvironment = new Map(ENVIRONMENT_KEYS.map(key => [key, process.env[key]]));

  t.after(async () => {
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  });

  await mkdir(artifactRoot);
  for (const key of ENVIRONMENT_KEYS) delete process.env[key];
  process.env.ADP_ARTIFACT_DIR = artifactRoot;
  process.env.AGENTIC_DELIVERY_RUN_ID = 'global-teardown-preservation-test';
  const runtimeRoot = selectFoundryRuntimeRoot({
    artifactRoot,
    requestedPath: null,
    fallbackRoot: root,
    executableProbe: () => true,
    ownerId: process.env.AGENTIC_DELIVERY_RUN_ID,
  });
  const unownedChild = join(runtimeRoot, '.foundry-test');
  await mkdir(unownedChild);

  await assert.rejects(globalTeardown(), /refusing to remove unowned runtime content/u);

  assert.equal(existsSync(unownedChild), true);
  assert.equal(existsSync(runtimeRoot), true);
});

test('global teardown honors a file-sourced governed artifact root', async t => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-file-global-teardown-'));
  const artifactRoot = join(root, 'artifacts');
  const environmentFile = join(root, 'foundry-test-env');
  const ownerId = 'file-global-teardown-test';
  const previousEnvironment = new Map(ENVIRONMENT_KEYS.map(key => [key, process.env[key]]));

  t.after(async () => {
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  });

  await mkdir(artifactRoot);
  await writeFile(
    environmentFile,
    `ADP_ARTIFACT_DIR=${artifactRoot}\nAGENTIC_DELIVERY_RUN_ID=${ownerId}\n`
  );
  const runtimeRoot = selectFoundryRuntimeRoot({
    artifactRoot,
    requestedPath: null,
    fallbackRoot: root,
    executableProbe: () => true,
    ownerId,
  });
  for (const key of ENVIRONMENT_KEYS) delete process.env[key];
  process.env.AGENTIC_DELIVERY_INPUT_FOUNDRY_TEST_ENV = environmentFile;

  await globalTeardown();

  assert.equal(existsSync(runtimeRoot), false);
  assert.equal(existsSync(artifactRoot), true);
});
