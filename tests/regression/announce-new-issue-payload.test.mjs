import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DESCRIPTION_LIMIT,
  buildDiscordPayload,
  formatDescription,
} from '../../.github/scripts/build-issue-announcement.mjs';

const ROOT = process.cwd();
const REPOSITORY = 'Daxiongmao87/simulacrum-foundry';
const SCRIPT_PATH = path.join(ROOT, '.github/scripts/build-issue-announcement.mjs');
const FIXTURE_PATH = path.join(ROOT, 'tests/regression/fixtures/issue-181-body.md');
const ISSUE_URL = 'https://github.com/Daxiongmao87/simulacrum-foundry/issues/181';
const issue181Body = fs.readFileSync(FIXTURE_PATH, 'utf8');

function issueEvent({ body = issue181Body, title = 'Feature request' } = {}) {
  return {
    issue: {
      number: 181,
      title,
      html_url: ISSUE_URL,
      body,
      user: {
        login: 'Daxiongmao87',
        html_url: 'https://github.com/Daxiongmao87',
        avatar_url: 'https://avatars.githubusercontent.com/u/967432?v=4',
      },
    },
  };
}

function descriptionFor(body) {
  return formatDescription(body);
}

test('issue 181 keeps readable complete sections within the Discord limit', () => {
  const description = descriptionFor(issue181Body);
  const opening = [
    '**Summary**',
    '',
    'Allow the primary Simulacrum agent to delegate multiple independent, read-only tasks to isolated child agents, then reconcile their findings into one final response.',
    '',
    'This should be implemented as an agent-facing delegation tool rather than as a handoff or a separate user conversation.',
    '',
    '**Motivation**',
  ].join('\n');

  assert.ok(description.startsWith(opening), description);
  assert.match(description, /\n\n\*\*Motivation\*\*\n\n/u);
  assert.equal(description.includes('**Proposed behavior**'), false);
  assert.equal(description.includes('delegate_read_tasks'), false);
  assert.equal(description.endsWith('\n\n...'), true);
  assert.ok(description.length <= DESCRIPTION_LIMIT, description.length);
});

test('empty bodies retain fallback metadata and disable mentions', () => {
  const payload = buildDiscordPayload(issueEvent({ body: null, title: 'Empty issue' }), REPOSITORY);
  const embed = payload.embeds[0];

  assert.equal(embed.description, '_No description provided._');
  assert.equal(embed.title, 'Empty issue');
  assert.equal(embed.url, ISSUE_URL);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.deepEqual(embed.author, {
    name: 'Opened by @Daxiongmao87',
    url: 'https://github.com/Daxiongmao87',
    icon_url: 'https://avatars.githubusercontent.com/u/967432?v=4',
  });
  assert.deepEqual(embed.fields, [
    {
      name: 'Issue',
      value: `[Open issue #181](${ISSUE_URL})`,
      inline: false,
    },
  ]);
  assert.deepEqual(embed.footer, { text: REPOSITORY });
});

test('line ending and prose normalization preserve paragraph boundaries', () => {
  const body = '## Summary\r\n\r\nFirst\t\t paragraph.  \r\n\r\n\r\n### Details\rTrailing\ttext';

  assert.equal(
    descriptionFor(body),
    '**Summary**\n\nFirst paragraph.\n\n**Details**\nTrailing text'
  );
});

test('lists retain line boundaries and leading indentation', () => {
  const body = [
    '# Checklist',
    '',
    '- First   item',
    '  - Nested\titem',
    '- @everyone remains plain text',
  ].join('\n');

  assert.equal(
    descriptionFor(body),
    '**Checklist**\n\n- First item\n  - Nested item\n- @everyone remains plain text'
  );
});

test('supported code blocks preserve whitespace and heading-like content', () => {
  const indentedTrailing = '    value  \t';
  const quotedTrailing = '>     value  \t';
  const spacedTab = '  \t# spaced tab heading-like code';
  const quotedSpacedTab = '>  \t# quoted spaced tab heading-like code';
  const body = [
    '# Outside',
    '',
    '    printf "a  b"',
    indentedTrailing,
    '',
    '\t# literal heading-like code',
    spacedTab,
    '',
    '>     quoted  code',
    quotedTrailing,
    quotedSpacedTab,
    '',
    '```md',
    '# literal heading',
    'printf "c  d"',
    '```',
  ].join('\n');

  assert.equal(
    descriptionFor(body),
    [
      '**Outside**',
      '',
      '    printf "a  b"',
      indentedTrailing,
      '',
      '\t# literal heading-like code',
      spacedTab,
      '',
      '>     quoted  code',
      quotedTrailing,
      quotedSpacedTab,
      '',
      '```md',
      '# literal heading',
      'printf "c  d"',
      '```',
    ].join('\n')
  );
});

test('unsupported tilde fences remain ordinary normalized text', () => {
  const body = ['~~~md', '# ordinary heading', 'printf "a  b"', '~~~'].join('\n');

  assert.equal(descriptionFor(body), '~~~md\n**ordinary heading**\nprintf "a b"\n~~~');
});

test('truncation keeps complete blocks and drops a dangling heading and fence', () => {
  const keptParagraph = 'word '.repeat(110).trim();
  const body = [
    '## Kept',
    '',
    keptParagraph,
    '',
    '## Omitted',
    '',
    '```js',
    'const value = 1; '.repeat(80).trim(),
    '```',
  ].join('\n');
  const description = descriptionFor(body);

  assert.equal(description, `**Kept**\n\n${keptParagraph}\n\n...`);
  assert.equal(description.includes('**Omitted**'), false);
  assert.equal(description.includes('```'), false);
  assert.ok(description.length <= DESCRIPTION_LIMIT, description.length);
});

test('word fallback skips generated headings and retains oversized prose', () => {
  const body = ['## Heading', '', 'oversized '.repeat(100).trim()].join('\n');
  const description = descriptionFor(body);

  assert.equal(description.includes('Heading'), false);
  assert.match(description, /^oversized(?: oversized)+\.\.\.$/u);
  assert.ok([...description].length <= DESCRIPTION_LIMIT);
});

test('truncation preserves authored standalone bold paragraphs', () => {
  const warning = '**Do not share this log**';
  const body = ['Intro', '', warning, '', 'oversized '.repeat(100).trim()].join('\n');

  assert.equal(descriptionFor(body), `Intro\n\n${warning}\n\n...`);
});

test('an oversized first block truncates on a complete word', () => {
  const body = Array.from({ length: 200 }, (_value, index) => `word${index}`).join(' ');
  const description = descriptionFor(body);

  assert.match(description, /word\d+\.\.\.$/u);
  assert.ok(description.length <= DESCRIPTION_LIMIT, description.length);
  assert.equal(description.includes('word199'), false);
});

test('description bounds count Unicode code points without splitting astral text', () => {
  const inBudget = '😀'.repeat(400);
  const truncated = descriptionFor('😀'.repeat(800));

  assert.equal(descriptionFor(inBudget), inBudget);
  assert.equal(truncated, `${'😀'.repeat(697)}...`);
  assert.equal([...truncated].length, DESCRIPTION_LIMIT);
  assert.doesNotMatch(truncated, /\p{Surrogate}/u);
});

test('bounded formatting leaves inline Markdown semantics untouched', () => {
  const body = 'Keep **unmatched emphasis, [label][ref], and `inline code exactly.';

  assert.equal(descriptionFor(body), body);
});

test('oversized titles retain the Discord title limit', () => {
  const payload = buildDiscordPayload(
    issueEvent({ body: 'Body', title: 'T'.repeat(300) }),
    REPOSITORY
  );

  assert.equal(payload.embeds[0].title.length, 256);
  assert.equal(payload.embeds[0].title.endsWith('...'), true);
});

test('title bounds count Unicode code points without splitting astral text', () => {
  const inBudget = `${'T'.repeat(252)}😀foo`;
  const boundedPayload = buildDiscordPayload(
    issueEvent({ body: 'Body', title: inBudget }),
    REPOSITORY
  );
  const truncatedPayload = buildDiscordPayload(
    issueEvent({ body: 'Body', title: '😀'.repeat(300) }),
    REPOSITORY
  );
  const truncated = truncatedPayload.embeds[0].title;

  assert.equal(boundedPayload.embeds[0].title, inBudget);
  assert.equal(truncated, `${'😀'.repeat(253)}...`);
  assert.equal([...truncated].length, 256);
  assert.doesNotMatch(truncated, /\p{Surrogate}/u);
});

test('command line entry point writes the workflow payload', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'simulacrum-announcement-'));
  const eventPath = path.join(directory, 'event.json');
  const outputPath = path.join(directory, 'payload.json');

  try {
    fs.writeFileSync(eventPath, JSON.stringify(issueEvent({ body: '# CLI\n\nBody' })));
    const result = spawnSync(process.execPath, [SCRIPT_PATH, eventPath, outputPath], {
      encoding: 'utf8',
      env: { ...process.env, REPOSITORY },
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(payload.embeds[0].description, '**CLI**\n\nBody');
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
