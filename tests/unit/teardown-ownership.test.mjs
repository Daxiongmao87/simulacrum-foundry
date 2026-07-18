import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import globalTeardown, { isOwnedTestDirectory } from '../e2e/setup/global-teardown.mjs';
import { loadFoundryEnvironment } from '../e2e/fixtures/agentic-foundry-inputs.mjs';
import { getTestBasePath, isFoundryPortFree } from '../e2e/fixtures/foundry-setup.mjs';

test('teardown ownership requires the exact valid marker', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'simulacrum-teardown-'));
  t.after(() => rm(directory, { recursive: true, force: true }));

  assert.equal(isOwnedTestDirectory(directory), false);

  await writeFile(join(directory, '.simulacrum-e2e-owned.json'), '{"owner":"wrong"}');
  assert.equal(isOwnedTestDirectory(directory), false);

  await writeFile(
    join(directory, '.simulacrum-e2e-owned.json'),
    JSON.stringify({
      schema_version: 1,
      owner: 'simulacrum-e2e',
      test_id: 'test-1',
      test_dir: '/tmp/not-this-operation',
      data_dir: '/tmp/not-this-operation-data',
    })
  );
  assert.equal(isOwnedTestDirectory(directory), false);

  await writeFile(
    join(directory, '.simulacrum-e2e-owned.json'),
    JSON.stringify({
      schema_version: 1,
      owner: 'simulacrum-e2e',
      test_id: 'test-1',
      test_dir: directory,
      data_dir: `${directory}-data`,
    })
  );
  assert.equal(isOwnedTestDirectory(directory), true);
});

test('Foundry port polling observes a live listener and its closure', async t => {
  const server = createServer();
  t.after(() => server.close());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object');

  assert.equal(await isFoundryPortFree(address.port), false);
  await new Promise((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  );
  assert.equal(await isFoundryPortFree(address.port), true);
});

test('per-test runtime selection honors a file-sourced artifact root', async t => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-file-runtime-root-'));
  const artifactRoot = join(root, 'artifacts');
  const environmentFile = join(root, 'foundry-test-env');
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(artifactRoot);
  await writeFile(environmentFile, `ADP_ARTIFACT_DIR=${artifactRoot}\n`);
  const environment = {
    ...loadFoundryEnvironment({
      environment: { AGENTIC_DELIVERY_INPUT_FOUNDRY_TEST_ENV: environmentFile },
    }),
    AGENTIC_DELIVERY_RUN_ID: 'file-runtime-root-test',
  };

  assert.equal(getTestBasePath(environment), join(artifactRoot, '.foundry-runtime'));
});

test('governed teardown rejects a foreign runtime owner before child cleanup', async t => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-foreign-runtime-'));
  const artifactRoot = join(root, 'artifacts');
  const runtimeRoot = join(artifactRoot, '.foundry-runtime');
  const testDirectory = join(runtimeRoot, '.foundry-test-foreign');
  const dataDirectory = join(runtimeRoot, '.foundry-data-foreign');
  const environmentFile = join(root, 'foundry-test-env');
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(testDirectory, { recursive: true });
  await mkdir(dataDirectory);
  await writeFile(
    join(runtimeRoot, '.simulacrum-runtime-owner.json'),
    JSON.stringify({
      schema_version: 1,
      owner: 'simulacrum-foundry-e2e-runtime',
      run_id: 'foreign-run',
    })
  );
  const childMarker = JSON.stringify({
    schema_version: 1,
    owner: 'simulacrum-e2e',
    test_id: 'foreign-test',
    test_dir: testDirectory,
    data_dir: dataDirectory,
  });
  await writeFile(join(testDirectory, '.simulacrum-e2e-owned.json'), childMarker);
  await writeFile(join(dataDirectory, '.simulacrum-e2e-owned.json'), childMarker);
  await writeFile(
    environmentFile,
    `ADP_ARTIFACT_DIR=${artifactRoot}\nAGENTIC_DELIVERY_RUN_ID=current-run\n`
  );

  const previousArtifactRoot = process.env.ADP_ARTIFACT_DIR;
  const previousRunId = process.env.AGENTIC_DELIVERY_RUN_ID;
  const previousEnvironmentFile = process.env.AGENTIC_DELIVERY_INPUT_FOUNDRY_TEST_ENV;
  delete process.env.ADP_ARTIFACT_DIR;
  delete process.env.AGENTIC_DELIVERY_RUN_ID;
  process.env.AGENTIC_DELIVERY_INPUT_FOUNDRY_TEST_ENV = environmentFile;
  try {
    await assert.rejects(globalTeardown(), /valid current-run ownership marker/u);
  } finally {
    if (previousArtifactRoot === undefined) delete process.env.ADP_ARTIFACT_DIR;
    else process.env.ADP_ARTIFACT_DIR = previousArtifactRoot;
    if (previousRunId === undefined) delete process.env.AGENTIC_DELIVERY_RUN_ID;
    else process.env.AGENTIC_DELIVERY_RUN_ID = previousRunId;
    if (previousEnvironmentFile === undefined) {
      delete process.env.AGENTIC_DELIVERY_INPUT_FOUNDRY_TEST_ENV;
    } else {
      process.env.AGENTIC_DELIVERY_INPUT_FOUNDRY_TEST_ENV = previousEnvironmentFile;
    }
  }

  await access(testDirectory);
  await access(dataDirectory);
});
