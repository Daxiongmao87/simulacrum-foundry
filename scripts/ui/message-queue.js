import { createLogger } from '../utils/logger.js';

/**
 * Queues user prompts submitted while the agent is already processing.
 *
 * Contract: messages are kept in FIFO display order, drained strictly
 * one-at-a-time by re-entering the normal send path, and can be discarded
 * individually (or all at once) before they run. Draining is guarded so a
 * natural completion and a Stop never start two concurrent drains.
 */
/**
 * Queue id without hard Foundry/Node coupling.
 * Prefers Foundry randomID, then WebCrypto, then a Math.random fallback so
 * node:test (Node 18, no global crypto) and browsers both work.
 */
function _newQueueId() {
  try {
    const fn = globalThis?.foundry?.utils?.randomID;
    if (typeof fn === 'function') return fn();
  } catch {
    /* ignore and fall through */
  }
  try {
    const fn = globalThis?.crypto?.randomUUID;
    if (typeof fn === 'function') return fn.call(globalThis.crypto);
  } catch {
    /* ignore and fall through */
  }
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class MessageQueueManager {
  /**
   * @param {object} [options]
   * @param {function} [options.renderTemplate] - async (path, ctx) => html string
   * @param {function} [options.appendTo] - (html) => void, appends rendered queue DOM
   * @param {function} [options.templatePath] - Handlebars path of the queue partial
   */
  constructor(options = {}) {
    this.logger = createLogger('MessageQueue');
    this.queue = [];
    this.isProcessing = false;
    this.isDraining = false;
    this.app = null;
    this.sendFn = null;
    this.renderTemplate = options.renderTemplate ?? null;
    this.appendTo = options.appendTo ?? null;
    this.templatePath =
      options.templatePath ?? 'modules/simulacrum/templates/simulacrum/message-queue.hbs';
  }

  /**
   * Attach to a sidebar application.
   * @param {object} app - object exposing isProcessing() and setProcessing(v)
   * @param {function} sendFn - async (app, event, target) => void, the send path
   */
  attach(app, sendFn) {
    this.app = app;
    this.sendFn = sendFn;
    this.isProcessing = typeof app?.isProcessing === 'function' && app.isProcessing();
  }

  /**
   * Keep the manager's busy flag in step with the application.
   * @param {boolean} busy
   */
  setBusy(busy) {
    this.isProcessing = !!busy;
  }

  /**
   * Add a message to the queue.
   * @param {string} content
   * @param {function} [onEnqueue] - called with the stored entry after queueing
   * @returns {{id: string, position: number}|null} null for blank input
   */
  enqueue(content, onEnqueue) {
    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) return null;
    const entry = { id: _newQueueId(), content: text, timestamp: Date.now() };
    this.queue.push(entry);
    if (typeof onEnqueue === 'function') onEnqueue(entry);
    this.logger.info(`Queued message (${this.queue.length} pending): ${text.slice(0, 60)}`);
    this.renderQueue();
    return { id: entry.id, position: this.queue.length };
  }

  /**
   * Drop one queued message by id (no-op for unknown ids).
   * @param {string} id
   */
  removeMessage(id) {
    this.queue = this.queue.filter(entry => entry.id !== id);
    this.renderQueue();
  }

  /**
   * Drop every queued message.
   */
  clearAll() {
    this.queue = [];
    this.renderQueue();
  }

  /** @returns {string[]} queued contents in FIFO order */
  peek() {
    return this.queue.map(entry => entry.content);
  }

  /**
   * Process queued messages sequentially through the real send path.
   * Guarded: concurrent calls and calls while already draining are ignored.
   * A Stop does not auto-drain; queued prompts survive cancellation and can
   * be sent manually via their per-message action.
   */
  /**
   * @param {object} [app] - application whose send path should run each queued
   *   prompt (defaults to the attached app)
   */
  async drain(app = this.app) {
    if (this.isDraining || this.queue.length === 0) return;
    this.isDraining = true;
    try {
      while (this.queue.length > 0) {
        const entry = this.queue[0];
        this.queue.shift();
        this.renderQueue();
        if (!app || typeof this.sendFn !== 'function') break;
        try {
          await this.sendFn(
            app,
            { preventDefault() {} },
            {
              message: entry.content,
              simulacrumQueued: true,
            }
          );
        } catch (error) {
          this.logger.error('Failed to send queued message', error);
        }
        // If the send path re-enqueued the same message (app still busy), stop
        // instead of looping forever.
        if (this.queue[0]?.id === entry.id) break;
      }
    } finally {
      this.isDraining = false;
      this.renderQueue();
    }
  }

  /**
   * Render the queued-message block into the sidebar log (no-op while empty
   * or when no render target is available).
   */
  async renderQueue() {
    if (this.queue.length === 0 || typeof this.renderTemplate !== 'function') return;
    try {
      const messages = this.queue.map((entry, index) => ({
        ...entry,
        position: index + 1,
      }));
      const html = await this.renderTemplate(this.templatePath, {
        messages,
        isProcessing: this.isProcessing,
      });
      if (typeof this.appendTo === 'function') this.appendTo(html);
    } catch (error) {
      this.logger.warn('Failed to render message queue', error);
    }
  }
}
