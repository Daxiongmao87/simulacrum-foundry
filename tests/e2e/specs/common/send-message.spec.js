import { test, expect } from '../../fixtures/test-base.js';

test('user can send a message from the Simulacrum sidebar', async ({
  simulacrumPage,
  foundryVersion,
}) => {
  test.info().annotations.push({ type: 'foundryVersion', description: `v${foundryVersion}` });

  // Activate Simulacrum tab — use the v14 sidebar API when available,
  // fall back to clicking the tab button for v13.
  await simulacrumPage.evaluate(() => {
    // @ts-ignore
    if (typeof ui.sidebar?.activateTab === 'function') {
      // v14 ApplicationV2 sidebar
      // @ts-ignore
      ui.sidebar.activateTab('simulacrum');
    } else {
      // v13 fallback: click the tab button
      const btn = document.querySelector('#sidebar [data-tab="simulacrum"], #ui-right [data-tab="simulacrum"]');
      btn?.click();
    }
  });

  const input = simulacrumPage.locator('#simulacrum-chat-message');
  await expect(input).toBeVisible({ timeout: 10000 });

  const message = `e2e-smoke-${foundryVersion}-${Date.now()}`;
  await input.fill(message);
  await input.press('Enter');

  // The user message renders client-side before any LLM call, so this passes
  // even without API credentials.
  await expect(input).toHaveValue('', { timeout: 5000 });

  const userMessage = simulacrumPage
    .locator('ol.chat-log')
    .filter({ hasText: message })
    .first();
  await expect(userMessage).toBeVisible({ timeout: 10000 });
});
