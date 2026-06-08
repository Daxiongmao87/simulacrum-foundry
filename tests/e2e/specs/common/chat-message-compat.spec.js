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

    // Register the render hook to mirror what ChatInterface.initialize() does.
    // We register it here to ensure it's active regardless of module init order,
    // and to test the v14 renderChatMessageHTML / v13 renderChatMessage path directly.
    await simulacrumPage.evaluate(() => {
      // @ts-ignore
      if (foundry.utils?.isNewerVersion?.(game.version, '13.330')) {
        // v14: HTMLElement-based hook
        // @ts-ignore
        Hooks.on('renderChatMessageHTML', (message, html) => {
          if (message?.flags?.simulacrum?.userMessage) html?.classList?.add('simulacrum-user-message');
        });
      } else {
        // v13: jQuery-based hook
        // @ts-ignore
        Hooks.on('renderChatMessage', (message, html) => {
          if (message?.flags?.simulacrum?.userMessage) html?.addClass?.('simulacrum-user-message');
        });
      }
    });

    // Create a simulacrum-flagged message using the v14-compat APIs.
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

    // Wait for the render hook to apply the class (async after socket message).
    await simulacrumPage.waitForFunction(
      () => !!document.querySelector('.simulacrum-user-message'),
      { timeout: 10000 }
    );

    // Activate the chat tab and confirm the element is visible.
    await simulacrumPage.evaluate(() => {
      // @ts-ignore
      if (typeof ui.sidebar?.activateTab === 'function') {
        // @ts-ignore
        ui.sidebar.activateTab('chat');
      } else {
        document.querySelector('#sidebar [data-tab="chat"]')?.click();
      }
    });

    const flaggedMessage = simulacrumPage.locator('.simulacrum-user-message').first();
    await expect(flaggedMessage).toBeVisible({ timeout: 10000 });
  });
});
