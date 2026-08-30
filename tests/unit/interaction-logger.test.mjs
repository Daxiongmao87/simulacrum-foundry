// Unit test: loop events render in the downloadable interaction log (#178 review).
// buildReadableLog() feeds downloadAsFile(); loop events must not be dropped there.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Minimal Foundry globals, stubbed before the module-under-test is imported.
globalThis.game = {
  settings: { get: () => 'test-model' },
  system: { id: 'test-system' },
  modules: { get: () => ({ version: '0.0.0-test' }) },
};
globalThis.FormApplication = class {
  close() {}
};

const { interactionLogger } = await import('../../scripts/core/interaction-logger.js');

test('buildReadableLog renders loop events with loopId, event and details', () => {
  interactionLogger.logLoopEvent('loop-123', 'loop_started', { initialToolCalls: 1 });
  interactionLogger.logLoopEvent('loop-123', 'api_request_started', { mode: 'native' });
  interactionLogger.logLoopEvent('loop-123', 'loop_ended', { reason: 'end_loop' });

  const text = interactionLogger.buildReadableLog();

  assert.ok(
    text.includes('[loop loop-123] loop_started {"initialToolCalls":1}'),
    'loop_started rendered'
  );
  assert.ok(
    text.includes('[loop loop-123] api_request_started {"mode":"native"}'),
    'api_request_started rendered'
  );
  assert.ok(
    text.includes('[loop loop-123] loop_ended {"reason":"end_loop"}'),
    'loop_ended rendered'
  );
});

test('buildReadableLog omits loop event details when empty', () => {
  interactionLogger.logLoopEvent('loop-456', 'api_request_aborted');

  const text = interactionLogger.buildReadableLog();

  assert.ok(text.includes('[loop loop-456] api_request_aborted\n'), 'no details suffix');
});
