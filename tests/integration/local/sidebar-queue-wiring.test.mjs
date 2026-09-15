import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import './foundry-globals.mjs';

import { SidebarEventHandlers } from '../../../scripts/ui/sidebar-event-handlers.js';
import { MessageQueueManager } from '../../../scripts/ui/message-queue.js';

const ROOT = resolve(import.meta.dirname, '../../..');

/**
 * Minimal Foundry globals needed by the send path and its error handler.
 */
function installGlobals() {
  globalThis.game = {
    user: { id: 'gm' },
    i18n: { localize: key => key },
  };
  globalThis.ui = { notifications: { error: () => {} } };
}

function makeTextarea(value = '') {
  const textarea = {
    value,
  };
  const form = {
    querySelector(selector) {
      return selector === 'textarea[name="message"]' ? textarea : null;
    },
  };
  textarea.closest = selector => (selector === 'form' ? form : null);
  return textarea;
}

function makeIdleApp() {
  return {
    isProcessing: () => false,
    setProcessing() {},
    startProcess: () => new AbortController().signal,
    isCurrentProcess: () => true,
    finishProcess() {},
    ensureChatHandler: async () => {},
    addMessage: async () => {},
    rollbackUserMessage: () => {},
    chatHandler: {
      conversationManager: null,
      processUserMessage: async () => {},
    },
    messageQueue: null,
  };
}

function makeBusyApp() {
  const app = makeIdleApp();
  app.isProcessing = () => true;
  app.messageQueue = new MessageQueueManager();
  app.setBusyFlag = () => {};
  return app;
}

installGlobals();

test('send while busy enqueues the prompt, clears the input, and does not process', async () => {
  const app = makeBusyApp();
  const calls = [];
  app.chatHandler.processUserMessage = async message => calls.push(message);
  const input = makeTextarea('next question');

  await SidebarEventHandlers.handleSendMessage(app, {}, input);

  assert.deepEqual(app.messageQueue.peek(), ['next question']);
  assert.equal(input.value, '');
  assert.equal(calls.length, 0);
});

test('send while idle processes immediately and does not touch the queue', async () => {
  const app = makeIdleApp();
  const input = makeTextarea('direct question');

  await SidebarEventHandlers.handleSendMessage(app, {}, input);

  assert.equal(input.value, '');
});

test('queued prompts replay through the send path and drain after completion', async () => {
  const app = makeIdleApp();
  const processed = [];
  app.messageQueue = new MessageQueueManager();
  app.setBusyFlag = () => {};
  app.isCurrentProcess = () => true;
  app.chatHandler.processUserMessage = async message => {
    processed.push(message);
  };

  // Two prompts submitted while busy (simulate the busy window).
  const busyApp = makeBusyApp();
  busyApp.messageQueue = app.messageQueue;
  await SidebarEventHandlers.handleSendMessage(busyApp, {}, makeTextarea('q1'));
  await SidebarEventHandlers.handleSendMessage(busyApp, {}, makeTextarea('q2'));
  assert.equal(processed.length, 0);

  // The active response finishes, then the send path drains the queue.
  await SidebarEventHandlers.handleSendMessage(app, {}, makeTextarea('q0'));
  assert.deepEqual(processed, ['q0', 'q1', 'q2']);
  assert.equal(app.messageQueue.queue.length, 0);
});

test('entry point preloads the message queue template', async () => {
  const entry = await readFile(resolve(ROOT, 'scripts/simulacrum.js'), 'utf8');
  assert.match(entry, /modules\/simulacrum\/templates\/simulacrum\/message-queue\.hbs/u);
});

test('log template renders the pending queue in order and wires discard actions', async () => {
  const logTemplate = await readFile(resolve(ROOT, 'templates/simulacrum/sidebar-log.hbs'), 'utf8');
  assert.match(logTemplate, /pendingQueue/u);
  assert.match(logTemplate, /\{\{this\.position\}\}/u);

  const queueTemplate = await readFile(
    resolve(ROOT, 'templates/simulacrum/message-queue.hbs'),
    'utf8'
  );
  assert.match(queueTemplate, /data-queue-action="discard"/u);
  assert.match(queueTemplate, /data-queue-action="discardAll"/u);
  assert.match(queueTemplate, /\{\{this\.position\}\}/u);
});
