import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { isOwnedTestDirectory } from '../e2e/setup/global-teardown.mjs';
import { isFoundryPortFree } from '../e2e/fixtures/foundry-setup.mjs';

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
