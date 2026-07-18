import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { isOwnedTestDirectory } from '../e2e/setup/global-teardown.mjs';
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
