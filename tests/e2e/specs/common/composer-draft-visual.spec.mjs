import { test, expect } from '../../fixtures/test-base.mjs';
import { openSimulacrumSidebar } from '../../fixtures/foundry-helpers.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Visual verification for issue #206: unsent composer draft text must
 * survive sidebar re-renders. Foundry's part-state sync restores focus,
 * scroll, and disclosure state but not input values, so the module extends
 * it (see `_preSyncPartState`/`_syncPartState` in
 * scripts/ui/simulacrum-sidebar-tab.js).
 *
 * This spec drives the real popout gesture: right-clicking the sidebar tab
 * opens the popout (Foundry `sidebar.mjs` `_onClickTab`), which re-renders
 * the `input` part in the main tab; closing the popout re-renders it again.
 * Both re-renders used to wipe the unsent draft. Screenshots are recorded
 * as judge-manifest entries (tools/visual-judge.mjs) for the screenshot
 * receipt required by .omp/RULES.md.
 */

const DRAFT = 'roll initiative for the party';
const REPORT_DIR = join(__dirname, '..', '..', 'reports', 'composer-draft');
const FIX =
  '#206: unsent composer draft text must survive sidebar re-renders ' + '(popout open and close)';

/**
 * Screenshot path under the gitignored reports dir, per Foundry version.
 * @param {string} version  Foundry version under test
 * @param {string} name     Screenshot file name
 * @returns {string} Absolute screenshot path
 */
const shotPath = (version, name) => {
  const dir = join(REPORT_DIR, version);
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
};

/**
 * Record a screenshot as a judge-manifest entry (replaces any entries for
 * the same Foundry version from a previous run).
 * @param {string} version  Foundry version under test
 * @param {object} entry    Manifest entry {id, path, description, expected}
 * @returns {void}
 */
const record = (version, entry) => {
  const file = join(REPORT_DIR, 'manifest.json');
  const manifest = existsSync(file)
    ? JSON.parse(readFileSync(file, 'utf-8'))
    : { fix: FIX, entries: [] };
  manifest.fix = FIX;
  manifest.entries = (manifest.entries ?? []).filter(e => e.foundryVersion !== version);
  manifest.entries.push({ foundryVersion: version, ...entry });
  writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
};

test('@visual @ui #206 composer draft survives popout re-renders', async ({
  simulacrumPage,
  foundryVersion,
}) => {
  const tab = await openSimulacrumSidebar(simulacrumPage);
  const composer = tab.locator('textarea[name="message"]');
  await expect(composer).toBeVisible();

  // Type an unsent draft, then exercise the real popout gesture. Right-
  // clicking the tab re-renders the `input` part in the main tab.
  await composer.fill(DRAFT);
  const shotA = shotPath(foundryVersion, 'A-draft-typed.png');
  await simulacrumPage.screenshot({ path: shotA });
  record(foundryVersion, {
    id: `${foundryVersion}-A`,
    path: shotA,
    description:
      'The Simulacrum sidebar tab is open on the right with a chat log; the ' +
      `composer textarea at the bottom contains the unsent text "${DRAFT}".`,
    expected: `The composer textarea visibly contains the draft "${DRAFT}".`,
  });

  const tabButton = simulacrumPage.locator('#sidebar-tabs [data-tab="simulacrum"]');
  await tabButton.click({ button: 'right' });
  const popout = simulacrumPage.locator('#simulacrum-popout');
  await expect(popout).toBeVisible({ timeout: 20000 });
  await expect(composer).toHaveValue(DRAFT);

  const shotB = shotPath(foundryVersion, 'B-popout-open.png');
  await simulacrumPage.screenshot({ path: shotB });
  record(foundryVersion, {
    id: `${foundryVersion}-B`,
    path: shotB,
    description:
      'A Simulacrum popout window is open over the canvas; behind it, the ' +
      `sidebar tab still shows the draft "${DRAFT}" in its composer.`,
    expected: 'After the popout re-render, the draft remains in the sidebar composer.',
  });

  // Foundry window headers (v13/v14) use data-action, not a .close class.
  await popout.locator('button[data-action="close"]').click();
  await expect(popout).toBeHidden({ timeout: 20000 });
  await expect(composer).toHaveValue(DRAFT);

  const shotC = shotPath(foundryVersion, 'C-popout-closed.png');
  await simulacrumPage.screenshot({ path: shotC });
  record(foundryVersion, {
    id: `${foundryVersion}-C`,
    path: shotC,
    description:
      'The popout window is closed; the Simulacrum sidebar tab is open and ' +
      `its composer still contains the draft "${DRAFT}".`,
    expected: 'After the popout-close re-render, the draft remains in the composer.',
  });
});
