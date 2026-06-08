#!/usr/bin/env node
/**
 * Build the e2e container image locally.
 *
 * Usage:
 *   node tests/e2e/scripts/build-container.js [13|14]
 *   npm run test:e2e:container:build -- 14
 *
 * Builds a local e2e image from tests/e2e/docker/Dockerfile.
 * Defaults to localhost/simulacrum-foundry-e2e:<major>; override with E2E_IMAGE.
 */

import { execFileSync, spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../../..');
const DOCKERFILE = join(__dirname, '../docker/Dockerfile');

const tag = process.argv[2] || '14';
const majorMatch = tag.match(/^(\d+)/);
if (!majorMatch) {
  console.error(`ERROR: Cannot parse major version from tag '${tag}'`);
  process.exit(1);
}
const FOUNDRY_MAJOR = majorMatch[1];
const IMAGE = process.env.E2E_IMAGE || `localhost/simulacrum-foundry-e2e:${FOUNDRY_MAJOR}`;

function detectEngine() {
  for (const engine of ['podman', 'docker', 'nerdctl', 'finch']) {
    try {
      execFileSync(engine, ['--version'], { stdio: 'pipe' });
      return engine;
    } catch { /* not found */ }
  }
  console.error('ERROR: No container engine found. Install one of: podman, docker, nerdctl, finch');
  process.exit(1);
}

const engine = detectEngine();
console.log(`[build] Engine:  ${engine}`);
console.log(`[build] Image:   ${IMAGE}`);
console.log(`[build] Base:    felddy/foundryvtt:${FOUNDRY_MAJOR}`);

const result = spawnSync(engine, [
  'build',
  '--build-arg', `FOUNDRY_TAG=${FOUNDRY_MAJOR}`,
  '--tag', IMAGE,
  '--file', DOCKERFILE,
  join(__dirname, '../docker'),
], { stdio: 'inherit' });

process.exit(result.status ?? 1);
