import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadBrokerSession } from '../e2e/fixtures/foundry-setup.mjs';

const RUN_ID = '12345678-1234-4123-8123-123456789abc';
const ENDPOINT = `http://foundry-${RUN_ID}:30000`;

test('external fixture rejects missing or malformed broker endpoint', () => {
  assert.throws(
    () => loadBrokerSession({ baseUrl: '', sessionPath: '/dev/null', systemId: 'dnd5e', foundryVersion: '13.351' }),
    /endpoint is missing or outside the broker identity contract/u
  );
  assert.throws(
    () => loadBrokerSession({ baseUrl: 'http://evil.example.com:3000', sessionPath: '/dev/null', systemId: 'dnd5e', foundryVersion: '13.351' }),
    /endpoint is missing or outside the broker identity contract/u
  );
});

test('external fixture validates scoped session identity and secrets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-ext-fixture-'));
  const sessionPath = join(root, 'session.json');

  try {
    // Valid session
    await writeFile(
      sessionPath,
      JSON.stringify({
        schema_version: 1,
        session_id: `session-${RUN_ID}`,
        admin_password: 'a'.repeat(32),
        access_token: 't'.repeat(48),
        logs_url: `${ENDPOINT}/__agentic/logs`,
      }),
      { mode: 0o600 }
    );

    const valid = loadBrokerSession({
      baseUrl: ENDPOINT,
      sessionPath,
      systemId: 'dnd5e',
      foundryVersion: '13.351',
      brokerSystemId: 'dnd5e',
      brokerFoundryVersion: '13.351',
    });
    assert.equal(valid.session_id, `session-${RUN_ID}`);

    // Mismatched system
    assert.throws(
      () =>
        loadBrokerSession({
          baseUrl: ENDPOINT,
          sessionPath,
          systemId: 'dnd5e',
          foundryVersion: '13.351',
          brokerSystemId: 'pf2e',
          brokerFoundryVersion: '13.351',
        }),
      /system differs/u
    );

    // Mismatched version
    assert.throws(
      () =>
        loadBrokerSession({
          baseUrl: ENDPOINT,
          sessionPath,
          systemId: 'dnd5e',
          foundryVersion: '13.351',
          brokerSystemId: 'dnd5e',
          brokerFoundryVersion: '14.364',
        }),
      /version differs/u
    );

    // Session with too-short admin password
    await writeFile(
      sessionPath,
      JSON.stringify({
        schema_version: 1,
        session_id: `session-${RUN_ID}`,
        admin_password: 'short',
        access_token: 't'.repeat(48),
        logs_url: `${ENDPOINT}/__agentic/logs`,
      }),
      { mode: 0o600 }
    );
    assert.throws(
      () =>
        loadBrokerSession({
          baseUrl: ENDPOINT,
          sessionPath,
          systemId: 'dnd5e',
          foundryVersion: '13.351',
          brokerSystemId: 'dnd5e',
          brokerFoundryVersion: '13.351',
        }),
      /session scope is invalid/u
    );

    // Session with wrong session_id (run-id mismatch)
    await writeFile(
      sessionPath,
      JSON.stringify({
        schema_version: 1,
        session_id: 'session-00000000-0000-4000-8000-000000000000',
        admin_password: 'a'.repeat(32),
        access_token: 't'.repeat(48),
        logs_url: `${ENDPOINT}/__agentic/logs`,
      }),
      { mode: 0o600 }
    );
    assert.throws(
      () =>
        loadBrokerSession({
          baseUrl: ENDPOINT,
          sessionPath,
          systemId: 'dnd5e',
          foundryVersion: '13.351',
          brokerSystemId: 'dnd5e',
          brokerFoundryVersion: '13.351',
        }),
      /session scope is invalid/u
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('external fixture refuses world-outside-broker-network endpoint', () => {
  assert.throws(
    () =>
      loadBrokerSession({
        baseUrl: 'http://host.docker.internal:30000',
        sessionPath: '/dev/null',
        systemId: 'dnd5e',
        foundryVersion: '13.351',
      }),
    /endpoint is missing or outside the broker identity contract/u
  );
});
