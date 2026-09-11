import { test, expect } from '../../fixtures/test-base.mjs';
import { openSimulacrumSidebar, waitForFoundryReady } from '../../fixtures/foundry-helpers.mjs';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = join(__dirname, '..', '..', 'reports', 'context-limit');

/**
 * Screenshot path under the gitignored reports dir, per Foundry version.
 * @param {string} version Foundry version under test
 * @param {string} name Screenshot file name
 * @returns {string} Absolute screenshot path
 */
const shotPath = (version, name) => {
  const dir = join(REPORT_DIR, version);
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
};

/**
 * Reset the model-service caches (populated with real endpoint data during
 * module validation) and re-populate them from the network-level route mock,
 * then select the model so the context-limit input re-renders.
 * @param {import('@playwright/test').Page} page Simulacrum page
 */
const repopulateModelService = page =>
  page.evaluate(async () => {
    await globalThis.modelService.reset();
    await globalThis.modelService.fetchModels();
    await globalThis.modelService.fetchOpenRouterModels();
    ui.simulacrum._saveModelSelection('codex/gpt-5.6-terra');
  });

/**
 * Visual verification for issue #185.
 *
 * A provider model whose metadata advertises `meta.n_ctx: 272000` must render
 * its context-limit field as "272k" (the derived primary value), NOT "1.05M"
 * (the wrong-provider OpenRouter basename cross-reference value).
 */
test('@visual @context-limit #185 context-limit field shows derived meta.n_ctx value', async ({
  simulacrumPage,
  foundryVersion,
}) => {
  const tab = await openSimulacrumSidebar(simulacrumPage);

  // Network-level mock: the provider advertises 272k via meta.n_ctx while
  // OpenRouter returns a colliding basename entry with the larger 1050000
  // value. The fix makes the primary metadata win.
  const providerModels = [{ id: 'codex/gpt-5.6-terra', object: 'model', meta: { n_ctx: 272000 } }];
  const openRouterModels = [
    { id: 'openai/gpt-5.6-terra', object: 'model', context_length: 1050000 },
  ];
  await simulacrumPage.route('**/models**', route =>
    route.fulfill({
      contentType: 'application/json',
      json: String(route.request().url()).includes('openrouter.ai')
        ? { data: openRouterModels }
        : { data: providerModels },
    })
  );

  await repopulateModelService(simulacrumPage);
  await simulacrumPage.waitForTimeout(500);

  // Programmatic assertion on the rendered context-limit field.
  const ctxInput = tab.locator('.context-limit-input').first();
  await expect(ctxInput).toBeVisible();
  const ctxValue = await ctxInput.inputValue();
  expect(ctxValue).toBe('272k');

  const screenshot = await simulacrumPage.screenshot({
    path: shotPath(foundryVersion, '#185-derived-value.png'),
  });
  expect(screenshot).toBeTruthy();
});

/**
 * Visual verification for issue #184.
 *
 * A model that auto-populates its context limit (1.05M) must keep the
 * manually entered value (272k) after a browser refresh, instead of the
 * field reverting to the derived model metadata. The manual value is
 * associated with the model it was set on, so only that model is affected.
 */
test('@visual @context-limit #184 manual context limit survives browser refresh', async ({
  simulacrumPage,
  foundryVersion,
}) => {
  const tab = await openSimulacrumSidebar(simulacrumPage);

  // Network-level mock (survives page.reload, unlike an in-page fetch stub):
  // the provider advertises 1.05M via meta.n_ctx.
  const providerModels = [{ id: 'codex/gpt-5.6-terra', object: 'model', meta: { n_ctx: 1050000 } }];
  await simulacrumPage.route('**/models**', route =>
    route.fulfill({
      contentType: 'application/json',
      json: String(route.request().url()).includes('openrouter.ai')
        ? { data: [] }
        : { data: providerModels },
    })
  );

  await repopulateModelService(simulacrumPage);
  await simulacrumPage.waitForTimeout(500);

  const ctxInput = tab.locator('.context-limit-input').first();
  await expect(ctxInput).toBeVisible();
  // Sanity: the field auto-populated from derived metadata.
  expect(await ctxInput.inputValue()).toBe('1.05M');
  await simulacrumPage.screenshot({ path: shotPath(foundryVersion, '#184-A-derived.png') });

  // Manually set the limit; the 500ms debounced save persists it together
  // with the model association.
  await ctxInput.fill('272k');
  await simulacrumPage.waitForTimeout(800);

  // Refresh the browser; world settings persist, derived metadata re-fetches.
  await simulacrumPage.reload({ waitUntil: 'networkidle' });
  await waitForFoundryReady(simulacrumPage);
  const tabAfterReload = await openSimulacrumSidebar(simulacrumPage);

  // The field must show the manually saved 272k, not the derived 1.05M.
  const ctxAfterReload = tabAfterReload.locator('.context-limit-input').first();
  await expect(ctxAfterReload).toBeVisible({ timeout: 15000 });
  await expect(ctxAfterReload).toHaveValue('272k', { timeout: 15000 });
  await simulacrumPage.screenshot({ path: shotPath(foundryVersion, '#184-B-after-reload.png') });
});
