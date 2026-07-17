import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const REPOSITORY = 'Daxiongmao87/simulacrum-foundry';
const WORKFLOW_PATH = path.join(ROOT, '.github/workflows/announce-new-issue.yml');
const ISSUE_181_FIXTURE_PATH = path.join(ROOT, 'tests/regression/fixtures/issue-181-body.md');
const SUMMARY_LIMIT = 700;
const DEFAULT_ISSUE_URL = 'https://github.com/Daxiongmao87/simulacrum-foundry/issues/181';
const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');
const issue181Body = fs.readFileSync(ISSUE_181_FIXTURE_PATH, 'utf8');
const jqFilter = extractJqFilter(workflow);

function extractJqFilter(source) {
  const startMarker = `jq --arg repository "$REPOSITORY" '`;
  const endMarker = `
          ' "$GITHUB_EVENT_PATH" > discord-payload.json`;
  const commandStart = source.indexOf(startMarker);
  assert.notEqual(commandStart, -1, 'workflow should contain the jq payload command');

  const filterStart = commandStart + startMarker.length;
  const filterEnd = source.indexOf(endMarker, filterStart);
  assert.notEqual(filterEnd, -1, 'workflow should terminate the jq payload command');

  return source.slice(filterStart, filterEnd).replace(/^\n/u, '');
}

function buildPayload({ body = issue181Body, title = 'Feature request' } = {}) {
  const event = {
    issue: {
      number: 181,
      title,
      html_url: DEFAULT_ISSUE_URL,
      body,
      user: {
        login: 'Daxiongmao87',
        html_url: 'https://github.com/Daxiongmao87',
        avatar_url: 'https://avatars.githubusercontent.com/u/967432?v=4',
      },
    },
  };
  const result = spawnSync('jq', ['--arg', 'repository', REPOSITORY, jqFilter], {
    input: JSON.stringify(event),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || 'jq payload generation failed');
  return JSON.parse(result.stdout);
}

function descriptionOf(payload) {
  return payload.embeds[0].description;
}

function assertBalancedCodeDelimiters(description) {
  const fences = description.match(/```/gu) ?? [];
  assert.equal(fences.length % 2, 0, 'code fences must be balanced');

  const withoutFencedBlocks = description.replace(/```[\s\S]*?```/gu, '');
  const withoutEscapedTicks = withoutFencedBlocks.replace(/\\`/gu, '');
  const inlineTicks = withoutEscapedTicks.match(/`/gu) ?? [];
  assert.equal(inlineTicks.length % 2, 0, 'inline-code backticks must be balanced');
}

test('issue 181 Markdown keeps readable sections within the Discord limit', () => {
  const description = descriptionOf(buildPayload());
  const expectedOpening = [
    '**Summary**',
    '',
    'Allow the primary Simulacrum agent to delegate multiple independent, read-only tasks to isolated child agents, then reconcile their findings into one final response.',
    '',
    'This should be implemented as an agent-facing delegation tool rather than as a handoff or a separate user conversation.',
    '',
    '**Motivation**',
    '',
    'Broad campaign-analysis tasks can often be divided into independent workstreams. For example, an audit could inspect journals, actors, and scenes separately.',
  ].join('\n');

  assert.ok(description.startsWith(expectedOpening), description);
  assert.match(description, /(?:^|\n)\*\*Summary\*\*(?:\n|$)/u);
  assert.match(description, /\n\n\*\*Motivation\*\*\n\n/u);
  assert.equal(description.includes('##'), false, 'ATX headings must not survive normalization');
  assert.ok(description.length <= SUMMARY_LIMIT, `description length: ${description.length}`);
  assert.equal(description.endsWith('...'), true, 'fixture should exercise truncation');
  assert.equal(
    description.includes('delegate_read_tasks'),
    false,
    'paragraph truncation must not cut through the inline-code tool name'
  );
  assert.equal(description.includes('```'), false, 'paragraph truncation must omit partial fences');
  assertBalancedCodeDelimiters(description);
});

test('empty bodies retain fallback and payload metadata', () => {
  const payload = buildPayload({ body: null, title: 'Empty issue' });
  const embed = payload.embeds[0];

  assert.equal(embed.description, '_No description provided._');
  assert.equal(embed.title, 'Empty issue');
  assert.equal(embed.url, DEFAULT_ISSUE_URL);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.deepEqual(embed.author, {
    name: 'Opened by @Daxiongmao87',
    url: 'https://github.com/Daxiongmao87',
    icon_url: 'https://avatars.githubusercontent.com/u/967432?v=4',
  });
  assert.deepEqual(embed.fields, [
    {
      name: 'Issue',
      value: `[Open issue #181](${DEFAULT_ISSUE_URL})`,
      inline: false,
    },
  ]);
  assert.deepEqual(embed.footer, { text: REPOSITORY });
});

test('CRLF and CR input normalize without flattening paragraphs', () => {
  const body = '## Summary\r\n\r\nFirst\t\t paragraph.  \r\n\r\n\r\n### Details\rTrailing\ttext';
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description, '**Summary**\n\nFirst paragraph.\n\n**Details**\nTrailing text');
  assert.equal(description.includes('\r'), false);
});

test('long single paragraphs truncate on a complete word', () => {
  const body = Array.from({ length: 200 }, (_value, index) => `word${index}`).join(' ');
  const description = descriptionOf(buildPayload({ body }));

  assert.ok(description.length <= SUMMARY_LIMIT, `description length: ${description.length}`);
  assert.match(description, /word\d+\.\.\.$/u);
});

test('lists retain line boundaries and mentions remain disabled', () => {
  const body = [
    '# Checklist',
    '',
    '- First   item',
    '- Second\titem',
    '- @everyone remains plain text',
  ].join('\n');
  const payload = buildPayload({ body });

  assert.equal(
    descriptionOf(payload),
    '**Checklist**\n\n- First item\n- Second item\n- @everyone remains plain text'
  );
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
});

test('oversized titles retain the Discord title limit', () => {
  const payload = buildPayload({ body: 'Body', title: 'T'.repeat(300) });
  const title = payload.embeds[0].title;

  assert.equal(title.length, 256);
  assert.equal(title, `${'T'.repeat(253)}...`);
});

test('truncation removes incomplete inline code and fenced blocks', () => {
  const inlineBody = `Prefix ${'word '.repeat(150)}\`delegate_read_tasks unfinished`;
  const inlineDescription = descriptionOf(buildPayload({ body: inlineBody }));
  assertBalancedCodeDelimiters(inlineDescription);

  const fencedBody = ['Complete paragraph.', '', '```js', 'x'.repeat(900), '```'].join('\n');
  const fencedDescription = descriptionOf(buildPayload({ body: fencedBody }));
  assertBalancedCodeDelimiters(fencedDescription);
  assert.ok(fencedDescription.length <= SUMMARY_LIMIT);
});

test('ATX-like lines inside fenced code remain unchanged', () => {
  const body = ['## Example', '', '```sh', '# not a heading', 'echo done', '```'].join('\n');
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description, '**Example**\n\n```sh\n# not a heading\necho done\n```');
});

test('inline-code balancing ignores literal backticks inside fenced code', () => {
  const body = [
    'Intro.',
    '',
    '```js',
    'const marker = "`";',
    '```',
    '',
    'Kept after fence.',
    '',
    'x'.repeat(900),
  ].join('\n');
  const description = descriptionOf(buildPayload({ body }));

  assert.match(description, /```js\nconst marker = "`";\n```/u);
  assert.match(description, /Kept after fence\.\.\.$/u);
  assertBalancedCodeDelimiters(description);
});

test('truncation preserves authored bold-only paragraphs', () => {
  const body = ['Intro.', '', '**Do not share this log**', '', 'x'.repeat(900)].join('\n');
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description, 'Intro.\n\n**Do not share this log**...');

  const convertedBody = ['Intro.', '', '## Details', '', 'x'.repeat(900)].join('\n');
  const convertedDescription = descriptionOf(buildPayload({ body: convertedBody }));
  assert.equal(convertedDescription, 'Intro...');
});

test('normalization preserves Markdown-sensitive indentation', () => {
  const body = [
    '## Layout',
    '',
    '- parent   item',
    '  - child   item',
    '',
    '```python',
    'if ready:',
    '    run_task()',
    '```',
    '',
    '    indented   code',
  ].join('\n');
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(
    description,
    [
      '**Layout**',
      '',
      '- parent item',
      '  - child item',
      '',
      '```python',
      'if ready:',
      '    run_task()',
      '```',
      '',
      '    indented   code',
    ].join('\n')
  );
});

test('inline-code balancing ignores escaped literal backticks', () => {
  const body = ['Intro with escaped \\` tick and important tail.', '', 'x'.repeat(900)].join('\n');
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description, 'Intro with escaped \\` tick and important tail...');
  assertBalancedCodeDelimiters(description);
});

test('word fallback keeps non-code Markdown delimiters balanced', () => {
  const boldDescription = descriptionOf(
    buildPayload({ body: `**${'word '.repeat(200).trim()}**` })
  );
  assert.equal((boldDescription.match(/\*\*/gu) ?? []).length % 2, 0);

  const linkBody = `${'prefix '.repeat(94)}[important link label](https://example.com) trailing`;
  const linkDescription = descriptionOf(buildPayload({ body: linkBody }));
  assert.equal((linkDescription.match(/\[/gu) ?? []).length, 0);
  assert.equal((linkDescription.match(/\]/gu) ?? []).length, 0);

  const autolinkBody = `<https://example.com/${'x'.repeat(800)}>`;
  const autolinkDescription = descriptionOf(buildPayload({ body: autolinkBody }));
  assert.equal(
    (autolinkDescription.match(/</gu) ?? []).length,
    (autolinkDescription.match(/>/gu) ?? []).length
  );
});

test('truncation places the ellipsis after a closing fence', () => {
  const body = ['Intro.', '', '```js', 'code', '```', '', 'x'.repeat(900)].join('\n');
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description, 'Intro.\n\n```js\ncode\n```\n...');
  assertBalancedCodeDelimiters(description);
});
