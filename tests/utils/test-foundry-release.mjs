import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildFoundryReleasePayload } from '../../tools/release/foundry-release-payload.mjs';

const sampleModuleWithoutMaximum = {
  id: 'simulacrum',
  version: '1.1.0',
  compatibility: {
    minimum: 13,
    verified: '14',
  },
};

const payloadWithoutMaximum = buildFoundryReleasePayload({
  moduleJson: sampleModuleWithoutMaximum,
  releaseVersion: '1.1.0',
  repoUrl: 'https://github.com/Daxiongmao87/simulacrum-foundry',
});

assert.equal(payloadWithoutMaximum.id, 'simulacrum');
assert.equal(payloadWithoutMaximum.release.version, '1.1.0');
assert.equal(
  payloadWithoutMaximum.release.manifest,
  'https://github.com/Daxiongmao87/simulacrum-foundry/releases/download/1.1.0/module.json'
);
assert.equal(
  payloadWithoutMaximum.release.notes,
  'https://github.com/Daxiongmao87/simulacrum-foundry/releases/tag/1.1.0'
);
assert.equal(
  payloadWithoutMaximum.release.compatibility.minimum,
  '13',
  'minimum should be stringified'
);
assert.equal(
  payloadWithoutMaximum.release.compatibility.verified,
  '14',
  'verified should be stringified'
);
assert.equal(
  'maximum' in payloadWithoutMaximum.release.compatibility,
  false,
  'maximum should be omitted when empty'
);
assert.equal(
  payloadWithoutMaximum['dry-run'],
  undefined,
  'dry-run should only be included when requested'
);

assert.throws(
  () => {
    buildFoundryReleasePayload({
      moduleJson: null,
      releaseVersion: '1.1.0',
      repoUrl: 'https://github.com/Daxiongmao87/simulacrum-foundry',
    });
  },
  /moduleJson must be a non-null object/,
  'missing moduleJson should fail validation'
);

assert.throws(
  () => {
    buildFoundryReleasePayload({
      moduleJson: '',
      releaseVersion: '1.1.0',
      repoUrl: 'https://github.com/Daxiongmao87/simulacrum-foundry',
    });
  },
  /moduleJson must be a non-null object/,
  'non-object moduleJson should fail validation'
);

assert.throws(
  () => {
    buildFoundryReleasePayload({
      moduleJson: [],
      releaseVersion: '1.1.0',
      repoUrl: 'https://github.com/Daxiongmao87/simulacrum-foundry',
    });
  },
  /moduleJson must be a non-null object/,
  'array moduleJson should fail validation'
);

const sampleModuleWithMaximum = {
  id: 'simulacrum',
  version: '1.1.0',
  compatibility: {
    minimum: 13,
    verified: '14',
    maximum: 15,
  },
};

const payloadWithMaximum = buildFoundryReleasePayload({
  moduleJson: sampleModuleWithMaximum,
  releaseVersion: '1.1.0',
  repoUrl: 'https://github.com/Daxiongmao87/simulacrum-foundry/',
  dryRun: true,
});

assert.equal(
  payloadWithMaximum.release.compatibility.maximum,
  '15',
  'maximum should be stringified'
);
assert.equal(payloadWithMaximum['dry-run'], true, 'dry-run should be included when requested');
assert.equal(
  payloadWithMaximum.release.manifest,
  'https://github.com/Daxiongmao87/simulacrum-foundry/releases/download/1.1.0/module.json',
  'repo URL with trailing slash should be normalized'
);

assert.throws(
  () => {
    buildFoundryReleasePayload({
      moduleJson: sampleModuleWithoutMaximum,
      releaseVersion: '1.2.0',
      repoUrl: 'https://github.com/Daxiongmao87/simulacrum-foundry',
    });
  },
  /does not match workflow version/,
  'mismatched versions should fail'
);

const workflowPath = path.join(process.cwd(), '.github/workflows/create-release.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

function extractStepBlock(name, nextName) {
  const startMarker = `- name: ${name}`;
  const nextMarker = nextName ? `\n      - name: ${nextName}` : null;
  const start = workflow.indexOf(startMarker);
  assert.ok(start !== -1, `workflow step '${name}' should exist`);

  const end = nextMarker ? workflow.indexOf(nextMarker, start + startMarker.length) : -1;
  if (nextName) {
    assert.ok(end !== -1, `workflow step '${name}' should be followed by '${nextName}'`);
  }
  return workflow.slice(start, end === -1 ? undefined : end);
}

const buildFoundryPayloadBlock = extractStepBlock(
  'Build Foundry API payload',
  'Validate Foundry payload (dry run)'
);
const validateReleaseInputsBlock = extractStepBlock('Validate release inputs', 'Setup Node.js');
const validateFoundryPayloadBlock = extractStepBlock(
  'Validate Foundry payload (dry run)',
  'Publish to Foundry VTT'
);
const publishFoundryPayloadBlock = extractStepBlock(
  'Publish to Foundry VTT',
  'Verify Foundry public package page'
);

assert.equal(
  workflow.includes('npx ' + '@' + 'ghost-fvtt/f' + 'oundry-publish'),
  false,
  'legacy foundry CLI command must be removed'
);
assert.equal(
  workflow.includes('@' + 'ghost-fvtt'),
  false,
  'legacy ghost CLI reference must be removed'
);
assert.equal(
  /foundryvtt\.com\/_api\/packages\/release_version\//.test(workflow),
  true,
  'workflow should use Foundry official release API endpoint'
);
assert.equal(/foundry_only/.test(workflow), true, 'foundry_only input/control should exist');
assert.equal(
  validateReleaseInputsBlock.includes(
    'if [ "${{ inputs.announce_only }}" = "true" ] && [ "${{ inputs.foundry_only }}" = "true" ]; then'
  ),
  true,
  'validate release inputs should reject announce_only + foundry_only together'
);
assert.equal(
  validateReleaseInputsBlock.includes(
    'echo "::error::foundry_only and announce_only cannot both be true"'
  ),
  true,
  'validation should emit announce_only/ foundry_only conflict error'
);
assert.equal(
  /- name: Setup Node\.js\n\s+if: inputs\.announce_only == false/.test(workflow),
  true,
  'Setup Node.js should run for all non-announce-only paths'
);
assert.equal(
  new RegExp(
    '- name: Install dependencies\\n\\s+if: inputs\\.announce_only == false && inputs\\.foundry_only == false'
  ).test(workflow),
  true,
  'npm ci should be skipped for foundry_only'
);
assert.equal(
  workflow.includes('Authorization: Bearer ${FVTT_TOKEN}'),
  false,
  'Foundry Authorization header must not use Bearer prefix'
);
assert.equal(
  /Authorization: \${FVTT_TOKEN}/.test(publishFoundryPayloadBlock),
  true,
  'publish step should send raw token in Authorization header'
);
assert.equal(
  /--data @\/tmp\/foundry-dry-run-payload.json/.test(validateFoundryPayloadBlock),
  true,
  'validation step should post dry-run payload'
);
assert.equal(
  /--data @\/tmp\/foundry-payload.json/.test(validateFoundryPayloadBlock),
  false,
  'validation step should not post publish payload'
);
assert.equal(
  /--dry-run/.test(buildFoundryPayloadBlock),
  true,
  'build step must generate explicit dry-run payload with --dry-run'
);
assert.equal(
  /\/tmp\/foundry-dry-run-payload\.json/.test(buildFoundryPayloadBlock),
  true,
  'build step must write dry-run payload path'
);
assert.equal(
  /--data @\/tmp\/foundry-payload.json/.test(publishFoundryPayloadBlock),
  true,
  'publish step should post publish payload'
);
assert.equal(
  /--dry-run/.test(publishFoundryPayloadBlock),
  false,
  'publish step should not include --dry-run payload generation'
);
assert.equal(
  /\/tmp\/foundry-dry-run-payload\.json/.test(publishFoundryPayloadBlock),
  false,
  'publish step should not post dry-run payload'
);
