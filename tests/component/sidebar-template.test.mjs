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
