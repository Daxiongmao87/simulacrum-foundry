import { test, expect } from '../../fixtures/test-base.js';

test('user can send a message from the Simulacrum sidebar', async ({
  simulacrumPage,
  foundryVersion,
}) => {
  test.info().annotations.push({ type: 'foundryVersion', description: `v${foundryVersion}` });

  const tabButton = simulacrumPage.locator('#sidebar [data-tab="simulacrum"]').first();
  await tabButton.click({ force: true });

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
