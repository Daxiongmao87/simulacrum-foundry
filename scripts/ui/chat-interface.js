import { SimulacrumError } from '../utils/errors.js';
import { ConversationCommands } from './conversation-commands.js';
import { createLogger } from '../utils/logger.js';
import { processMessageForDisplay } from './sidebar-state-syncer.js';
// Assuming SimulacrumCore will be the main entry point for AI processing
// and will be defined later in simulacrum.js or a dedicated core file.
// For now, we'll mock its existence or assume it's globally available in FoundryVTT context.
const SimulacrumCore = window.SimulacrumCore || {
  processMessage: async message => ({
    display: `AI Core not initialized. Message: "${message}"`,
    content: `AI Core not initialized. Message: "${message}"`,
  }),
};

/**
 * @class ChatInterface
 * @description Manages the integration of the AI assistant with FoundryVTT's chat interface.
 *              Registers chat commands and displays AI responses.
 */
class ChatInterface {
  /**
   * Initializes the chat interface by registering commands and hooks.
   */
  static init() {
    const logger = createLogger('ChatInterface');
    logger.info('Initializing Chat Interface...');
    // Register chat commands like /sim or /simulacrum
    Hooks.on('chatCommandsReady', ChatInterface._registerChatCommands);
    // Hook into chat message rendering to display AI responses
    Hooks.on('renderChatMessage', ChatInterface._onRenderChatMessage);
  }

  /**
   * Registers chat commands for the AI assistant.
   * @param {ChatCommands} chatCommands - The ChatCommands API instance.
   * @private
   */
  static _registerChatCommands(chatCommands) {
    const logger = createLogger('ChatInterface');
    chatCommands.register({
      name: 'sim',
      alias: 'simulacrum',
      hint: 'Interact with the Simulacrum AI Assistant.',
      gmOnly: false,
      handler: (chatlog, messageText) => ChatInterface.processChatCommand(messageText, game.user),
      description: 'Send a message to the Simulacrum AI Assistant.',
    });
    logger.info('Chat commands registered.');
  }

  /**
   * Processes a chat command sent to the AI assistant.
   * @param {string} messageText - The text of the chat message.
   * @param {User} user - The FoundryVTT User who sent the message.
   * @returns {Promise<void>}
   */
  static async processChatCommand(messageText, user) {
    try {
      // Check if it's a conversation command first
      if (typeof SimulacrumCore !== 'undefined' && SimulacrumCore.conversationManager) {
        const commandResult = await ConversationCommands.handleConversationCommand(
          messageText,
          SimulacrumCore.conversationManager
        );

        if (commandResult.isCommand) {
          // Display command result directly in chat
          ChatMessage.create({
            user: user._id,
            content: commandResult.message,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            speaker: { alias: 'Simulacrum AI' },
            flags: { simulacrum: { commandResponse: true, success: commandResult.success } },
          });
          return;
        }
      }

      // Display user's message in chat immediately
      ChatMessage.create({
        user: user._id,
        content: `**To Simulacrum:** ${messageText}`,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER,
        speaker: ChatMessage.getSpeaker({ user: user }),
        flags: { simulacrum: { userMessage: true } },
      });

      // Process the message with the AI core
      const response = await SimulacrumCore.processMessage(messageText, user);
      await ChatInterface.displayResponse(response, user);
    } catch (error) {
      const logger = createLogger('ChatInterface');
      logger.error('Error processing chat command:', error);
      ChatInterface.displayErrorResponse(error, user);
    }
  }

  /**
   * Displays the AI's response in the chat.
   * @param {object} response - The AI's response object (must contain a 'display' property).
   * @param {User} user - The FoundryVTT User to attribute the message to.
   */
  static async displayResponse(response, user) {
    // Process markdown and enrichment before display
    const processedDisplay = await processMessageForDisplay(response.display);

    ChatMessage.create({
      user: user._id,
      content: processedDisplay,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      speaker: { alias: 'Simulacrum AI' }, // AI's speaker
      flags: { simulacrum: { aiGenerated: true } },
    });
  }

  /**
   * Displays an error message from the AI assistant in the chat.
   * @param {Error} error - The error object.
   * @param {User} user - The FoundryVTT User to attribute the message to.
   */
  static displayErrorResponse(error, user) {
    const errorMessage =
      error instanceof SimulacrumError
        ? `Simulacrum Error (${error.type}): ${error.message}`
        : `An unexpected error occurred: ${error.message}`;

    ChatMessage.create({
      user: user._id,
      content: `**Simulacrum Error:** ${errorMessage}`,
      type: CONST.CHAT_MESSAGE_TYPES.OOC,
      speaker: { alias: 'Simulacrum AI' },
      flags: { simulacrum: { aiError: true } },
    });
  }

  /**
   * Hook function for rendering chat messages. Can be used for custom styling or interactions.
   * @param {ChatMessage} message - The chat message being rendered.
   * @param {JQuery} html - The jQuery object for the chat message HTML.
   * @param {object} data - Additional rendering data.
   * @private
   */
  static _onRenderChatMessage(message, html) {
    // Example: Add a specific class for AI-generated messages for styling
    if (message.flags?.simulacrum?.aiGenerated) {
      html.addClass('simulacrum-ai-message');
    }
    if (message.flags?.simulacrum?.userMessage) {
      html.addClass('simulacrum-user-message');
    }
    if (message.flags?.simulacrum?.aiError) {
      html.addClass('simulacrum-ai-error-message');
    }
  }
}

export { ChatInterface };
