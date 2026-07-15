import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
      await readFile('/tmp/simulacrum-agentic-delivery-foundry-state.json', 'utf8')
    );
    assert.deepEqual(state.foundry_versions, ['13.351', '14.364']);
    assert.deepEqual(state.system_ids, ['dnd5e', 'pf2e']);
    assert.equal(state.zip_links.length, 2);
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

async function createTempRepo() {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-foundry-prereq-'));
  const scriptTarget = join(root, 'tools', 'agentic-delivery');
  await mkdir(scriptTarget, { recursive: true });
  await mkdir(join(root, 'tests', 'e2e'), { recursive: true });
  await writeFile(join(scriptTarget, 'foundry-prereq.mjs'), await readFile(SCRIPT_SOURCE, 'utf8'));
  return root;
}

function runPrereq(root, action, extraEnv) {
  const statePath = '/tmp/simulacrum-agentic-delivery-foundry-state.json';
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
