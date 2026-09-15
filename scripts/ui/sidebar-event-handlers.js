/**
 * Event Handlers for Simulacrum Sidebar Tab
 * decoupling logic from the main application class
 */

import { ConversationCommands } from './conversation-commands.js';
import { createLogger } from '../utils/logger.js';
import { processMessageForDisplay } from './sidebar-state-syncer.js';

export class SidebarEventHandlers {
  /**
   * Resolve the prompt for a send: queued replays carry it in target.message,
   * direct sends carry it in the textarea.
   * @param {object} target
   * @param {HTMLTextAreaElement|null} input
   * @returns {string} trimmed message (may be empty)
   */
  static _resolveMessage(target, input) {
    const fromTarget =
      (typeof target?.message === 'string' ? target.message : '').trim() ||
      (typeof target?.value === 'string' ? target.value : '').trim();
    return fromTarget || (input?.value ?? '').trim();
  }

  /**
   * Park a prompt in the visible queue while the agent is busy (#174).
   * @returns {boolean} true when the prompt was queued
   */
  static _queueWhileBusy(app, input, message) {
    const queue = app.messageQueue;
    if (!queue) return false;
    queue.attach(app, SidebarEventHandlers.handleSendMessage);
    const enqueued = queue.enqueue(message, () => {
      if (app.markAtBottom) app.markAtBottom(true);
    });
    if (enqueued) {
      if (input) input.value = '';
      if (app.setBusyFlag) app.setBusyFlag(true);
    }
    return !!enqueued;
  }

  /* eslint-disable-next-line max-lines-per-function */
  static async handleSendMessage(app, event, target) {
    const form = target.closest?.('form');
    const input = form?.querySelector('textarea[name="message"]') ?? null;
    const message = SidebarEventHandlers._resolveMessage(target, input);

    if (!message) return;

    // While the agent is busy, keep the prompt in the visible queue (FIFO)
    // instead of dropping it. The queue drains sequentially after the active
    // response completes.
    if (app.isProcessing()) {
      SidebarEventHandlers._queueWhileBusy(app, input, message);
      return;
    }

    // Clear input immediately
    if (input) input.value = '';

    // Record process ownership for this request
    const signal = app.startProcess();

    // Set processing state immediately and trigger render
    app.setProcessing(true);

    try {
      await SidebarEventHandlers._processMessageThroughHandler(app, message, signal);
    } catch (error) {
      if (signal.aborted) return;
      createLogger('SidebarEventHandlers').error('Error processing message', error);
      ui.notifications?.error(`Simulacrum: ${error.message}`, { permanent: false });
    } finally {
      app.finishProcess(signal);
      // A Stop aborts the signal: queued prompts survive it and wait for a
      // manual send. Natural completion (success or error) starts the next
      // queued prompt so the queue drains one at a time.
      if (app.messageQueue && !signal.aborted) {
        app.messageQueue.setBusy(app.isProcessing());
        await app.messageQueue.drain(app);
      }
    }
  }

  /**
   * Run one prompt through the chat handler (commands, display, AI call).
   * @param {object} app
   * @param {string} message
   * @param {AbortSignal} signal
   */
  /* eslint-disable max-lines-per-function */
  static async _processMessageThroughHandler(app, message, signal) {
    await app.ensureChatHandler();

    if (!app.chatHandler) {
      throw new Error('ChatHandler not available');
    }

    // Handle conversation commands
    if (app.chatHandler.conversationManager) {
      const commandResult = await ConversationCommands.handleConversationCommand(
        message,
        app.chatHandler.conversationManager
      );

      if (commandResult.isCommand) {
        if (!app.isCurrentProcess(signal)) return;
        await app.addMessage('assistant', commandResult.message, commandResult.message);
        return;
      }
    }

    // Add user message to chat log
    await app.addMessage('user', message);

    // Define callbacks for ChatHandler
    /* eslint-disable no-unused-vars */
    const onUserMessage = ({ _content }) => {
      /* User message already added */
    };
    /* eslint-enable no-unused-vars */

    const onAssistantMessage = async response => {
      const isErrorResponse = !!response?.error;
      if (!isErrorResponse && !app.isCurrentProcess(signal)) return;
      // Apply markdown rendering and enrichment before display
      // processMessageForDisplay handles null/undefined content by defaulting to '&nbsp;'
      const processedDisplay = await processMessageForDisplay(response.display || response.content);
      if (!isErrorResponse && !app.isCurrentProcess(signal)) return;
      await app.addMessage('assistant', response.content, processedDisplay, response.noGroup);
    };

    // Process message through ChatHandler
    await app.chatHandler.processUserMessage(message, game.user, {
      onUserMessage,
      onAssistantMessage,
      onError: ({ originalMessage }) => {
        app.rollbackUserMessage();
        const appForm = app.element?.querySelector('form');
        const textarea = appForm?.querySelector('textarea[name="message"]');
        if (textarea) textarea.value = originalMessage;
      },
      signal,
    });
  }
  /* eslint-enable max-lines-per-function */

  static async handleClearChat(app) {
    try {
      if (app.chatHandler) {
        await app.chatHandler.clearConversation();
      } else {
        const { SimulacrumCore } = await import('../core/simulacrum-core.js');
        await SimulacrumCore.clearConversation?.();
      }
    } catch (_e) {
      /* ignore */
    }
    await app.clearMessages();
    await app.addMessage('assistant', game.i18n.localize('SIMULACRUM.WelcomeMessage'));
  }

  static async handleJumpToBottom(app) {
    const log = app.element?.querySelector('.chat-scroll');
    if (log) {
      log.scrollTop = log.scrollHeight;
      app.markAtBottom(true);
    }
  }

  static async handleCancelProcess(app, _event, _target) {
    if (app.chatHandler) {
      // Placeholder for controller logic
    }
    const success = await app.cancelCurrentProcesses();
    if (success) {
      ui.notifications.info('AI processing cancelled.');
    }
  }
}
