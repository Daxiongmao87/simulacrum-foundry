#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'node:fs';

const args = parseArgs(process.argv.slice(2));
const optionAliases = {
  changelog: 'changelogPath',
  moduleJson: 'moduleJsonPath',
  readmeHtml: 'readmeHtmlPath',
  releaseBody: 'releaseBodyPath',
};

const options = {
  version: '',
  releaseTitle: '',
  releaseDescription: '',
  moduleId: 'simulacrum',
  repoUrl: '',
  changelogPath: 'CHANGELOG.md',
  moduleJsonPath: 'module.json',
  readmeHtmlPath: 'readme_single.html',
  releaseBodyPath: 'release_body.md',
  dryRun: false,
  writeFiles: true,
  summaryPath: '',
};

for (const [key, value] of Object.entries(args)) {
  const optionKey = optionAliases[key] || key;
  if (Object.hasOwn(options, optionKey)) {
    options[optionKey] = value;
  }
}

if (!options.version || !String(options.version).trim()) {
  fail('version is required');
}
if (!options.releaseTitle || !String(options.releaseTitle).trim()) {
  fail('release_title is required');
}
if (!options.releaseDescription || !String(options.releaseDescription).trim()) {
  fail('release_description is required');
}

const releaseTitle = String(options.releaseTitle).trim();
const releaseDescription = String(options.releaseDescription).trim();
const version = String(options.version).trim();
const repoUrl = normalizeRepoUrl(options.repoUrl);
const moduleId = options.moduleId || 'simulacrum';

if (!/^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(version)) {
  fail('version must be SemVer without a leading v');
}
if (releaseTitle === version || releaseTitle === `v${version}` || !/\p{L}/u.test(releaseTitle)) {
  fail('release_title must be natural prose, not just the version');
}
if (!/\p{L}/u.test(releaseDescription) || releaseDescription.split(/\s+/).length < 3) {
  fail('release_description must be a natural-prose descriptor');
}

const changelog = readText(options.changelogPath, 'CHANGELOG.md');
const unreleasedSection = findUnreleasedSection(changelog);
if (!unreleasedSection) {
  fail('CHANGELOG.md is missing a [Unreleased] section');
}

const date = new Date().toISOString().slice(0, 10);
const releaseHeader = `## [${version}] - ${date}`;
const releaseSection = unreleasedSection.text.replace(/^## \[Unreleased\][^\n]*$/m, releaseHeader);
const releaseSectionContent = releaseSection.replace(/^## \[[^\]]+\][^\n]*\n?/m, '');

const releaseBody = [releaseDescription, releaseSectionContent.trim()].filter(Boolean).join('\n\n');
if (!releaseBody.trim()) {
  fail('release body would be empty');
}

const moduleJson = safeJsonParse(readText(options.moduleJsonPath, 'module.json'));
moduleJson.version = version;
moduleJson.manifest = `${repoUrl}/releases/download/${version}/module.json`;
moduleJson.download = `${repoUrl}/releases/download/${version}/${moduleId}.zip`;
if (fs.existsSync(options.readmeHtmlPath)) {
  moduleJson.description = readText(options.readmeHtmlPath, options.readmeHtmlPath).trim();
}

const updatedChangelog = [
  changelog.slice(0, unreleasedSection.start),
  releaseSection.trimEnd(),
  '\n\n',
  changelog.slice(unreleasedSection.end).replace(/^\n+/, ''),
].join('');
const changedChangelog = updatedChangelog !== changelog;
const nextModuleJsonText = `${JSON.stringify(moduleJson, null, 2)}\n`;
const currentModuleJsonText = readText(options.moduleJsonPath, 'module.json');
const changedModuleJson = nextModuleJsonText !== currentModuleJsonText;

if (options.writeFiles && !options.dryRun) {
  if (changedChangelog) {
    fs.writeFileSync(options.changelogPath, updatedChangelog);
  }
  if (changedModuleJson) {
    fs.writeFileSync(options.moduleJsonPath, nextModuleJsonText);
  }
  fs.writeFileSync(options.releaseBodyPath, `${releaseBody.trim()}\n`);
}

const summary = {
  version,
  releaseTitle,
  releaseBodyPath: options.releaseBodyPath,
  releaseSection,
  changelogUpdated: changedChangelog,
  moduleJsonUpdated: changedModuleJson,
  dryRun: options.dryRun,
  writeFiles: options.writeFiles,
  commitSafe: !!changedChangelog || !!changedModuleJson,
  errors: [],
};

if (options.summaryPath) {
  fs.writeFileSync(options.summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
}

console.log(JSON.stringify(summary, null, 2));

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
      values.writeFiles = true;
      continue;
    }
    const key = toCamelCase(arg.replace(/^--/, ''));
    const next = rawArgs[i + 1];
    if (next === undefined || next.startsWith('--')) {
      values[key] = 'true';
      continue;
    }
    values[key] = next;
    i += 1;
  }
  if (values.writeFiles === undefined) {
    values.writeFiles = false;
  }
  return values;
}

function toCamelCase(value) {
  return value
    .split('-')
    .map((segment, index) =>
      index === 0 ? segment : segment.charAt(0).toUpperCase() + segment.slice(1)
    )
    .join('');
}

function normalizeRepoUrl(value) {
  if (!value || !String(value).trim()) {
    fail('repo URL is required');
  }
  return value.replace(/\/$/, '');
}

function readText(filePath, label) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    fail(`Unable to read ${label}: ${error.message}`);
  }
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    fail(`Invalid JSON input: ${error.message}`);
  }
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

function fail(message) {
  console.error(message);
  process.exit(1);
}
