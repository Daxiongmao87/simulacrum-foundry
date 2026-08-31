import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';

import { modelService } from '../../scripts/core/model-service.js';

// OpenRouter cross-reference fixture: a DIFFERENT provider's entry whose basename
// collides with the primary model id (the #185 failure mode).
const OPENROUTER_DATA = {
  data: [{ id: 'openai/gpt-5.6-terra', object: 'model', context_length: 1050000 }],
};

let originalFetch = globalThis.fetch;

// modelService is a singleton with persistent private state (#openRouterFetched
// is never reset by invalidateCache), so populate the OpenRouter cache once,
// before any test, using a stubbed fetch.
before(async () => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => OPENROUTER_DATA,
  });
  await modelService.fetchOpenRouterModels();
});

after(() => {
  if (typeof originalFetch === 'function') {
    globalThis.fetch = originalFetch;
  } else {
    delete globalThis.fetch;
  }
});

test('meta.n_ctx is recognized as primary-provider context metadata', () => {
  modelService._parseModelsResponse({
    data: [{ id: 'codex/gpt-5.6-terra', object: 'model', meta: { n_ctx: 272000 } }],
  });
  assert.deepEqual(modelService.getContextLimit('codex/gpt-5.6-terra'), {
    limit: 272000,
    source: 'derived',
  });
});

test('primary meta.n_ctx takes precedence over OpenRouter cross-reference', () => {
  modelService._parseModelsResponse({
    data: [{ id: 'codex/gpt-5.6-terra', object: 'model', meta: { n_ctx: 272000 } }],
  });
  const result = modelService.getContextLimit('codex/gpt-5.6-terra');
  assert.equal(result.limit, 272000);
  assert.equal(result.source, 'derived');
  assert.notEqual(
    result.limit,
    1050000,
    'the wrong-provider OpenRouter basename value must not win'
  );
});

test('cross-reference still resolves when primary context metadata is absent', () => {
  modelService._parseModelsResponse({
    data: [{ id: 'codex/gpt-5.6-terra', object: 'model' }],
  });
  assert.deepEqual(modelService.getContextLimit('codex/gpt-5.6-terra'), {
    limit: 1050000,
    source: 'openrouter',
  });
});

test('fallback is used when neither primary metadata nor OpenRouter match', () => {
  modelService._parseModelsResponse({
    data: [{ id: 'totally/unknown-model', object: 'model' }],
  });
  assert.deepEqual(modelService.getContextLimit('totally/unknown-model', 32000), {
    limit: 32000,
    source: 'fallback',
  });
});

test('flat context_length keys still resolve (no regression from meta.n_ctx)', () => {
  modelService._parseModelsResponse({
    data: [{ id: 'some/model', object: 'model', context_length: 128000 }],
  });
  assert.deepEqual(modelService.getContextLimit('some/model'), {
    limit: 128000,
    source: 'derived',
  });
});

test('non-positive meta.n_ctx is ignored in favor of fallback', () => {
  modelService._parseModelsResponse({
    data: [{ id: 'codex/no-context-xyz', object: 'model', meta: { n_ctx: 0 } }],
  });
  assert.deepEqual(modelService.getContextLimit('codex/no-context-xyz', 32000), {
    limit: 32000,
    source: 'fallback',
  });
});
