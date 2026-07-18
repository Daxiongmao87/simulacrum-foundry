import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  externalBrokerConfiguration,
  findFoundryDistribution,
  loadFoundryEnvironment,
  playwrightResultsPath,
  resolveFoundryEnvironment,
  removeGovernedRuntimeRoot,
  selectFoundryRuntimeRoot,
} from '../e2e/fixtures/agentic-foundry-inputs.mjs';

test('governed Foundry inputs are read directly from external regular files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-external-inputs-'));
  const externalEnv = join(root, 'foundry-test-env');
  const externalZip = join(root, 'FoundryVTT-Node-13.351.zip');

  try {
    await writeFile(
      externalEnv,
      'FOUNDRY_LICENSE_KEY=licensed-value\nFOUNDRY_ADMIN_KEY=admin-value\n'
    );
    await writeFile(externalZip, 'licensed-archive');

    const environment = loadFoundryEnvironment({
      environment: {
        AGENTIC_DELIVERY_INPUT_FOUNDRY_TEST_ENV: externalEnv,
      },
      localPath: join(root, 'missing-local-env'),
    });
    const distribution = findFoundryDistribution('13.351', {
      environment: {
        AGENTIC_DELIVERY_INPUT_FOUNDRY_V13_351_ZIP: externalZip,
      },
      vendorDirectory: join(root, 'missing-vendor'),
    });

    assert.equal(environment.FOUNDRY_LICENSE_KEY, 'licensed-value');
    assert.equal(environment.FOUNDRY_ADMIN_KEY, 'admin-value');
    assert.equal(distribution, externalZip);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('file-sourced lifecycle configuration resolves one broker and result contract', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-resolved-environment-'));
  const artifactRoot = join(root, 'artifacts');
  const externalEnv = join(root, 'foundry-test-env');
  const endpoint = 'http://foundry-12345678-1234-4123-8123-123456789abc:30000';

  try {
    await mkdir(artifactRoot);
    await writeFile(
      externalEnv,
      [
        `ADP_ARTIFACT_DIR=${artifactRoot}`,
        'AGENTIC_DELIVERY_RUN_ID=file-environment-test',
        `ADP_FOUNDRY_ENDPOINT=${endpoint}`,
        'ADP_FOUNDRY_SESSION_FILE=/run/agentic-delivery/inputs/foundry_session',
        'ADP_FOUNDRY_VERSION=13.351',
        'ADP_GAME_SYSTEM=dnd5e',
      ].join('\n')
    );

    const environment = resolveFoundryEnvironment({
      environment: {
        AGENTIC_DELIVERY_INPUT_FOUNDRY_TEST_ENV: externalEnv,
      },
    });

    assert.equal(environment.ADP_ARTIFACT_DIR, artifactRoot);
    assert.equal(environment.AGENTIC_DELIVERY_RUN_ID, 'file-environment-test');
    assert.deepEqual(externalBrokerConfiguration(environment), {
      baseUrl: endpoint,
      sessionPath: '/run/agentic-delivery/inputs/foundry_session',
      foundryVersion: '13.351',
      systemId: 'dnd5e',
    });
    assert.equal(
      playwrightResultsPath(environment, root),
      join(artifactRoot, 'reports', 'results.json')
    );
    assert.throws(
      () => externalBrokerConfiguration({ ADP_FOUNDRY_ENDPOINT: endpoint }),
      /requires ADP_FOUNDRY_SESSION_FILE/u
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('local Foundry versions resolve their explicitly requested licensed archive', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-local-foundry-version-'));
  const localArchive = join(root, 'FoundryVTT-Node-13.350.zip');

  try {
    await writeFile(localArchive, 'licensed-local-archive');

    assert.equal(
      findFoundryDistribution('13.350', {
        environment: {},
        vendorDirectory: root,
      }),
      localArchive
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('governed Foundry inputs reject symbolic links and unsupported versions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-unsafe-inputs-'));
  const externalEnv = join(root, 'foundry-test-env');
  const linkedEnv = join(root, 'linked-env');

  try {
    await writeFile(externalEnv, 'FOUNDRY_LICENSE_KEY=licensed-value\n');
    await symlink(externalEnv, linkedEnv);

    assert.throws(
      () =>
        loadFoundryEnvironment({
          environment: {
            AGENTIC_DELIVERY_INPUT_FOUNDRY_TEST_ENV: linkedEnv,
          },
          localPath: join(root, 'missing-local-env'),
        }),
      /regular non-symbolic file/u
    );
    assert.throws(
      () =>
        findFoundryDistribution('12.999', {
          environment: {},
          vendorDirectory: root,
        }),
      /unsupported Foundry version/u
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('governed runtime storage fails closed when the artifact mount is not executable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-runtime-root-'));
  const artifactRoot = join(root, 'artifacts');
  const fallbackRoot = join(root, 'repository');

  try {
    await mkdir(artifactRoot);
    await mkdir(fallbackRoot);

    assert.throws(
      () =>
        selectFoundryRuntimeRoot({
          artifactRoot,
          requestedPath: null,
          fallbackRoot,
          executableProbe: () => false,
          ownerId: 'non-executable-runtime-test',
        }),
      /governed Foundry runtime root is not executable/u
    );
    assert.equal(existsSync(join(artifactRoot, '.foundry-runtime')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('local runtime storage rejects non-executable tmpfs and uses the repository fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-runtime-fallback-'));
  const requestedPath = join(root, 'tmpfs');
  const fallbackRoot = join(root, 'repository');
  const probed = [];

  try {
    await mkdir(requestedPath);
    await mkdir(fallbackRoot);

    const selected = selectFoundryRuntimeRoot({
      artifactRoot: null,
      requestedPath,
      fallbackRoot,
      executableProbe: candidate => {
        probed.push(candidate);
        return candidate === fallbackRoot;
      },
    });

    assert.equal(selected, fallbackRoot);
    assert.deepEqual(probed, [requestedPath, fallbackRoot]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('governed runtime cleanup removes only its exact external runtime root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-runtime-cleanup-'));
  const artifactRoot = join(root, 'artifacts');
  const fallbackRoot = join(root, 'repository');

  try {
    await mkdir(artifactRoot);
    await mkdir(fallbackRoot);
    const runtimeRoot = selectFoundryRuntimeRoot({
      artifactRoot,
      requestedPath: null,
      fallbackRoot,
      executableProbe: () => true,
      ownerId: 'governed-runtime-cleanup-test',
    });
    await writeFile(join(runtimeRoot, 'licensed-runtime-byte'), 'temporary');

    assert.throws(
      () => removeGovernedRuntimeRoot(fallbackRoot, artifactRoot),
      /refusing to remove an unowned Foundry runtime root/u
    );
    removeGovernedRuntimeRoot(runtimeRoot, artifactRoot, 'governed-runtime-cleanup-test');

    assert.equal(existsSync(runtimeRoot), false);
    assert.equal(existsSync(artifactRoot), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('governed runtime refuses to adopt or remove a pre-existing unowned child', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-runtime-unowned-'));
  const artifactRoot = join(root, 'artifacts');
  const runtimeRoot = join(artifactRoot, '.foundry-runtime');
  const unownedChild = join(runtimeRoot, 'pre-existing-unowned');

  try {
    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(unownedChild, 'preserve');

    assert.throws(
      () =>
        selectFoundryRuntimeRoot({
          artifactRoot,
          requestedPath: null,
          fallbackRoot: root,
          executableProbe: () => true,
          ownerId: 'current-run',
        }),
      /valid current-run ownership marker/u
    );
    assert.equal(existsSync(unownedChild), true);
    assert.throws(
      () => removeGovernedRuntimeRoot(runtimeRoot, artifactRoot, 'current-run'),
      /valid current-run ownership marker/u
    );
    assert.equal(existsSync(unownedChild), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
