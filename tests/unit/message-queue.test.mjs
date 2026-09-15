import assert from 'node:assert/strict';
import test from 'node:test';

import { MessageQueueManager } from '../../scripts/ui/message-queue.js';

/**
 * Fake sidebar app: tracks busy state and records every send attempt in
 * order so tests can prove FIFO, sequential, and guard behavior.
 */
function makeApp({ busy = false } = {}) {
  const app = {
    busy: !!busy,
    sent: [],
    inFlight: 0,
    maxInFlight: 0,
    isProcessing: () => app.busy,
    setProcessing(active) {
      app.busy = !!active;
    },
  };
  const send = async (_app, _event, target) => {
    app.inFlight += 1;
    app.maxInFlight = Math.max(app.maxInFlight, app.inFlight);
    // Simulate work so a concurrent drain could interleave if unguarded.
    await new Promise(resolve => setTimeout(resolve, 5));
    app.sent.push(target.message);
    app.inFlight -= 1;
  };
  return { app, send };
}

test('queued messages keep submission (display) order', () => {
  const manager = new MessageQueueManager();
  manager.enqueue('first');
  manager.enqueue('second');
  manager.enqueue('third');

  assert.deepEqual(manager.peek(), ['first', 'second', 'third']);
});

test('enqueue trims input and ignores blank messages', () => {
  const manager = new MessageQueueManager();

  assert.equal(manager.enqueue('   '), null);
  assert.equal(manager.enqueue(''), null);
  const result = manager.enqueue('  hello  ');

  assert.equal(result.position, 1);
  assert.deepEqual(manager.peek(), ['hello']);
});

test('drain processes the queue sequentially in FIFO order', async () => {
  const { app, send } = makeApp({ busy: true });
  const manager = new MessageQueueManager();
  manager.attach(app, send);
  manager.enqueue('a');
  manager.enqueue('b');
  manager.enqueue('c');

  await manager.drain();

  assert.deepEqual(app.sent, ['a', 'b', 'c']);
  assert.equal(manager.queue.length, 0);
});

test('drain never runs two sends at once (sequential guarantee)', async () => {
  const { app, send } = makeApp();
  const manager = new MessageQueueManager();
  manager.attach(app, send);
  manager.enqueue('a');
  manager.enqueue('b');
  manager.enqueue('c');
  manager.enqueue('d');

  await manager.drain();

  assert.equal(app.maxInFlight, 1);
  assert.deepEqual(app.sent, ['a', 'b', 'c', 'd']);
});

test('concurrent drain calls are guarded: only one drain loop runs', async () => {
  const { app, send } = makeApp();
  const manager = new MessageQueueManager();
  manager.attach(app, send);
  manager.enqueue('a');
  manager.enqueue('b');

  await Promise.all([manager.drain(), manager.drain(), manager.drain()]);

  assert.deepEqual(app.sent, ['a', 'b']);
  assert.equal(manager.queue.length, 0);
});

test('drain with an empty queue is a no-op', async () => {
  const { app, send } = makeApp();
  const manager = new MessageQueueManager();
  manager.attach(app, send);

  await manager.drain();

  assert.deepEqual(app.sent, []);
});

test('removeMessage drops only the targeted entry and keeps order', () => {
  const manager = new MessageQueueManager();
  const a = manager.enqueue('a');
  manager.enqueue('b');
  const c = manager.enqueue('c');

  manager.removeMessage(a.id);
  assert.deepEqual(manager.peek(), ['b', 'c']);

  manager.removeMessage('missing-id');
  assert.deepEqual(manager.peek(), ['b', 'c']);

  manager.removeMessage(c.id);
  assert.deepEqual(manager.peek(), ['b']);
});

test('clearAll empties the queue', () => {
  const manager = new MessageQueueManager();
  manager.enqueue('a');
  manager.enqueue('b');

  manager.clearAll();

  assert.deepEqual(manager.peek(), []);
  assert.equal(manager.queue.length, 0);
});

test('a failed send is recorded, does not break the remaining drain', async () => {
  const app = {
    isProcessing: () => true,
    sent: [],
  };
  const calls = [];
  const manager = new MessageQueueManager();
  manager.attach(app, async (_a, _e, target) => {
    calls.push(target.message);
    if (target.message === 'b') throw new Error('boom');
  });
  manager.enqueue('a');
  manager.enqueue('b');
  manager.enqueue('c');

  await manager.drain();

  assert.deepEqual(calls, ['a', 'b', 'c']);
  assert.equal(manager.queue.length, 0);
});

test('drain passes the queued content through target.message', async () => {
  const { app, send } = makeApp();
  const seen = [];
  const manager = new MessageQueueManager();
  manager.attach(app, (a, _e, target) => {
    seen.push(target.message);
    return send(a, _e, target);
  });
  manager.enqueue('queued prompt');

  await manager.drain();

  assert.deepEqual(seen, ['queued prompt']);
});
