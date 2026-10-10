// End-to-end visual verification for SPEC 1.2 / issue #178.
//
// #178: a loop that terminates abnormally (circuit breaker, repeat limit, tool
// failure, or cancellation) must clear the active manage_task so the sidebar
// task tracker is never left stranded. This spec routes a real Foundry
// instance's assistant request at a scripted sequence: a manage_task start_task
// tool call (the tracker appears), then repeated identical text-only completions
// that trip the loop's circuit breaker. After the fix the tracker is cleared on
// that abnormal termination, exactly as it already was on a clean end_loop.

import { test, expect } from '../../fixtures/test-base.mjs';
import { openSimulacrumSidebar } from '../../fixtures/foundry-helpers.mjs';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = join(__dirname, '..', '..', 'reports', 'task-orphan');

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

const MODEL_ID = 'test-task-model';

/**
 * Build an OpenAI-compatible completion whose assistant message is a manage_task
 * start_task tool call. Running it fires TASK_STARTED, which shows the sidebar
 * task tracker.
 * @returns {object} OpenAI chat-completion payload
 */
function startTaskCompletion() {
  return {
    id: 'chatcmpl-178',
    object: 'chat.completion',
    model: MODEL_ID,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_task',
              type: 'function',
              function: {
                name: 'manage_task',
                arguments: JSON.stringify({
                  action: 'start_task',
                  taskName: 'Verify task clearing',
                  taskGoal: 'Ensure the tracker clears on abnormal termination',
                  steps: [
                    { title: 'Investigate', description: 'Locate the defect' },
                    { title: 'Summary', description: 'Tracker cleared on abnormal termination' },
                  ],
                }),
              },
            },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

/**
 * Build an OpenAI-compatible completion with identical text-only content. Three
 * of these in a row trip the loop's circuit breaker (an abnormal termination).
 * @returns {object} OpenAI chat-completion payload
 */
function stopCompletion() {
  return {
    id: 'chatcmpl-178',
    object: 'chat.completion',
    model: MODEL_ID,
    choices: [{ index: 0, message: { role: 'assistant', content: 'STOP' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

/**
 * Mock the provider + OpenRouter model lists and select a model so the AI client
 * has a model to send. The route mock survives page.reload.
 * @param {import('@playwright/test').Page} page Simulacrum page
 */
async function mockModelsAndSelectModel(page) {
  await page.route('**/models**', route =>
    route.fulfill({
      contentType: 'application/json',
      json: String(route.request().url()).includes('openrouter.ai')
        ? { data: [] }
        : { data: [{ id: MODEL_ID, object: 'model' }] },
    })
  );
  await page.evaluate(async modelId => {
    await globalThis.modelService.reset();
    await globalThis.modelService.fetchModels();
    // @ts-ignore - exposed in the test window
    ui.simulacrum._saveModelSelection(modelId);
  }, MODEL_ID);
  await page.waitForTimeout(300);
}

/**
 * Submit a message through the real sidebar composer (Enter to send).
 * @param {import('@playwright/test').Page} page Simulacrum page
 * @param {string} text Message text
 */
async function submitMessage(page, text) {
  const composer = page.locator('#simulacrum-chat-message');
  await expect(composer).toBeVisible({ timeout: 15000 });
  await composer.click();
  await composer.fill(text);
  await page.keyboard.press('Enter');
}

/**
 * #178: an abnormally terminated loop must clear the sidebar task tracker.
 *
 * The scripted sequence starts a task (tracker appears), then repeats an
 * identical text-only completion until the circuit breaker fires. The fix clears
 * the orphaned task in the loop's finally block, so the tracker is hidden again
 * after the abnormal termination instead of stranded for a later run.
 */
test('@visual @task-orphan #178 task tracker clears on abnormal loop termination', async ({
  simulacrumPage,
  foundryVersion,
}) => {
  const tab = await openSimulacrumSidebar(simulacrumPage);
  await mockModelsAndSelectModel(simulacrumPage);

  // First assistant turn starts a task; every later turn repeats identical
  // text-only content, which trips the circuit breaker (abnormal termination).
  // A small delay per repeat keeps the tracker visibly active long enough to
  // assert the transient "task running" state before the breaker clears it.
  let assistantTurns = 0;
  await simulacrumPage.route('**/chat/completions**', async route => {
    assistantTurns += 1;
    const json = assistantTurns === 1 ? startTaskCompletion() : stopCompletion();
    if (assistantTurns > 1) await new Promise(resolve => setTimeout(resolve, 400));
    await route.fulfill({ contentType: 'application/json', json });
  });

  const tracker = tab.locator('.task-tracker');
  await expect(tracker).toBeHidden();

  await submitMessage(simulacrumPage, 'Start the task and keep going.');

  // start_task fires TASK_STARTED -> the tracker becomes visible and populated.
  await expect(tracker).toBeVisible({ timeout: 20000 });
  await expect(tracker.locator('.task-tracker-title')).toHaveText('Verify task clearing');
  await simulacrumPage.screenshot({ path: shotPath(foundryVersion, '#178-tracker-active.png') });

  // The circuit breaker terminates the loop; the fix fires TASK_FINISHED -> the
  // tracker is cleared (hidden) instead of stranded.
  await expect(tracker).toBeHidden({ timeout: 30000 });
  await simulacrumPage.screenshot({ path: shotPath(foundryVersion, '#178-tracker-cleared.png') });
});
