import { test, expect } from '../../fixtures/test-base.mjs';
import { openSimulacrumSidebar } from '../../fixtures/foundry-helpers.mjs';

/**
 * Visual verification for issue #185.
 *
 * A provider model whose metadata advertises `meta.n_ctx: 272000` must render
 * its context-limit field as "272k" (the derived primary value), NOT "1.05M"
 * (the wrong-provider OpenRouter basename cross-reference value).
 */
test('@visual @context-limit #185 context-limit field shows derived meta.n_ctx value', async ({
  simulacrumPage,
}) => {
  const tab = await openSimulacrumSidebar(simulacrumPage);

  // Mock fetch so the provider /models response carries meta.n_ctx (no flat
  // context_length), while OpenRouter returns a colliding basename entry with
  // the larger 1050000 value. The fix makes the primary metadata win.
  await simulacrumPage.evaluate(({ providerModels, openRouterModels }) => {
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/v1/models') || u.includes('/models')) {
        return { ok: true, status: 200, json: async () => ({ data: providerModels }) };
      }
      if (u.includes('openrouter.ai')) {
        return { ok: true, status: 200, json: async () => ({ data: openRouterModels }) };
      }
      // Any other fetch (e.g. AI client init) -> neutral ok.
      return { ok: true, status: 200, json: async () => ({}) };
    };
  }, {
    providerModels: [{ id: 'codex/gpt-5.6-terra', object: 'model', meta: { n_ctx: 272000 } }],
    openRouterModels: [{ id: 'openai/gpt-5.6-terra', object: 'model', context_length: 1050000 }],
  });

  // Reset the model service caches (which module validation populated with the
  // real endpoint's data) so the mock fetch below is actually consulted, then
  // re-populate so the context-limit input re-renders with the derived value.
  await simulacrumPage.evaluate(async () => {
    globalThis.modelService.reset();
    await globalThis.modelService.fetchModels();
    await globalThis.modelService.fetchOpenRouterModels();
    ui.simulacrum._saveModelSelection('codex/gpt-5.6-terra');
  });

  await simulacrumPage.waitForTimeout(500);

  // Programmatic assertion on the rendered context-limit field.
  const ctxInput = tab.locator('.context-limit-input').first();
  await expect(ctxInput).toBeVisible();
  const ctxValue = await ctxInput.inputValue();
  expect(ctxValue).toBe('272k');

  const screenshot = await tab.screenshot({ path: `context_limit_visual_${Date.now()}.png` });
  expect(screenshot).toBeTruthy();
});
