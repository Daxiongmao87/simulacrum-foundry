import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  collectFoundryLogs,
  loadBrokerSession,
} from '../e2e/fixtures/foundry-setup.mjs';

const RUN_ID = '12345678-1234-4123-8123-123456789abc';
const ENDPOINT = `http://foundry-${RUN_ID}:30000`;

test('broker session is bound to endpoint and exact Foundry matrix', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-broker-session-'));
  const sessionPath = join(root, 'session.json');
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

  try {
    const session = loadBrokerSession({
      baseUrl: ENDPOINT,
      sessionPath,
      systemId: 'dnd5e',
      foundryVersion: '13.351',
      brokerSystemId: 'dnd5e',
      brokerFoundryVersion: '13.351',
    });
    assert.equal(session.session_id, `session-${RUN_ID}`);

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
  } finally {
    await rm(root, { recursive: true });
  }
});

test('broker log evidence requires the scoped bearer token', async () => {
  const token = 'scoped-token-value-with-at-least-32-bytes';
  const server = http.createServer((request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ stdout: ['Foundry ready'], stderr: [] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  try {
    const logs = await collectFoundryLogs({
      externalBroker: true,
      logsUrl: `http://127.0.0.1:${address.port}`,
      accessToken: token,
    });
    assert.deepEqual(logs, { stdout: ['Foundry ready'], stderr: [] });
  } finally {
    await new Promise((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
  }
});

test('broker session enforces scoped log authorization and rejects token leakage', async () => {
  const token = 'scoped-token-value-with-at-least-32-bytes';
  const leaked = token.slice(0, 20);
  const server = http.createServer((request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401).end();
      return;
    }
    if (request.url === '/__agentic/leaked') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ stdout: [`leaked: ${token}`], stderr: [] }));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ stdout: ['clean log line'], stderr: [] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  try {
    const safe = await collectFoundryLogs({
      externalBroker: true,
      logsUrl: `http://127.0.0.1:${address.port}`,
      accessToken: token,
    });
    assert.deepEqual(safe.stdout, ['clean log line']);

    await assert.rejects(
      collectFoundryLogs({
        externalBroker: true,
        logsUrl: `http://127.0.0.1:${address.port}/__agentic/leaked`,
        accessToken: token,
      }),
      /leaked the scoped session token/u
    );
  } finally {
    await new Promise((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
  }
});
