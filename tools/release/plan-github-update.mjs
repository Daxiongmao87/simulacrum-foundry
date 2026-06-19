#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'node:fs';

const args = parseArgs(process.argv.slice(2));

const options = {
  repo: '',
  branch: 'main',
  version: '',
  commitMessage: '',
  actorName: 'simulacrum-release[bot]',
  actorEmail: 'simulacrum-release[bot]@users.noreply.github.com',
  baseCommit: '',
  baseTree: '',
  files: [],
  includeTag: false,
  output: '',
};

for (const [key, value] of Object.entries(args)) {
  if (Object.hasOwn(options, key)) {
    if (key === 'files') {
      options.files = value;
      continue;
    }
    options[key] = value;
  }
}

if (!options.repo || !options.version || !options.commitMessage || options.files.length === 0) {
  console.error('repo, version, commitMessage, and files are required');
  process.exit(1);
}
if (!options.baseCommit || !options.baseTree) {
  console.error('base-commit and base-tree are required');
  process.exit(1);
}

const entries = options.files.map(filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  const base64 = Buffer.from(content).toString('base64');
  return {
    path: filePath,
    contentBase64: base64,
    blobRequestBody: {
      content: base64,
      encoding: 'base64',
    },
  };
});

const normalizedRepo = options.repo.replace(/^(https?:\/\/)?(github\.com\/)?/, '');
const treePayload = {
  base_tree: options.baseTree,
  tree: entries.map(entry => ({
    path: entry.path,
    mode: '100644',
    type: 'blob',
    sha: `<blob_sha:${entry.path}>`,
  })),
};

const commitPayload = {
  message: options.commitMessage,
  tree: '<TREE_SHA_PLACEHOLDER>',
  parents: [options.baseCommit],
  author: { name: options.actorName, email: options.actorEmail },
  committer: { name: options.actorName, email: options.actorEmail },
};

const tagPayload = {
  tag: options.version,
  message: `Release ${options.version}`,
  object: '<RELEASE_COMMIT_SHA_PLACEHOLDER>',
  type: 'commit',
  tagger: {
    name: options.actorName,
    email: options.actorEmail,
    date: new Date().toISOString(),
  },
};

const plan = {
  repository: normalizedRepo,
  branch: `refs/heads/${options.branch}`,
  baseCommit: options.baseCommit,
  baseTree: options.baseTree,
  atomicCommit: {
    blobEndpoint: `/repos/${normalizedRepo}/git/blobs`,
    commitEndpoint: `/repos/${normalizedRepo}/git/commits`,
    refEndpoint: `/repos/${normalizedRepo}/git/refs/heads/${options.branch}`,
    treePayloadEndpoint: `/repos/${normalizedRepo}/git/trees`,
    blobRequests: entries.map(entry => ({
      path: entry.path,
      method: 'POST',
      body: entry.blobRequestBody,
    })),
    treeRequest: {
      method: 'POST',
      body: treePayload,
    },
    commitRequest: {
      method: 'POST',
      body: commitPayload,
    },
    refUpdateRequest: {
      method: 'PATCH',
      body: {
        sha: '<RELEASE_COMMIT_SHA_PLACEHOLDER>',
        force: false,
      },
    },
  },
  tagPlan: options.includeTag
    ? {
        tagObjectEndpoint: `/repos/${normalizedRepo}/git/tags`,
        tagRefEndpoint: `/repos/${normalizedRepo}/git/refs`,
        tagObjectRequest: {
          method: 'POST',
          body: tagPayload,
        },
        tagRefRequest: {
          method: 'POST',
          body: {
            ref: `refs/tags/${options.version}`,
            sha: '<TAG_OBJECT_SHA_PLACEHOLDER>',
          },
        },
      }
    : null,
  shellPlan: {
    createBlobCommands: entries.map(
      entry =>
        `gh api "/repos/${normalizedRepo}/git/blobs" --method POST --field content='${entry.contentBase64}' --field encoding='base64'`
    ),
    createTreeCommand: `cat <<'JSON' | jq '.base_tree = "${options.baseTree}"' > /tmp/changelog-tree.json; gh api "/repos/${normalizedRepo}/git/trees" --method POST --input /tmp/changelog-tree.json`,
    createCommitCommand: `gh api "/repos/${normalizedRepo}/git/commits" --method POST --input /tmp/commit.json`,
    updateRefCommand: `gh api "/repos/${normalizedRepo}/git/refs/heads/${options.branch}" --method PATCH --input /tmp/ref.json`,
  },
};

if (options.includeTag) {
  plan.tagPlan.shellPlan = {
    createTagObjectCommand: `gh api "/repos/${normalizedRepo}/git/tags" --method POST --input /tmp/tag-object.json`,
    createTagRefCommand: `gh api "/repos/${normalizedRepo}/git/refs" --method POST --input /tmp/tag-ref.json`,
  };
}

if (options.output) {
  fs.writeFileSync(options.output, `${JSON.stringify(plan, null, 2)}\n`);
}

console.log(JSON.stringify(plan, null, 2));

function parseArgs(rawArgs) {
  const values = {};
  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];
    if (!arg.startsWith('--')) {
      continue;
    }
    if (arg === '--file') {
      values.files ??= [];
      values.files.push(rawArgs[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--include-tag') {
      values.includeTag = true;
      continue;
    }
    const key = toCamelCase(arg.slice(2));
    const next = rawArgs[i + 1];
    if (next === undefined || next.startsWith('--')) {
      continue;
    }
    values[key] = next;
    i += 1;
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
