import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import AgenticArtifactReporter from '../e2e/reporters/agentic-artifact-reporter.mjs';

test('agentic reporter writes each required evidence category to the bounded output root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-agentic-artifacts-'));
  const source = join(root, 'source.zip');
  await writeFile(source, 'trace evidence');
  const previous = process.env.ADP_ARTIFACT_DIR;
  process.env.ADP_ARTIFACT_DIR = root;

  try {
    const reporter = new AgenticArtifactReporter();
    await reporter.onTestEnd(
      {
        id: 'bounded/test',
        parent: { project: () => ({ name: 'foundry-14.364' }) },
      },
      {
        attachments: [
          { name: 'screenshot', body: Buffer.from('png'), contentType: 'image/png' },
          { name: 'video', body: Buffer.from('video'), contentType: 'video/webm' },
          { name: 'trace', path: source, contentType: 'application/zip' },
          {
            name: 'browser-console.json',
            body: Buffer.from('[]'),
            contentType: 'application/json',
          },
          { name: 'dom-0.html', body: Buffer.from('<main></main>'), contentType: 'text/html' },
          {
            name: 'accessibility-0.json',
            body: Buffer.from('{}'),
            contentType: 'application/json',
          },
        ],
      }
    );

    for (const category of ['screenshots', 'video', 'trace', 'console', 'dom', 'accessibility']) {
      const entries = await readdir(join(root, category));
      assert.equal(entries.length, 1, `${category} evidence was not retained exactly once`);
    }
    assert.equal(await readFile(source, 'utf8'), 'trace evidence');
  } finally {
    if (previous === undefined) delete process.env.ADP_ARTIFACT_DIR;
    else process.env.ADP_ARTIFACT_DIR = previous;
    await rm(root, { recursive: true });
  }
});

test('agentic reporter honors a file-sourced bounded output root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-file-agentic-artifacts-'));
  const environmentFile = join(root, 'foundry-test-env');
  await writeFile(environmentFile, `ADP_ARTIFACT_DIR=${root}\n`);
  const previousArtifactRoot = process.env.ADP_ARTIFACT_DIR;
  const previousEnvironmentFile = process.env.AGENTIC_DELIVERY_INPUT_FOUNDRY_TEST_ENV;
  delete process.env.ADP_ARTIFACT_DIR;
  process.env.AGENTIC_DELIVERY_INPUT_FOUNDRY_TEST_ENV = environmentFile;

  try {
    const reporter = new AgenticArtifactReporter();
    await reporter.onTestEnd(
      {
        id: 'file-sourced/test',
        parent: { project: () => ({ name: 'foundry-13.351' }) },
      },
      {
        attachments: [{ name: 'screenshot', body: Buffer.from('png'), contentType: 'image/png' }],
      }
    );

    const screenshots = await readdir(join(root, 'screenshots'));
    assert.equal(screenshots.length, 1);
  } finally {
    if (previousArtifactRoot === undefined) delete process.env.ADP_ARTIFACT_DIR;
    else process.env.ADP_ARTIFACT_DIR = previousArtifactRoot;
    if (previousEnvironmentFile === undefined) {
      delete process.env.AGENTIC_DELIVERY_INPUT_FOUNDRY_TEST_ENV;
    } else {
      process.env.AGENTIC_DELIVERY_INPUT_FOUNDRY_TEST_ENV = previousEnvironmentFile;
    }
    await rm(root, { recursive: true });
  }
});
