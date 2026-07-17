import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import AgenticArtifactReporter from '../e2e/reporters/agentic-artifact-reporter.mjs';

const EVIDENCE_CATEGORIES = [
  'screenshots',
  'video',
  'trace',
  'console',
  'service-logs',
  'dom',
  'accessibility',
];

function evidenceAttachments(source) {
  return [
    { name: 'screenshot', body: Buffer.from('png'), contentType: 'image/png' },
    { name: 'video', body: Buffer.from('video'), contentType: 'video/webm' },
    { name: 'trace', path: source, contentType: 'application/zip' },
    {
      name: 'browser-console.json',
      body: Buffer.from('[]'),
      contentType: 'application/json',
    },
    { name: 'foundry-stdout.log', body: Buffer.from('stdout'), contentType: 'text/plain' },
    { name: 'dom-0.html', body: Buffer.from('<main></main>'), contentType: 'text/html' },
    {
      name: 'accessibility-0.json',
      body: Buffer.from('{}'),
      contentType: 'application/json',
    },
  ];
}

async function assertEvidenceCategories(root) {
  for (const category of EVIDENCE_CATEGORIES) {
    const entries = await readdir(join(root, category));
    assert.equal(entries.length, 1, `${category} evidence was not retained exactly once`);
  }
}

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
        attachments: evidenceAttachments(source),
      }
    );

    await assertEvidenceCategories(root);
    assert.equal(await readFile(source, 'utf8'), 'trace evidence');
  } finally {
    if (previous === undefined) delete process.env.ADP_ARTIFACT_DIR;
    else process.env.ADP_ARTIFACT_DIR = previous;
    await rm(root, { recursive: true });
  }
});
