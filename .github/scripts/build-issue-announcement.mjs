import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DESCRIPTION_LIMIT = 700;
export const TITLE_LIMIT = 256;

const EMPTY_DESCRIPTION = '_No description provided._';
const ELLIPSIS = '...';
const BLOCK_BUDGET = DESCRIPTION_LIMIT - ELLIPSIS.length - 2;

function normalizeLineEndings(content) {
  return content.replace(/\r\n?/gu, '\n');
}

function codePointLength(content) {
  const iterator = content[Symbol.iterator]();
  let length = 0;
  while (!iterator.next().done) length += 1;
  return length;
}

function codePointSlice(content, limit) {
  let end = 0;
  for (const character of content) {
    if (limit === 0) break;
    end += character.length;
    limit -= 1;
  }
  return content.slice(0, end);
}

function fenceOpening(line) {
  const match = line.match(/^ {0,3}(`{3,})(.*)$/u);
  if (!match || match[2].includes('`')) return null;

  return { length: match[1].length };
}

function closesFence(line, fence) {
  const match = line.match(/^ {0,3}(`{3,})[ \t]*$/u);
  return Boolean(match && match[1].length >= fence.length);
}

function isIndentedCode(line) {
  return /^(?:(?: {0,3}>[ \t]?)+)?(?: {0,3}\t| {4})/u.test(line);
}

function headingLabel(line) {
  const indent = line.match(/^[ \t]*/u)?.[0] ?? '';
  if (indent.length > 3) return null;

  const match = line.slice(indent.length).match(/^#{1,6}[ \t]+(.+)$/u);
  if (!match) return null;

  const label = match[1].replace(/[ \t]+#+[ \t]*$/u, '').trim();
  return label ? `${indent}**${label}**` : null;
}

function normalizeProseLine(line) {
  if (/^[ \t]*$/u.test(line)) return '';
  if (isIndentedCode(line)) return line;

  const indent = line.match(/^[ \t]*/u)?.[0] ?? '';
  const content = line
    .slice(indent.length)
    .replace(/[ \t]+/gu, ' ')
    .trimEnd();
  return indent + content;
}

function appendNormalizedProse(output, headingLines, line) {
  const heading = isIndentedCode(line) ? null : headingLabel(line);
  const normalized = heading ?? normalizeProseLine(line);
  if (!normalized && (output.length === 0 || output.at(-1) === '')) return;
  if (heading) headingLines.add(output.length);
  output.push(normalized);
}

function normalizedMarkdown(body) {
  const lines = normalizeLineEndings(body).split('\n');
  const output = [];
  const headingLines = new Set();
  let fence = null;

  for (const line of lines) {
    if (fence) {
      output.push(line);
      if (closesFence(line, fence)) fence = null;
      continue;
    }

    const opening = fenceOpening(line);
    if (opening) {
      output.push(line);
      fence = opening;
      continue;
    }

    appendNormalizedProse(output, headingLines, line);
  }

  while (output.at(-1) === '') output.pop();
  return {
    content: output.join('\n'),
    headingLines,
  };
}

function markdownBlocks(normalized) {
  const blocks = [];
  let current = [];
  let currentIsHeading = false;
  let fence = null;

  const flush = kind => {
    if (current.length === 0) return;
    blocks.push({
      kind: kind ?? (currentIsHeading ? 'heading' : 'prose'),
      text: current.join('\n'),
    });
    current = [];
    currentIsHeading = false;
  };

  for (const [index, line] of normalized.content.split('\n').entries()) {
    if (fence) {
      current.push(line);
      if (closesFence(line, fence)) {
        fence = null;
        flush('fence');
      }
      continue;
    }

    if (line === '') {
      flush();
      continue;
    }

    const opening = fenceOpening(line);
    if (opening) {
      flush();
      current.push(line);
      fence = opening;
      continue;
    }

    currentIsHeading = current.length === 0 && normalized.headingLines.has(index);
    current.push(line);
  }

  flush(fence ? 'fence' : undefined);
  return blocks;
}

function wordPrefix(content, limit) {
  const slice = codePointSlice(content, limit).trimEnd();
  const boundary = Math.max(slice.lastIndexOf(' '), slice.lastIndexOf('\n'));
  return (boundary > 0 ? slice.slice(0, boundary) : slice).trimEnd();
}

function truncatedDescription(normalized) {
  const blocks = markdownBlocks(normalized);
  const selected = [];

  for (const block of blocks) {
    const candidate = [...selected, block].map(item => item.text).join('\n\n');
    if (codePointLength(candidate) > BLOCK_BUDGET) break;
    selected.push(block);
  }

  while (selected.at(-1)?.kind === 'heading') selected.pop();
  if (selected.length > 0) {
    return `${selected.map(block => block.text).join('\n\n')}\n\n${ELLIPSIS}`;
  }

  const fallback = blocks.find(block => block.kind !== 'heading');
  if (!fallback || fallback.kind !== 'prose') return ELLIPSIS;
  return `${wordPrefix(fallback.text, DESCRIPTION_LIMIT - ELLIPSIS.length)}${ELLIPSIS}`;
}

export function formatDescription(body) {
  if (body == null || String(body).trim() === '') return EMPTY_DESCRIPTION;

  const normalized = normalizedMarkdown(String(body));
  if (!normalized.content) return EMPTY_DESCRIPTION;
  return codePointLength(normalized.content) <= DESCRIPTION_LIMIT
    ? normalized.content
    : truncatedDescription(normalized);
}

function boundedTitle(title) {
  const content = String(title ?? '');
  if (codePointLength(content) <= TITLE_LIMIT) return content;
  return codePointSlice(content, TITLE_LIMIT - ELLIPSIS.length) + ELLIPSIS;
}

export function buildDiscordPayload(event, repository) {
  const issue = event.issue;
  return {
    username: 'GitHub Issues',
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: boundedTitle(issue.title),
        url: issue.html_url,
        description: formatDescription(issue.body),
        color: 5814783,
        author: {
          name: `Opened by @${issue.user.login}`,
          url: issue.user.html_url,
          icon_url: issue.user.avatar_url,
        },
        fields: [
          {
            name: 'Issue',
            value: `[Open issue #${issue.number}](${issue.html_url})`,
            inline: false,
          },
        ],
        footer: { text: repository },
      },
    ],
  };
}

function runCli() {
  const eventPath = process.argv[2] || process.env.GITHUB_EVENT_PATH;
  const outputPath = process.argv[3] || 'discord-payload.json';
  const repository = process.env.REPOSITORY;

  if (!eventPath || !repository) {
    process.stderr.write('GITHUB_EVENT_PATH and REPOSITORY are required\n');
    return 1;
  }

  try {
    const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    const payload = buildDiscordPayload(event, repository);
    fs.writeFileSync(outputPath, JSON.stringify(payload));
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) process.exitCode = runCli();
