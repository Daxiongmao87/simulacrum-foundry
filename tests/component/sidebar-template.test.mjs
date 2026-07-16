import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '../..');

test('sidebar template exposes the required chat log and labelled input controls', async () => {
  const template = (
    await Promise.all(
      ['sidebar.hbs', 'sidebar-log.hbs', 'sidebar-input.hbs'].map(name =>
        readFile(resolve(ROOT, 'templates/simulacrum', name), 'utf8')
      )
    )
  ).join('\n');

  assert.match(template, /class=["'][^"']*chat-scroll/u);
  assert.match(template, /class=["'][^"']*chat-log/u);
  assert.match(template, /class=["'][^"']*chat-form/u);
  assert.match(template, /textarea[^>]+name=["']message["']/u);
  assert.match(template, /(?:aria-label|placeholder)=/u);
});

test('sidebar templates keep interactive controls explicitly named and avoid duplicate chat input ids', async () => {
  const [inputTemplate, notificationsTemplate, taskTrackerTemplate] = await Promise.all([
    readFile(resolve(ROOT, 'templates/simulacrum/sidebar-input.hbs'), 'utf8'),
    readFile(resolve(ROOT, 'templates/simulacrum/sidebar-notifications.hbs'), 'utf8'),
    readFile(resolve(ROOT, 'templates/simulacrum/sidebar-task-tracker.hbs'), 'utf8'),
  ]);

  assert.match(
    inputTemplate,
    /class="model-selector-input"[\s\S]*aria-label=/u,
    'model selector input must keep an explicit accessible name'
  );
  assert.match(
    inputTemplate,
    /class="context-limit-input"[\s\S]*aria-label=/u,
    'context limit input must keep an explicit accessible name'
  );
  assert.match(
    taskTrackerTemplate,
    /class="task-tracker-toggle"[\s\S]*aria-label=/u,
    'task tracker toggle must keep an explicit accessible name'
  );
  assert.match(inputTemplate, /id="simulacrum-chat-message"/u);
  assert.doesNotMatch(notificationsTemplate, /id="simulacrum-chat-message"/u);
});
