import { test, expect } from '../../fixtures/test-base.mjs';

const IGNORED_CONSOLE_ERRORS = [/localhost:11434/i, /net::ERR_CONNECTION_REFUSED/i, /\/models\b/i];

function collectBrowserErrors(page) {
  const errors = [];

  page.on('pageerror', error => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on('console', message => {
    if (message.type() !== 'error') return;

    const text = message.text();
    if (IGNORED_CONSOLE_ERRORS.some(pattern => pattern.test(text))) return;

    errors.push(`console.error: ${text}`);
  });

  return errors;
}

test('Simulacrum sidebar tab renders non-blank for a GM', async ({
  gamePage,
  foundry,
  foundryVersion,
  systemId,
}) => {
  const browserErrors = collectBrowserErrors(gamePage);

  let active = await foundry.isSimulacrumActive(gamePage);
  if (!active) {
    active = await foundry.enableModuleViaUI(gamePage, 'simulacrum');
  }

  expect(active, `Simulacrum module should enable on Foundry ${foundryVersion}/${systemId}`).toBe(
    true
  );

  await gamePage.waitForFunction(
    () => {
      // @ts-ignore - Foundry globals
      return game?.modules?.get('simulacrum')?.active === true;
    },
    null,
    { timeout: 30000 }
  );

  await gamePage.waitForFunction(
    () => {
      // @ts-ignore - Foundry globals
      return Boolean(ui?.sidebar && ui?.simulacrum && CONFIG?.ui?.simulacrum);
    },
    null,
    { timeout: 30000 }
  );

  const tab = await foundry.openSimulacrumSidebar(gamePage);

  await expect(gamePage.locator('#sidebar-content.active-simulacrum')).toBeVisible();
  await expect(tab.locator('.chat-scroll')).toBeVisible();
  await expect(tab.locator('.chat-form')).toBeVisible();
  await expect(tab.locator('textarea[name="message"]')).toBeVisible();

  await expect
    .poll(async () => tab.locator('.chat-log .chat-message').count(), {
      message: 'Simulacrum sidebar should render at least one chat message',
      timeout: 30000,
    })
    .toBeGreaterThan(0);

  const renderedState = await tab.evaluate(element => {
    const chatLog = element.querySelector('.chat-log');
    const chatScroll = element.querySelector('.chat-scroll');
    const input = element.querySelector('textarea[name="message"]');

    return {
      htmlLength: element.innerHTML.trim().length,
      textLength: chatLog?.textContent?.trim().length ?? 0,
      chatScrollHeight: chatScroll?.getBoundingClientRect().height ?? 0,
      inputVisible: input instanceof HTMLElement && input.offsetParent !== null,
    };
  });

  expect(renderedState.htmlLength).toBeGreaterThan(100);
  expect(renderedState.textLength).toBeGreaterThan(0);
  expect(renderedState.chatScrollHeight).toBeGreaterThan(0);
  expect(renderedState.inputVisible).toBe(true);
  expect(browserErrors).toEqual([]);
});
