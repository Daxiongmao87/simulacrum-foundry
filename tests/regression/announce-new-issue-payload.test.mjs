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

function buildPayload({ body = issue181Body, title = 'Feature request', timeout } = {}) {
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
    timeout,
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
  const inlineRuns = [...withoutEscapedTicks.matchAll(/`+/gu)].map(match => match[0].length);
  let openRun = null;
  for (const runLength of inlineRuns) {
    if (openRun === null) {
      openRun = runLength;
    } else if (runLength === openRun) {
      openRun = null;
    }
  }
  assert.equal(openRun, null, 'inline-code backtick runs must be balanced');
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
  assert.equal(boldDescription.startsWith('**'), false);

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

test('backticks with a text suffix do not close fenced code', () => {
  const body = ['```text', '```not-a-close', '# value', '```'].join('\n');
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description, '```text\n```not-a-close\n# value\n```');
});

test('non-code repair ignores emphasis inside completed inline code', () => {
  const body = `Inline \`a*b\` important value. ${'word '.repeat(180)}`;
  const description = descriptionOf(buildPayload({ body }));

  assert.match(description, /Inline `a\*b` important value\./u);
  assertBalancedCodeDelimiters(description);
});

test('inline-code balancing pairs delimiter runs by length', () => {
  const body = `Prefix \`\` \` \`\` important tail. ${'word '.repeat(180)}`;
  const description = descriptionOf(buildPayload({ body }));

  assert.match(description, /Prefix `` ` `` important tail\./u);
  assertBalancedCodeDelimiters(description);
});

test('autolink cleanup preserves literal less-than comparisons', () => {
  const body = `Keep values where count < limit and preserve this explanation. ${'word '.repeat(180)}`;
  const description = descriptionOf(buildPayload({ body }));

  assert.match(description, /count < limit and preserve this explanation\./u);
});

test('heading markers do not consume the visible length budget', () => {
  const body = ['# H', '', 'a'.repeat(591), '', 'b'.repeat(100)].join('\n');
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description.length, SUMMARY_LIMIT);
  assert.equal(description, `**H**\n\n${'a'.repeat(591)}\n\n${'b'.repeat(100)}`);
});

test('word fallback excludes heading markers from its slice budget', () => {
  const headings = Array.from({ length: 10 }, () => '# H');
  const body = [...headings, 'x '.repeat(1000)].join('\n');
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description.length, 698);
});

test('word fallback preserves escaped and literal asterisks', () => {
  const escapedBody = `Use \\* literally and preserve this explanation. ${'word '.repeat(180)}`;
  const escapedDescription = descriptionOf(buildPayload({ body: escapedBody }));
  assert.match(escapedDescription, /Use \\\* literally and preserve this explanation\./u);

  const literalBody = `Multiply 5 * 3 and preserve this explanation. ${'word '.repeat(180)}`;
  const literalDescription = descriptionOf(buildPayload({ body: literalBody }));
  assert.match(literalDescription, /Multiply 5 \* 3 and preserve this explanation\./u);
});

test('word fallback preserves literal unmatched brackets', () => {
  const body = `Valid range [0, 1) and preserve this explanation. ${'word '.repeat(180)}`;
  const description = descriptionOf(buildPayload({ body }));

  assert.match(description, /Valid range \[0, 1\) and preserve this explanation\./u);
});

test('tilde fences translate without changing code content', () => {
  const body = ['~~~python', '# not a heading', 'value = `literal`', '~~~'].join('\n');
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(
    description,
    ['```python', '# not a heading', 'value = `literal`', '```'].join('\n')
  );
});

test('newline-heavy bodies complete within the payload budget', () => {
  const body = Array.from({ length: 32_768 }, () => 'x').join('\n');
  const description = descriptionOf(buildPayload({ body, timeout: 5_000 }));

  assert.ok(description.startsWith('x\nx\nx\n'), description.slice(0, 40));
  assert.ok(description.length <= SUMMARY_LIMIT, `description length: ${description.length}`);
});

test('word fallback balances single-underscore emphasis', () => {
  const body = `_${'word '.repeat(200).trim()}_`;
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description.startsWith('_'), false, description.slice(0, 40));
  assert.match(description, /^word word /u);
});

test('word fallback preserves intraword underscores', () => {
  const body = `Keep snake_case intact. ${'word '.repeat(150)}later_value`;
  const description = descriptionOf(buildPayload({ body }));

  assert.match(description, /^Keep snake_case intact\./u);
});

test('word fallback preserves escaped underscores during later emphasis', () => {
  const body = `Keep \\_ literal. ${'word '.repeat(150)}_later_`;
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description.startsWith('Keep \\_ literal.'), true, description.slice(0, 40));
});

test('word fallback preserves closer-only underscores', () => {
  const body = `Keep word_ literal. ${'word '.repeat(150)}_later_`;
  const description = descriptionOf(buildPayload({ body }));

  assert.match(description, /^Keep word_ literal\./u);
});

test('invalid backtick fence openers remain ordinary Markdown', () => {
  const body = ['```js`bad', `Keep this useful explanation. ${'word '.repeat(180)}`].join('\n');
  const description = descriptionOf(buildPayload({ body }));

  assert.match(description, /^```js`bad\nKeep this useful explanation\./u);
  assert.notEqual(description, '...');
});

test('invalid fence-like lines balance crossed multiline inline code', () => {
  const body = ['```js`bad', 'word '.repeat(180).trim() + ' ``` tail'].join('\n');
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description, '...');
  assertBalancedCodeDelimiters(description);
});

test('dense inline-code spans complete within the payload budget', () => {
  const body = Array.from({ length: 1_024 }, () => '`x`').join(' ');
  const description = descriptionOf(buildPayload({ body, timeout: 5_000 }));

  assert.ok(description.startsWith('`x` `x` `x`'), description.slice(0, 40));
  assert.ok(description.length <= SUMMARY_LIMIT, `description length: ${description.length}`);
  assertBalancedCodeDelimiters(description);
});

test('word fallback tracks nested link destination parentheses', () => {
  const crossedBody = `[x](https://example.test/(inner)/${'a'.repeat(800)})`;
  const crossedDescription = descriptionOf(buildPayload({ body: crossedBody }));
  assert.equal(crossedDescription, '...');

  const completedBody = '[x](https://example.test/(inner)/tail)';
  assert.equal(descriptionOf(buildPayload({ body: completedBody })), completedBody);

  const escapedBody = String.raw`[x](https://example.test/\(inner\)/tail)`;
  assert.equal(descriptionOf(buildPayload({ body: escapedBody })), escapedBody);
});

test('word fallback preserves literal asterisks before later emphasis', () => {
  const body = `Multiply 5 * 3 ${'word '.repeat(150)}*later*`;
  const description = descriptionOf(buildPayload({ body }));

  assert.match(description, /^Multiply 5 \* 3 /u);

  const crossedDescription = descriptionOf(
    buildPayload({ body: `*${'word '.repeat(200).trim()}*` })
  );
  assert.equal((crossedDescription.match(/\*/gu) ?? []).length % 2, 0);
});

test('delimiter repair retains context beyond the normalization prefix', () => {
  const words = 'word '.repeat(1_000).trim();
  const boldDescription = descriptionOf(buildPayload({ body: `**${words}**` }));
  const inlineDescription = descriptionOf(buildPayload({ body: `\`${words}\`` }));

  assert.equal((boldDescription.match(/\*\*/gu) ?? []).length % 2, 0);
  assertBalancedCodeDelimiters(inlineDescription);
});

test('unmatched backtick runs do not block later code spans', () => {
  const body = `\` literal \`\`${'word '.repeat(200).trim()}\`\``;
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description, '` literal...');
});

test('normalization preserves whitespace inside inline code', () => {
  const body = 'Run   `printf "a  b"`   now.';
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description, 'Run `printf "a  b"` now.');
});

test('newline-heavy inline-code bodies complete within the payload budget', () => {
  const body = Array.from({ length: 16_000 }, () => '`x`').join('\n');
  const description = descriptionOf(buildPayload({ body, timeout: 10_000 }));

  assert.ok(description.startsWith('`x`\n`x`\n'), description.slice(0, 40));
  assert.ok(description.length <= SUMMARY_LIMIT, `description length: ${description.length}`);
  assertBalancedCodeDelimiters(description);
});

test('tilde translation chooses a collision-free backtick run', () => {
  const body = ['~~~md', '```js', 'code', '```', '~~~'].join('\n');
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description, ['````md', '```js', 'code', '```', '````'].join('\n'));
});

test('word fallback preserves literal double asterisks before later bold', () => {
  const body =
    `Exponent 2 ** 3; run \`printf "**literal**"\`. ` + `${'word '.repeat(150)}**later**`;
  const description = descriptionOf(buildPayload({ body }));

  assert.match(description, /^Exponent 2 \*\* 3; run `printf "\*\*literal\*\*"`\. /u);
});

test('normalization preserves multiline inline-code content', () => {
  const body = ['`first', '# literal code', 'printf "a  b"', 'last`'].join('\n');
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description, body);
});

test('blockquote fences preserve code and translate tilde delimiters', () => {
  const backtickBody = ['> ```sh', '> printf "a  b"', '> # literal code', '> ```'].join('\n');
  assert.equal(descriptionOf(buildPayload({ body: backtickBody })), backtickBody);

  const tildeBody = ['> ~~~python', '> # literal code', '> ~~~'].join('\n');
  const tildeDescription = descriptionOf(buildPayload({ body: tildeBody }));
  assert.equal(tildeDescription, ['> ```python', '> # literal code', '> ```'].join('\n'));
});

test('truncation places the ellipsis after a blockquote closing fence', () => {
  const body = ['> ```sh', '> printf "a  b"', '> ```', '', 'word '.repeat(200).trim()].join('\n');
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description, ['> ```sh', '> printf "a  b"', '> ```', '...'].join('\n'));
});

test('list continuation indentation exposes nested fenced blocks', () => {
  const body = [
    '10. item',
    '    ```js',
    `    const literal = "\`\`\`"; ${'word '.repeat(180).trim()}`,
    '    ```',
  ].join('\n');
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description, '10. item...');

  const completedListFence = ['10. item', '    ```js', '    value = 1;', '    ```'].join('\n');
  assert.equal(descriptionOf(buildPayload({ body: completedListFence })), completedListFence);

  const topLevelIndented = ['    ```js', '    value = 1;', '    ```'].join('\n');
  assert.equal(descriptionOf(buildPayload({ body: topLevelIndented })), topLevelIndented);
});

test('list markers inside fenced code do not alter fence state', () => {
  const body = ['```md', '- ```', '# literal  code', '```'].join('\n');
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description, body);
});

test('converted headings retain list continuation indentation', () => {
  const body = ['- Parent', '  # Nested heading', '  Nested text'].join('\n');
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description, ['- Parent', '  **Nested heading**', '  Nested text'].join('\n'));
});

test('word fallback repairs crossed compound asterisk emphasis', () => {
  const crossed = descriptionOf(buildPayload({ body: `***${'word '.repeat(180).trim()}***` }));
  assert.equal(crossed.startsWith('***'), false);

  const literalBody = `Rule *** here; run \`echo "***literal***"\`. ${'word '.repeat(
    150
  )}***later***`;
  const literal = descriptionOf(buildPayload({ body: literalBody }));
  assert.match(literal, /^Rule \*\*\* here; run `echo "\*\*\*literal\*\*\*"`\. /u);

  const escapedBody = `Keep \\*** literally. ${'word '.repeat(150)}***later***`;
  const escaped = descriptionOf(buildPayload({ body: escapedBody }));
  assert.match(escaped, /^Keep \\\*\*\* literally\. /u);
});

test('word fallback removes the outer opener of a nested link label', () => {
  const body =
    `Intro ${'word '.repeat(90)}` +
    `[outer [inner ${'tail '.repeat(100).trim()}] label](https://example.com)`;
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description.includes('['), false);
  assert.match(description, /\.\.\.$/u);

  const completed = '[outer [inner] label](https://example.com)';
  assert.equal(descriptionOf(buildPayload({ body: completed })), completed);

  const protectedBody =
    `Keep \`[literal]\` and \\[escaped\\]. ${'word '.repeat(70)}` +
    `[outer [inner ${'tail '.repeat(100).trim()}] label](https://example.com)`;
  const protectedDescription = descriptionOf(buildPayload({ body: protectedBody }));
  assert.match(protectedDescription, /^Keep `\[literal\]` and \\\[escaped\\\]\. /u);
  assert.equal(protectedDescription.includes('[outer'), false);
});

test('tilde translation drops backtick-bearing info strings', () => {
  const body = ['> ~~~lang`option', '> # literal code', '> ~~~'].join('\n');
  const description = descriptionOf(buildPayload({ body }));

  assert.equal(description, ['> ```', '> # literal code', '> ```'].join('\n'));
});

test('nested link-label pairing completes within the payload budget', () => {
  const depth = 340;
  const body =
    `Intro ${'['.repeat(depth)}` +
    `${'word '.repeat(12_500).trim()}` +
    `${']'.repeat(depth)}(https://example.com)`;
  const description = descriptionOf(buildPayload({ body, timeout: 10_000 }));

  assert.equal(description, 'Intro...');
});

test('word fallback repairs crossed longer asterisk runs', () => {
  const crossed = descriptionOf(buildPayload({ body: `****${'word '.repeat(180).trim()}****` }));
  assert.equal(crossed.startsWith('****'), false);

  const completed = '****complete****';
  assert.equal(descriptionOf(buildPayload({ body: completed })), completed);
});
