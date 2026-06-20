#!/usr/bin/env node
/* eslint-disable no-console */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const conventionalCommitRegex = /^([a-z]+)(\([^)]+\))?:\s*(.*)$/i;
const SKIP_MESSAGE_PATTERNS = [
  /^docs\(release\):/i,
  /^docs:\s*update unreleased changelog/i,
  /\[skip ci\]/i,
];
export const CHANGELOG_HEADINGS = [
  'Added',
  'Changed',
  'Fixed',
  'Deprecated',
  'Removed',
  'Security',
  'Documentation',
  'Testing',
  'Build',
  'Other',
];
export const DEFAULT_INCLUDE_PATHS = [
  'scripts',
  'styles',
  'templates',
  'lang',
  'assets',
  'packs',
  'module.json',
  'README.md',
];
const optionAliases = {
  changelog: 'changelogPath',
  summary: 'summaryPath',
};

function buildGeneratorOptions(rawArgs = {}) {
  const options = {
    changelogPath: 'CHANGELOG.md',
    repoRoot: process.cwd(),
    dryRun: false,
    writeFile: false,
    includePaths: DEFAULT_INCLUDE_PATHS,
    summaryPath: '',
  };

  for (const [key, value] of Object.entries(rawArgs)) {
    const optionKey = optionAliases[key] || key;
    if (Object.hasOwn(options, optionKey)) {
      options[optionKey] = value;
    }
  }

  return {
    ...options,
    includePaths: options.includePaths.map(entry => entry.replace(/\/+$/, '')),
  };
}

function runGenerator() {
  const options = buildGeneratorOptions(parseArgs(process.argv.slice(2)));
  const changelog = readText(options.changelogPath);
  const includePaths = options.includePaths;
  const commits = collectReleaseCommits(options);
  const grouped = buildSectionedEntries({ commits, includePaths, repoRoot: options.repoRoot });
  const hasUpdates = hasAnyEntries(grouped);
  const releaseDate = new Date().toISOString().slice(0, 10);
  const headingOrder = [...CHANGELOG_HEADINGS];
  const newSection = hasUpdates
    ? generateSection(releaseDate, grouped, headingOrder)
    : `## [Unreleased] - ${releaseDate}\n`;
  const nextChangelog = hasUpdates ? replaceUnreleasedSection(changelog, newSection) : changelog;
  const entryCount = Object.values(grouped).reduce((count, entries) => count + entries.length, 0);

  if (options.writeFile && hasUpdates) {
    fs.writeFileSync(options.changelogPath, nextChangelog);
  }

  const summary = {
    changelogPath: options.changelogPath,
    generatedAt: new Date().toISOString(),
    latestReleaseTag: resolveLatestReleaseTag(options),
    hasUpdates,
    dryRun: options.dryRun || !options.writeFile,
    writeFile: options.writeFile,
    headingOrder,
    entryCount,
    sectionLines: newSection.trim(),
  };

  if (options.summaryPath) {
    fs.writeFileSync(options.summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  }

  console.log(JSON.stringify(summary, null, 2));

  if (options.writeFile && !hasUpdates) {
    console.log('{"hasUpdates": false, "message": "No product-facing commits found"}');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runGenerator();
}

function collectReleaseCommits(options) {
  const latestTag = resolveLatestReleaseTag(options);
  const range = latestTag ? `${latestTag}..HEAD` : '';
  return runGitLog(`git log --first-parent --pretty=format:%H ${range}`, options.repoRoot)
    .split('\n')
    .map(sha => sha.trim())
    .filter(Boolean)
    .map(sha => {
      const subject = runGitLog(`git show -s --format=%s ${sha}`, options.repoRoot).trim();
      const body = runGitLog(`git show -s --format=%b ${sha}`, options.repoRoot).trim();
      return { sha, subject, body, releaseSubject: releaseSubjectForCommit(subject, body) };
    })
    .filter(entry => entry.sha && entry.releaseSubject);
}

function buildSectionedEntries({ commits, includePaths, repoRoot }) {
  const grouped = createSectionedEntries();
  for (const commit of commits) {
    if (shouldSkipCommit(commit, SKIP_MESSAGE_PATTERNS)) {
      continue;
    }
    const changedFiles = changedFilesForCommit(commit.sha, repoRoot);
    const mapped = mapCommitToEntry({ commit, includePaths, changedFiles });
    if (mapped) {
      addEntry(grouped, mapped.section, mapped.entry);
    }
  }
  return grouped;
}

function shouldSkipCommit(commit, skipPatterns) {
  return skipPatterns.some(
    pattern => pattern.test(commit.subject) || pattern.test(commit.releaseSubject)
  );
}

function createSectionedEntries() {
  return Object.fromEntries(CHANGELOG_HEADINGS.map(heading => [heading, []]));
}

function addEntry(grouped, section, entry) {
  if (!grouped[section].includes(entry)) {
    grouped[section].push(entry);
  }
}

function hasAnyEntries(grouped) {
  return Object.values(grouped).some(entries => entries.length > 0);
}

function replaceUnreleasedSection(changelog, newSection) {
  const existingUnreleased = findUnreleasedSection(changelog);
  if (!existingUnreleased) {
    return insertNewUnreleasedSection(changelog, newSection);
  }
  return [
    changelog.slice(0, existingUnreleased.start),
    newSection.trimEnd(),
    '\n\n',
    changelog.slice(existingUnreleased.end).replace(/^\n+/, ''),
  ].join('');
}

function insertNewUnreleasedSection(changelog, newSection) {
  const insertionPoint = changelog.indexOf('\n## [');
  if (insertionPoint === -1) {
    return `${changelog.trimEnd()}\n\n${newSection}\n`;
  }
  const insertionAnchor = insertionPoint + 1;
  return `${changelog.slice(0, insertionAnchor)}${newSection}\n${changelog.slice(insertionAnchor)}`;
}

function runGitLog(command, cwd) {
  try {
    return execSync(command, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
  } catch (error) {
    return '';
  }
}

function sectionForType(type) {
  const map = {
    feat: 'Added',
    feature: 'Added',
    add: 'Added',
    fix: 'Fixed',
    fixed: 'Fixed',
    bug: 'Fixed',
    bugfix: 'Fixed',
    chore: 'Changed',
    change: 'Changed',
    changed: 'Changed',
    refactor: 'Changed',
    perf: 'Changed',
    build: 'Build',
    test: 'Testing',
    tests: 'Testing',
    docs: 'Documentation',
    doc: 'Documentation',
    deprecated: 'Deprecated',
    removed: 'Removed',
    security: 'Security',
  };
  return map[type] || 'Other';
}

export function parseConventionalCommit(subject) {
  const parsed = conventionalCommitRegex.exec(subject || '');
  if (!parsed) {
    return null;
  }
  return {
    type: parsed[1].toLowerCase(),
    scope: parsed[2] ? parsed[2].slice(1, -1).trim() : '',
    message: (parsed[3] || '').trim(),
  };
}

export function isCiCommit(parsedCommit) {
  if (!parsedCommit) {
    return false;
  }
  return parsedCommit.type === 'ci' || parsedCommit.scope.toLowerCase() === 'ci';
}

export function mapCommitToEntry({ commit, includePaths, changedFiles }) {
  const parsed = parseConventionalCommit(commit.releaseSubject);
  if (isCiCommit(parsed)) {
    return null;
  }

  const hasRelevantChange = changedFiles.some(filePath =>
    isRelevantProductPath(filePath, includePaths)
  );
  if (!hasRelevantChange) {
    return null;
  }

  const rawType = parsed ? parsed.type : 'other';
  const scope = parsed?.scope ? `${parsed.scope}: ` : '';
  const message = (parsed?.message || commit.releaseSubject).trim() || 'chore: change';
  const section = parsed ? sectionForType(rawType) : sectionForFreeformSubject(message);
  return { section, entry: `${scope}${message}` };
}

function sectionForFreeformSubject(subject) {
  if (/^(fix|fixed|resolve|resolved|prevent|repair)\b/i.test(subject)) {
    return 'Fixed';
  }
  if (/^(add|added|support|enable)\b/i.test(subject)) {
    return 'Added';
  }
  if (/^(remove|removed|drop)\b/i.test(subject)) {
    return 'Removed';
  }
  if (/^(secure|security)\b/i.test(subject)) {
    return 'Security';
  }
  return 'Changed';
}

function releaseSubjectForCommit(subject, body) {
  if (/^Merge pull request #\d+ from /i.test(subject)) {
    const bodyTitle = body
      .split('\n')
      .map(line => line.trim())
      .find(Boolean);
    if (bodyTitle) {
      return bodyTitle;
    }
  }
  return subject;
}

function changedFilesForCommit(sha, repoRoot = process.cwd()) {
  const parentLine = runGitLog(`git rev-list --parents -n 1 ${sha}`, repoRoot).trim();
  const parentCount = parentLine ? parentLine.split(/\s+/).length - 1 : 0;
  const command =
    parentCount > 1
      ? `git diff --name-only ${sha}~1 ${sha}`
      : `git show --name-only --pretty=format: --no-renames ${sha}`;
  return runGitLog(command, repoRoot)
    .split('\n')
    .map(filePath => filePath.trim())
    .filter(Boolean);
}

function isRelevantProductPath(filePath, includePaths) {
  if (
    !filePath ||
    filePath.startsWith('.github/') ||
    filePath.startsWith('.git/') ||
    filePath.startsWith('tests/') ||
    filePath.includes('CHANGELOG.md') ||
    filePath === 'package.json' ||
    filePath === 'package-lock.json'
  ) {
    return false;
  }
  return includePaths.some(targetPath => {
    const normalizedTarget = targetPath.replace(/\/+$/, '');
    return filePath === normalizedTarget || filePath.startsWith(`${normalizedTarget}/`);
  });
}

export function generateSection(releaseDate, groupedEntries, headingOrder) {
  const lines = [`## [Unreleased] - ${releaseDate}`, ''];
  for (const heading of headingOrder) {
    const entries = groupedEntries[heading];
    if (!entries.length) {
      continue;
    }
    lines.push(`### ${heading}`, '');
    for (const entry of entries) {
      lines.push(`- ${entry}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function findUnreleasedSection(content) {
  const headingMatch = /^## \[Unreleased\][^\n]*$/m.exec(content);
  if (!headingMatch) {
    return null;
  }
  const start = headingMatch.index;
  const nextSearchStart = start + headingMatch[0].length + 1;
  const nextHeadingMatch = /^## \[/m.exec(content.slice(nextSearchStart));
  const end = nextHeadingMatch ? nextSearchStart + nextHeadingMatch.index : content.length;
  return {
    start,
    end,
    text: content.slice(start, end),
  };
}

function resolveLatestReleaseTag(options = { repoRoot: process.cwd() }) {
  return (
    runGitLog('git tag --sort=-version:refname', options.repoRoot)
      .split('\n')
      .map(tag => tag.trim())
      .filter(Boolean)
      .find(tag => /^v?\d+\.\d+\.\d+/.test(tag)) || ''
  );
}

function parseArgs(rawArgs) {
  const values = {};
  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];
    if (!arg.startsWith('--')) {
      continue;
    }
    if (arg === '--dry-run') {
      values.dryRun = true;
      continue;
    }
    if (arg === '--write') {
      values.writeFile = true;
      continue;
    }
    const key = toCamelCase(arg.replace(/^--/, ''));
    const next = rawArgs[i + 1];
    if (next === undefined || next.startsWith('--')) {
      continue;
    }
    values[key] = next;
    i += 1;
  }
  return values;
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`Unable to read ${filePath}: ${error.message}`);
    process.exit(1);
  }
}

function toCamelCase(value) {
  return value
    .split('-')
    .map((segment, index) =>
      index === 0 ? segment : segment.charAt(0).toUpperCase() + segment.slice(1)
    )
    .join('');
}
