/**
 * Event Handlers for Simulacrum Sidebar Tab
 * decoupling logic from the main application class
 */

import { ConversationCommands } from './conversation-commands.js';
import { createLogger } from '../utils/logger.js';
import { processMessageForDisplay } from './sidebar-state-syncer.js';

export class SidebarEventHandlers {
  static async handleSendMessage(app, event, target) {
    const form = target.closest('form');
    const input = form.querySelector('textarea[name="message"]');
    const message = input.value.trim();

    if (!message) return;

    // Check if agent is processing
    if (app.isProcessing()) {
      return;
    }

    // Clear input immediately
    input.value = '';

    // Set thinking state immediately and trigger render
    app.setThinking(true);

    try {
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
        if (response.content) {
          // Apply markdown rendering and enrichment before display
          const processedDisplay = await processMessageForDisplay(
            response.display || response.content
          );
          await app.addMessage('assistant', response.content, processedDisplay, response.noGroup);
        }
      };

      // Get abort signal from the app
      const signal = app.startProcess();

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
    } catch (error) {
      createLogger('SidebarEventHandlers').error('Error processing message', error);
      ui.notifications?.error(`Simulacrum: ${error.message}`, { permanent: false });
    } finally {
      app.setThinking(false);
    }
  }

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
    app.clearMessages();
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
