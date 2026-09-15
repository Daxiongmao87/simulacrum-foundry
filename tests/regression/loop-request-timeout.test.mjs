/**
 * Regression tests for #178: the tool loop must never hang forever on a
 * wedged AI endpoint, and a user cancellation must reach the compaction
 * summarization calls.
 *
 * Mechanism pinned here:
 *   1. AIClient.chat() awaited fetch with no timeout - a server that
 *      accepts the connection and never responds hung the whole turn
 *      (and the sidebar input) indefinitely.
 *   2. ConversationManager.compactHistory() dropped any cancellation
 *      signal, so a multi-round compaction burst could not be aborted.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Shim Foundry settings BEFORE importing the modules under test.
globalThis.game = {
  settings: {
    get: (scope, key) => (key === 'requestTimeout' ? 150 : 0),
  },
};
globalThis.FormApplication = class {};

const { AIClient } = await import('../../scripts/core/ai-client.js');
const { ConversationManager, COMPACTION_STATUS } =
  await import('../../scripts/core/conversation.js');

/**
 * Emulate a hung server: the fetch promise settles only if its signal
 * aborts, mirroring real fetch abort semantics.
 */
function hungFetch(options) {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      const err = new Error('The operation was aborted.');
      err.name = 'AbortError';
      reject(err);
    };
    if (options?.signal?.aborted) {
      onAbort();
      return;
    }
    options?.signal?.addEventListener('abort', onAbort, { once: true });
  });
}

test('AIClient.chat rejects with a typed timeout when the endpoint hangs', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url, options) => hungFetch(options);

  const client = new AIClient({
    apiKey: 'test-key',
    baseURL: 'http://localhost:9999/v1',
    model: 'test-model',
  });

  const started = Date.now();
  // The deadline race makes the pre-fix failure (never settles) fail
  // fast and cleanly instead of hanging the test suite. The timer is
  // cleared after the race so a winning timeout does not keep the
  // event loop alive for the full 5s.
  let deadlineTimer;
  const deadline = new Promise((_, reject) => {
    deadlineTimer = setTimeout(
      () => reject(new Error('TEST_DEADLINE: hung request never settled')),
      5000
    );
  });
  try {
    await assert.rejects(
      Promise.race([client.chat([{ role: 'user', content: 'hi' }], null, {}), deadline]),
      err => err.name === 'NetworkError' && /timed out/i.test(err.message)
    );
    assert.ok(Date.now() - started < 5000, 'timeout must fire promptly');
  } finally {
    clearTimeout(deadlineTimer);
    globalThis.fetch = originalFetch;
  }
});

test('compactHistory propagates the cancellation signal to the AI call', async () => {
  const manager = new ConversationManager('user-1', 'world-1', 100);
  manager.addMessage('user', 'x'.repeat(4000)); // over the 100-token budget

  const captured = {};
  const fakeClient = {
    chat: (messages, tools, options = {}) => {
      Object.assign(captured, options);
      return new Promise((resolve, reject) => {
        const onAbort = () => {
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        };
        if (options.signal?.aborted) {
          onAbort();
          return;
        }
        options.signal?.addEventListener('abort', onAbort, { once: true });
        setTimeout(() => resolve({ choices: [{ message: { content: 'summary' } }] }), 300);
      });
    },
  };

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 50);
  const started = Date.now();
  const status = await manager.compactHistory(fakeClient, 0, controller.signal);

  assert.equal(captured.signal, controller.signal, 'signal must reach the AI call');
  assert.equal(
    status,
    COMPACTION_STATUS.FAILED,
    'aborted compaction must report FAILED, not compact or hang'
  );
  assert.ok(Date.now() - started < 250, 'abort must settle compaction promptly');
});

test('AIClient.chat bounds body consumption when the endpoint stalls after headers', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url, options) => {
    // Headers arrive; the JSON body never does unless the signal aborts.
    const stalledBody = new Promise((resolve, reject) => {
      const onAbort = () => {
        const err = new Error('The operation was aborted.');
        err.name = 'AbortError';
        reject(err);
      };
      if (options?.signal?.aborted) {
        onAbort();
        return;
      }
      options?.signal?.addEventListener('abort', onAbort, { once: true });
    });
    return Promise.resolve({ ok: true, status: 200, json: () => stalledBody });
  };
  const client = new AIClient({
    apiKey: 'test-key',
    baseURL: 'http://localhost:9999/v1',
    model: 'test-model',
  });
  const started = Date.now();
  let deadlineTimer;
  const deadline = new Promise((_, reject) => {
    deadlineTimer = setTimeout(
      () => reject(new Error('TEST_DEADLINE: body read never settled')),
      5000
    );
  });
  try {
    await assert.rejects(
      Promise.race([client.chat([{ role: 'user', content: 'hi' }], null, {}), deadline]),
      err => err.name === 'NetworkError' && /timed out/i.test(err.message)
    );
    assert.ok(Date.now() - started < 5000, 'body timeout must fire promptly');
  } finally {
    clearTimeout(deadlineTimer);
    globalThis.fetch = originalFetch;
  }
});

test('a request that gets headers near the deadline consumes one budget, not two', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url, options) =>
    new Promise(resolve => {
      // Headers arrive at 120ms into the 150ms test budget; then the
      // body stalls until the signal aborts.
      setTimeout(() => {
        const stalledBody = new Promise((_, reject) => {
          const onAbort = () => {
            const err = new Error('The operation was aborted.');
            err.name = 'AbortError';
            reject(err);
          };
          if (options?.signal?.aborted) {
            onAbort();
            return;
          }
          options?.signal?.addEventListener('abort', onAbort, { once: true });
        });
        resolve({ ok: true, status: 200, json: () => stalledBody });
      }, 120);
    });
  const client = new AIClient({
    apiKey: 'test-key',
    baseURL: 'http://localhost:9999/v1',
    model: 'test-model',
  });
  const started = Date.now();
  let deadlineTimer;
  const deadline = new Promise((_, reject) => {
    deadlineTimer = setTimeout(
      () => reject(new Error('TEST_DEADLINE: near-deadline request never settled')),
      5000
    );
  });
  try {
    await assert.rejects(
      Promise.race([client.chat([{ role: 'user', content: 'hi' }], null, {}), deadline]),
      err => err.name === 'NetworkError' && /timed out/i.test(err.message)
    );
    // Pre-fix, the body phase re-armed a full fresh budget, so this
    // request settled at ~270ms (120ms headers + 150ms body). One
    // deadline means it must settle by the original ~150ms.
    assert.ok(Date.now() - started < 200, 'one request must not exceed one timeout budget');
  } finally {
    clearTimeout(deadlineTimer);
    globalThis.fetch = originalFetch;
  }
});
