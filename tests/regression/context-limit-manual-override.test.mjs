/**
 * Regression test for #184: a manually entered context limit must survive a
 * browser refresh (and any sidebar re-render) for the model it was set on,
 * instead of reverting to the model's derived metadata.
 *
 * Mechanism under test: modelService.getContextLimit must return the manually
 * saved limit (fallbackContextLimit, associated with the model it was set on
 * via the contextLimitModel setting) ahead of derived/OpenRouter metadata.
 * The #184 failure mode was derived metadata (1.05M) winning over the saved
 * manual value (272k) after refresh.
 */
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';

// Foundry base-class stubs — must exist before the sidebar tab module is
// imported (it resolves its base class at module scope). Same contract as
// the stubs in composer-draft-preservation.test.mjs.
globalThis.AbstractSidebarTab ??= class AbstractSidebarTab {};
globalThis.HandlebarsApplicationMixin ??= Base => class extends Base {};
globalThis.FormApplication ??= class FormApplication {};
globalThis.foundry ??= { applications: {} };

// When true, the next contextLimitModel settings write fails — used to
// exercise the partial-write rollback in _saveContextLimit.
let failContextLimitModel = false;
import { modelService } from '../../scripts/core/model-service.js';

const settingsStore = {};
let originalGame = globalThis.game;

before(() => {
  originalGame = globalThis.game;
  globalThis.game = {
    settings: {
      get: (_module, key) => (key in settingsStore ? settingsStore[key] : undefined),
      set: async (_module, key, value) => {
        if (key === 'contextLimitModel' && failContextLimitModel) {
          throw new Error('settings write failed');
        }
        settingsStore[key] = value;
      },
    },
  };
  // Primary metadata: model-a derives 1.05M, model-b derives 200k
  modelService._parseModelsResponse({
    data: [
      { id: 'codex/model-a', object: 'model', meta: { n_ctx: 1050000 } },
      { id: 'codex/model-b', object: 'model', context_length: 200000 },
    ],
  });
});

after(() => {
  if (typeof originalGame === 'undefined') {
    delete globalThis.game;
  } else {
    globalThis.game = originalGame;
  }
  settingsStore.fallbackContextLimit = 32000;
  settingsStore.contextLimitModel = '';
});

test('manual limit set for the current model wins over derived metadata (refresh path)', () => {
  settingsStore.fallbackContextLimit = 272000;
  settingsStore.contextLimitModel = 'codex/model-a';
  assert.deepEqual(modelService.getContextLimit('codex/model-a'), {
    limit: 272000,
    source: 'manual',
  });
});

test('manual limit associated with a different model does not apply', () => {
  settingsStore.fallbackContextLimit = 272000;
  settingsStore.contextLimitModel = 'codex/model-a';
  assert.deepEqual(modelService.getContextLimit('codex/model-b'), {
    limit: 200000,
    source: 'derived',
  });
});

test('no manual association still yields derived metadata', () => {
  settingsStore.fallbackContextLimit = 32000;
  settingsStore.contextLimitModel = '';
  assert.deepEqual(modelService.getContextLimit('codex/model-a'), {
    limit: 1050000,
    source: 'derived',
  });
});

test('manual association with non-positive limit falls back to derived', () => {
  settingsStore.fallbackContextLimit = 0;
  settingsStore.contextLimitModel = 'codex/model-a';
  assert.deepEqual(modelService.getContextLimit('codex/model-a'), {
    limit: 1050000,
    source: 'derived',
  });
});

test('association write failure rolls back the limit write (pair stays consistent)', async () => {
  const { SimulacrumSidebarTab } = await import('../../scripts/ui/simulacrum-sidebar-tab.js');
  settingsStore.fallbackContextLimit = 32000;
  settingsStore.contextLimitModel = 'codex/model-a';
  settingsStore.model = 'codex/model-a';
  const instance = {
    logger: { info: () => {} },
    _parseContextLimit: SimulacrumSidebarTab.prototype._parseContextLimit,
  };
  failContextLimitModel = true;
  try {
    await assert.rejects(
      () => SimulacrumSidebarTab.prototype._saveContextLimit.call(instance, '272k'),
      /settings write failed/
    );
  } finally {
    failContextLimitModel = false;
  }
  assert.equal(
    settingsStore.fallbackContextLimit,
    32000,
    'the limit write must be rolled back when the association write fails'
  );
  assert.equal(
    settingsStore.contextLimitModel,
    'codex/model-a',
    'the association must be untouched on failure'
  );
});
