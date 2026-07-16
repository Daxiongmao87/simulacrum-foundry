import { test, expect } from '../../fixtures/test-base.mjs';
import { scanAccessibility } from '../../fixtures/accessibility.mjs';

test('@accessibility @ui Simulacrum sidebar exposes named, structurally valid controls', async ({
  gamePage,
  foundry,
}) => {
  test.setTimeout(420000);

  let active = await foundry.isSimulacrumActive(gamePage);
  if (!active) active = await foundry.enableModuleViaUI(gamePage, 'simulacrum');
  expect(active).toBe(true);

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
  await expect(tab).toBeVisible();
  await expect(gamePage.locator('#sidebar-content.active-simulacrum')).toBeVisible();
  await expect(tab.locator('.chat-scroll')).toBeVisible();
  await expect(tab.locator('.chat-form')).toBeVisible();
  await expect(tab.locator('textarea[name="message"]')).toBeVisible();
  await expect
    .poll(async () => tab.locator('.chat-log .chat-message').count(), {
      message: 'Simulacrum sidebar should render at least one chat message before scanning',
      timeout: 30000,
    })
    .toBeGreaterThan(0);

  const report = await scanAccessibility(gamePage, '#simulacrum');
  await test.info().attach('simulacrum-accessibility.json', {
    body: Buffer.from(JSON.stringify(report, null, 2)),
    contentType: 'application/json',
  });
  expect(report.violations).toEqual([]);
});
