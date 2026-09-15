import { MessageQueueManager } from './message-queue.js';
import { SidebarEventHandlers } from './sidebar-event-handlers.js';
import { SimulacrumHooks } from '../core/hook-manager.js';

/**
 * Message-queue wiring for the sidebar tab (#174): owns the MessageQueueManager
 * instance, renders the queued block into the chat log, and exposes the
 * pending queue for template context. Extracted from simulacrum-sidebar-tab.js
 * to keep that file within the 1000-line cap.
 */
export class SidebarMessageQueue {
  /** @param {object} app - the SimulacrumSidebarTab instance */
  constructor(app) {
    this.app = app;
    this.messageQueue = new MessageQueueManager({
      renderTemplate: (path, ctx) => foundry.applications.handlebars.renderTemplate(path, ctx),
      appendTo: html => this._appendMessageQueueToLog(html),
    });
    this.messageQueue.attach(app, SidebarEventHandlers.handleSendMessage);
    // Called by the send path after a prompt is queued so the input area
    // reflects the busy state without touching the process lifecycle.
    app.setBusyFlag = busy => {
      this.messageQueue.setBusy(busy);
      if (app.rendered) app.render({ parts: ['log', 'input'] });
    };
    // A cleared conversation also drops any queued prompts: their context is gone.
    Hooks.on(SimulacrumHooks.CONVERSATION_CLEARED, () => {
      this.messageQueue.clearAll();
    });
  }

  /** Pin the rendered queue block just above the process-status line. */
  _appendMessageQueueToLog(html) {
    const chatLog = this.app.element?.querySelector('.chat-log');
    if (!chatLog) return;
    chatLog.querySelector('[data-simulacrum-queue]')?.remove();
    const div = document.createElement('div');
    div.innerHTML = html;
    const queueEl = div.firstElementChild;
    const processStatus = chatLog.querySelector(':scope > .process-status-message');
    if (processStatus) {
      chatLog.insertBefore(queueEl, processStatus);
    } else {
      chatLog.appendChild(queueEl);
    }
  }

  /** @returns {Array<{position: number, content: string}>} queued prompts in order */
  getPendingQueue() {
    return this.messageQueue.peek().map((content, index) => ({ position: index + 1, content }));
  }

  /** Handle discard / discard-all clicks on the rendered queue block. */
  handleQueueActionClick(event) {
    const actionEl = event.target.closest?.('[data-queue-action]');
    if (!actionEl) return;
    if (actionEl.dataset.queueAction === 'discard' && actionEl.dataset.queueId) {
      this.messageQueue.removeMessage(actionEl.dataset.queueId);
    } else if (actionEl.dataset.queueAction === 'discardAll') {
      this.messageQueue.clearAll();
    }
  }
}
