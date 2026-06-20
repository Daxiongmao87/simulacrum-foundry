import assert from 'node:assert/strict';
import {
  CHANGELOG_HEADINGS,
  DEFAULT_INCLUDE_PATHS,
  generateSection,
  mapCommitToEntry,
} from '../../tools/release/generate-unreleased-changelog.mjs';

const includePaths = [...DEFAULT_INCLUDE_PATHS];

const ciCommit = mapCommitToEntry({
  commit: { releaseSubject: 'ci: switch to manual workflow_dispatch for releases' },
  includePaths,
  changedFiles: ['module.json'],
});
const ciScopedCommit = mapCommitToEntry({
  commit: {
    releaseSubject: 'fix(ci): fix Discord announcement exceeding embed field char limit',
  },
  includePaths,
  changedFiles: ['module.json'],
});
const releaseCommit = mapCommitToEntry({
  commit: { releaseSubject: 'fix(release): advertise Foundry VTT 14 compatibility (#168)' },
  includePaths,
  changedFiles: ['module.json'],
});
const nonProductCommit = mapCommitToEntry({
  commit: { releaseSubject: 'fix(ci): shell script cleanup' },
  includePaths,
  changedFiles: ['tests/utils/test-generate-unreleased-changelog.mjs'],
});

assert.equal(ciCommit, null, 'ci commits should be skipped from product changelog');
assert.equal(ciScopedCommit, null, 'fix(ci) commits should be skipped from product changelog');
assert.equal(nonProductCommit, null, 'commits without product path changes should be skipped');
assert.notEqual(releaseCommit, null, 'non-CI release commit should be included');
assert.equal(
  releaseCommit.section,
  'Fixed',
  'release-scope commit should still map to the Fixed section'
);
assert.equal(
  releaseCommit.entry,
  'release: advertise Foundry VTT 14 compatibility (#168)',
  'release entry text should be preserved when not CI'
);

const grouped = Object.fromEntries(CHANGELOG_HEADINGS.map(heading => [heading, []]));
if (releaseCommit) {
  grouped[releaseCommit.section].push(releaseCommit.entry);
}

const generatedSection = generateSection('2026-06-20', grouped, CHANGELOG_HEADINGS);
assert.equal(
  generatedSection.includes('### CI/CD'),
  false,
  'generated section must omit CI/CD heading'
);
assert.equal(
  generatedSection.includes('- release: advertise Foundry VTT 14 compatibility (#168)'),
  true,
  'generated section must include non-CI release commit'
);
