import { test, expect } from '../../fixtures/test-base.mjs';
import { scanAccessibility } from '../../fixtures/accessibility.mjs';

test('@accessibility @ui Simulacrum sidebar exposes named, structurally valid controls', async ({
  gamePage,
  foundry,
}) => {
  let active = await foundry.isSimulacrumActive(gamePage);
  if (!active) active = await foundry.enableModuleViaUI(gamePage, 'simulacrum');
  expect(active).toBe(true);

  const tab = await foundry.openSimulacrumSidebar(gamePage);
  await expect(tab).toBeVisible();

  const report = await scanAccessibility(gamePage, '#simulacrum');
  await test.info().attach('simulacrum-accessibility.json', {
    body: Buffer.from(JSON.stringify(report, null, 2)),
    contentType: 'application/json',
  });
  expect(report.violations).toEqual([]);
});
