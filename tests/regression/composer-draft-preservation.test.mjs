import assert from 'node:assert/strict';
import { test } from 'node:test';

// Regression for #206: unsent composer text was wiped by any render that
// re-rendered the `input` part. Foundry's HandlebarsApplicationMixin part-state
// sync restores focus, scroll, and disclosure state only — not input values —
// and the composer textarea is stateless in sidebar-input.hbs. The sidebar tab
// must therefore extend part-state sync to carry the draft across re-renders.
//
// The stub base classes below stand in for the Foundry mixin with the same
// contract as the real one for this code path: no-op draft-unaware sync.

globalThis.AbstractSidebarTab ??= class AbstractSidebarTab {};
globalThis.HandlebarsApplicationMixin ??= Base =>
  class extends Base {
    static PARTS = {};
    _preSyncPartState() {}
    _syncPartState() {}
  };
globalThis.FormApplication ??= class FormApplication {};
globalThis.foundry ??= { applications: {} };

const MESSAGE_SELECTOR = 'textarea[name="message"]';

/** Build a minimal stand-in for the rendered `input` part (the form). */
const makeInputPart = value => {
  const textarea = { value };
  return {
    querySelector: selector => (selector === MESSAGE_SELECTOR ? textarea : null),
  };
};

/** Run one Foundry part-replacement sync cycle for the `input` part. */
const syncInputPart = async (prior, fresh) => {
  const { SimulacrumSidebarTab } = await import(
    '../../scripts/ui/simulacrum-sidebar-tab.js'
  );
  const state = {};
  SimulacrumSidebarTab.prototype._preSyncPartState.call(
    {},
    'input',
    fresh,
    prior,
    state
  );
  SimulacrumSidebarTab.prototype._syncPartState.call({}, 'input', fresh, prior, state);
  return fresh;
};

test('input part re-render preserves the unsent composer draft', async () => {
  const prior = makeInputPart('roll initiative for the party');
  const fresh = makeInputPart('');

  const result = await syncInputPart(prior, fresh);

  assert.equal(
    result.querySelector(MESSAGE_SELECTOR).value,
    'roll initiative for the party',
    'the draft typed before the render must survive the re-render'
  );
});

test('cleared composer does not resurrect text after a re-render', async () => {
  // handleSendMessage clears the textarea in the DOM before triggering the
  // processing render; an empty prior value must stay empty.
  const prior = makeInputPart('');
  const fresh = makeInputPart('');

  const result = await syncInputPart(prior, fresh);

  assert.equal(result.querySelector(MESSAGE_SELECTOR).value, '');
});
