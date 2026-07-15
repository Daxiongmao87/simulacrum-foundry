import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldRunDeadCodeCheck } from '../../tools/agentic-delivery/dead-code-check.mjs';

test('dead-code gate runs full knip when config files changed', () => {
  assert.deepEqual(
    shouldRunDeadCodeCheck({
      configChanged: ['knip.json'],
      changedRuntime: ['scripts/core/chat-handler.js'],
    }),
    { mode: 'full' }
  );
});

test('dead-code gate runs baseline diff for runtime or dependency changes without config drift', () => {
  assert.deepEqual(
    shouldRunDeadCodeCheck({
      configChanged: [],
      changedRuntime: ['package-lock.json'],
    }),
    { mode: 'baseline-diff' }
  );
});

test('dead-code gate skips when no relevant files changed', () => {
  assert.deepEqual(
    shouldRunDeadCodeCheck({
      configChanged: [],
      changedRuntime: [],
    }),
    { mode: 'skip' }
  );
});
