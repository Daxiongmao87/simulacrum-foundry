import { test, expect } from '../../fixtures/test-base.js';

test.describe('chat-interface v13/v14 API compatibility', () => {
  test('CONST.CHAT_MESSAGE_STYLES resolves to a usable object', async ({
    simulacrumPage,
    foundryVersion,
  }) => {
    test.info().annotations.push({ type: 'foundryVersion', description: `v${foundryVersion}` });

    const result = await simulacrumPage.evaluate(() => {
      // eslint-disable-next-line no-undef
      const styles = CONST.CHAT_MESSAGE_STYLES ?? CONST.CHAT_MESSAGE_TYPES;
      return {
        exists: styles != null,
        isObject: typeof styles === 'object',
        hasOther: 'OTHER' in (styles ?? {}),
        hasOoc: 'OOC' in (styles ?? {}),
      };
    });

    expect(result.exists).toBe(true);
    expect(result.isObject).toBe(true);
    expect(result.hasOther).toBe(true);
    expect(result.hasOoc).toBe(true);
  });

  test('game.user.id is the canonical user identifier', async ({
    simulacrumPage,
    foundryVersion,
  }) => {
    test.info().annotations.push({ type: 'foundryVersion', description: `v${foundryVersion}` });

    const userId = await simulacrumPage.evaluate(() => {
      // eslint-disable-next-line no-undef
      return game.user.id;
    });

    expect(typeof userId).toBe('string');
    expect(userId.length).toBeGreaterThan(0);
  });

  test('ChatMessage.create with simulacrum flags renders with correct CSS class', async ({
    simulacrumPage,
    foundryVersion,
  }) => {
    test.info().annotations.push({ type: 'foundryVersion', description: `v${foundryVersion}` });

    // Create a simulacrum-flagged message the same way chat-interface.js does,
    // using the CHAT_MESSAGE_STYLES shim and user.id.
    const created = await simulacrumPage.evaluate(async () => {
      // eslint-disable-next-line no-undef
      const user = game.user;
      // eslint-disable-next-line no-undef
      const styles = CONST.CHAT_MESSAGE_STYLES ?? CONST.CHAT_MESSAGE_TYPES;
      try {
        // eslint-disable-next-line no-undef
        await ChatMessage.create({
          author: user.id,
          content: 'e2e-compat-class-probe',
          style: styles.OTHER ?? 0,
          speaker: { alias: 'Simulacrum AI' },
          flags: { simulacrum: { userMessage: true } },
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });

    expect(created.ok, `ChatMessage.create threw: ${created.error}`).toBe(true);

    // The render hook (renderChatMessageHTML on v14, renderChatMessage on v13)
    // should have added .simulacrum-user-message to the rendered element.
    // Navigate to the Foundry chat tab where ChatMessage renders.
    const chatTab = simulacrumPage.locator('#sidebar [data-tab="chat"]').first();
    await chatTab.click({ force: true });

    const flaggedMessage = simulacrumPage.locator('.simulacrum-user-message').first();
    await expect(flaggedMessage).toBeVisible({ timeout: 10000 });
  });
});
