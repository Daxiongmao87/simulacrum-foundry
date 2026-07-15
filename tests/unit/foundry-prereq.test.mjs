import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const SCRIPT_SOURCE = join(process.cwd(), 'tools', 'agentic-delivery', 'foundry-prereq.mjs');

test('foundry prerequisite prepares the supported matrix when no ADP selectors are provided', async () => {
  const root = await createTempRepo();
  const inputs = join(root, '.inputs');

  try {
    await mkdir(inputs, { recursive: true });
    await writeFile(join(inputs, 'foundry-license-key'), 'licensed-key\n');
    await writeFile(join(inputs, 'FoundryVTT-Node-13.351.zip'), 'zip-13');
    await writeFile(join(inputs, 'FoundryVTT-Node-14.364.zip'), 'zip-14');

    const result = await runPrereq(root, 'prepare', {
      AGENTIC_DELIVERY_INPUT_FOUNDRY_LICENSE_KEY: join(inputs, 'foundry-license-key'),
      AGENTIC_DELIVERY_INPUT_FOUNDRY_V13_351_ZIP: join(inputs, 'FoundryVTT-Node-13.351.zip'),
      AGENTIC_DELIVERY_INPUT_FOUNDRY_V14_364_ZIP: join(inputs, 'FoundryVTT-Node-14.364.zip'),
    });

    assert.equal(result.exitCode, 0, result.stderr || result.stdout);
    const envBody = await readFile(join(root, 'tests', 'e2e', '.env.test'), 'utf8');
    assert.match(envBody, /^TEST_FOUNDRY_VERSIONS=13\.351,14\.364$/mu);
    assert.match(envBody, /^TEST_SYSTEM_IDS=dnd5e,pf2e$/mu);
    const state = JSON.parse(
      await readFile(join(root, 'tests', 'e2e', 'setup', '.agentic-delivery-foundry-state.json'), 'utf8')
    );
    for (const link of state.zip_links) {
      assert.ok(link.foundry_version, 'missing foundry_version');
      assert.ok(link.zip_input_id, 'missing zip_input_id');
      assert.ok(link.target_path, 'missing target_path');
      assert.ok(link.sha256, 'missing sha256');

      // Vendor target must be a regular file, not a symlink
      const targetStat = await stat(link.target_path);
      assert.ok(targetStat.isFile(), `vendor target ${link.target_path} should be a regular file`);
    }
  } finally {
    await runPrereq(root, 'cleanup', {});
    await rm(root, { recursive: true, force: true });
  }
});

test('foundry prerequisite narrows preparation to the requested matrix selector', async () => {
  const root = await createTempRepo();
  const inputs = join(root, '.inputs');

  try {
    await mkdir(inputs, { recursive: true });
    await writeFile(join(inputs, 'foundry-license-key'), 'licensed-key\n');
    await writeFile(join(inputs, 'FoundryVTT-Node-13.351.zip'), 'zip-13');

    const result = await runPrereq(root, 'prepare', {
      ADP_FOUNDRY_VERSION: '13.351',
      ADP_GAME_SYSTEM: 'dnd5e',
      AGENTIC_DELIVERY_INPUT_FOUNDRY_LICENSE_KEY: join(inputs, 'foundry-license-key'),
      AGENTIC_DELIVERY_INPUT_FOUNDRY_V13_351_ZIP: join(inputs, 'FoundryVTT-Node-13.351.zip'),
    });

    assert.equal(result.exitCode, 0, result.stderr || result.stdout);
    const envBody = await readFile(join(root, 'tests', 'e2e', '.env.test'), 'utf8');
    assert.match(envBody, /^TEST_FOUNDRY_VERSIONS=13\.351$/mu);
    assert.match(envBody, /^TEST_SYSTEM_IDS=dnd5e$/mu);

    const state = JSON.parse(
      await readFile(join(root, 'tests', 'e2e', 'setup', '.agentic-delivery-foundry-state.json'), 'utf8')
    );
    assert.equal(state.zip_links.length, 1);
    assert.equal(state.zip_links[0].foundry_version, '13.351');
    assert.ok(state.zip_links[0].sha256, 'sha256 must be recorded');
    const selTargetStat = await stat(state.zip_links[0].target_path);
    assert.ok(selTargetStat.isFile(), 'vendor target should be a regular file');
  } finally {
    await runPrereq(root, 'cleanup', {});
    await rm(root, { recursive: true, force: true });
  }
});

test('foundry prerequisite verifies prepared state without re-reading external inputs', async () => {
  const root = await createTempRepo();
  const inputs = join(root, '.inputs');

  try {
    await mkdir(inputs, { recursive: true });
    await writeFile(join(inputs, 'foundry-license-key'), 'licensed-key\n');
    await writeFile(join(inputs, 'FoundryVTT-Node-13.351.zip'), 'zip-13');

    const prepareResult = await runPrereq(root, 'prepare', {
      ADP_FOUNDRY_VERSION: '13.351',
      ADP_GAME_SYSTEM: 'dnd5e',
      AGENTIC_DELIVERY_INPUT_FOUNDRY_LICENSE_KEY: join(inputs, 'foundry-license-key'),
      AGENTIC_DELIVERY_INPUT_FOUNDRY_V13_351_ZIP: join(inputs, 'FoundryVTT-Node-13.351.zip'),
    });
    assert.equal(prepareResult.exitCode, 0, prepareResult.stderr || prepareResult.stdout);

    // Remove inputs dir to simulate verify/cleanup container (no /run/agentic-delivery/inputs mount)
    await rm(inputs, { recursive: true, force: true });

    // Assert vendor targets are regular files (copied, not symlinked)
    const state = JSON.parse(
      await readFile(join(root, 'tests', 'e2e', 'setup', '.agentic-delivery-foundry-state.json'), 'utf8')
    );
    for (const link of state.zip_links) {
      const tgtStat = await stat(link.target_path);
      assert.ok(tgtStat.isFile(), `vendor target ${link.target_path} should be a regular file`);
    }

    const verifyResult = await runPrereq(root, 'verify', {
      ADP_FOUNDRY_VERSION: '13.351',
      ADP_GAME_SYSTEM: 'dnd5e',
    });
    assert.equal(verifyResult.exitCode, 0, verifyResult.stderr || verifyResult.stdout);
  } finally {
    await runPrereq(root, 'cleanup', {});
    await rm(root, { recursive: true, force: true });
  }
});

test('foundry prerequisite prepares broker-backed E2E inputs from a scoped session file', async () => {
  const root = await createTempRepo();
  const inputs = join(root, '.inputs');

  try {
    await mkdir(inputs, { recursive: true });
    await writeFile(
      join(inputs, 'foundry-broker-session.json'),
      JSON.stringify({
        schema_version: 1,
        session_id: 'session-12345678-1234-4123-8123-123456789abc',
        admin_password: 'a'.repeat(32),
        access_token: 't'.repeat(48),
        logs_url: 'http://foundry-12345678-1234-4123-8123-123456789abc:30000/__agentic/logs',
      }),
      { mode: 0o600 }
    );

    const result = await runPrereq(root, 'prepare', {
      ADP_FOUNDRY_VERSION: '14.364',
      ADP_GAME_SYSTEM: 'pf2e',
      AGENTIC_DELIVERY_INPUT_FOUNDRY_BROKER_SESSION: join(
        inputs,
        'foundry-broker-session.json'
      ),
    });

    assert.equal(result.exitCode, 0, result.stderr || result.stdout);
    const envBody = await readFile(join(root, 'tests', 'e2e', '.env.test'), 'utf8');
    assert.match(
      envBody,
      /^ADP_FOUNDRY_ENDPOINT=http:\/\/foundry-12345678-1234-4123-8123-123456789abc:30000$/mu
    );
    assert.match(
      envBody,
      /^ADP_FOUNDRY_SESSION_FILE=.*foundry-broker-session\.json$/mu
    );
    assert.match(envBody, /^TEST_FOUNDRY_VERSIONS=14\.364$/mu);
    assert.match(envBody, /^TEST_SYSTEM_IDS=pf2e$/mu);

    const state = JSON.parse(
      await readFile(join(root, 'tests', 'e2e', 'setup', '.agentic-delivery-foundry-state.json'), 'utf8')
    );
    assert.equal(state.mode, 'broker');
    assert.equal(
      state.broker_endpoint,
      'http://foundry-12345678-1234-4123-8123-123456789abc:30000'
    );
    assert.equal(
      state.broker_session_path,
      join(inputs, 'foundry-broker-session.json')
    );

    const verifyResult = await runPrereq(root, 'verify', {
      ADP_FOUNDRY_VERSION: '14.364',
      ADP_GAME_SYSTEM: 'pf2e',
    });
    assert.equal(verifyResult.exitCode, 0, verifyResult.stderr || verifyResult.stdout);
  } finally {
    await runPrereq(root, 'cleanup', {});
    await rm(root, { recursive: true, force: true });
  }
});

async function createTempRepo() {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-foundry-prereq-'));
  const scriptTarget = join(root, 'tools', 'agentic-delivery');
  await mkdir(scriptTarget, { recursive: true });
  await mkdir(join(root, 'tests', 'e2e'), { recursive: true });
  await writeFile(join(scriptTarget, 'foundry-prereq.mjs'), await readFile(SCRIPT_SOURCE, 'utf8'));
  return root;
}

function runPrereq(root, action, extraEnv) {
  const statePath = join(root, 'tests', 'e2e', 'setup', '.agentic-delivery-foundry-state.json');
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [join(root, 'tools', 'agentic-delivery', 'foundry-prereq.mjs'), action],
      {
        cwd: root,
        env: { ...process.env, ...extraEnv },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.once('error', reject);
    child.once('exit', async exitCode => {
      if (action === 'cleanup') {
        await rm(statePath, { force: true }).catch(() => {});
      }
      resolve({
        exitCode,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
}
