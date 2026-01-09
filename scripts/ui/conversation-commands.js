/**
 * Conversation Commands - Handle conversation management commands
 * Adapted from qwen-code conversation command patterns
 */

/**
 * @class ConversationCommands
 * @description Handles conversation management commands like /clear, /compress, /stats
 */
class ConversationCommands {
  /**
   * Available conversation commands
   */
  static get COMMANDS() {
    return {
      clear: 'Clear conversation history',
      compress: 'Compress conversation history to save tokens',
      stats: 'Show conversation statistics',
    };
  }

  /**
   * Parse a message to check if it's a conversation command
   * @param {string} message - The message to parse
   * @returns {Object|null} Parsed command or null
   */
  static parseCommand(message) {
    if (!message.startsWith('/')) {
      return null;
    }

    const parts = message.slice(1).trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    if (!Object.prototype.hasOwnProperty.call(this.COMMANDS, command)) {
      return null;
    }

    return { command, args };
  }

  /**
   * Execute a conversation command
   * @param {string} command - Command name
   * @param {Array} args - Command arguments
   * @param {ConversationManager} conversationManager - Conversation manager instance
   * @returns {Promise<Object>} Command result
   */
  static async executeCommand(command, args, conversationManager) {
    try {
      switch (command) {
        case 'clear':
          return this._executeClear(conversationManager);

        case 'compress':
          return this._executeCompress(conversationManager);

        case 'stats':
          return this._executeStats(conversationManager);

        default:
          return {
            success: false,
            message: `Unknown command: ${command}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        message: `Error executing command: ${error.message}`,
      };
    }
  }

  /**
   * Execute clear command
   * @param {ConversationManager} conversationManager
   * @returns {Object} Command result
   * @private
   */
  static _executeClear(conversationManager) {
    conversationManager.clear();

    // Clear UI if available
    if (typeof window !== 'undefined' && window.ui?.simulacrum?.clearMessages) {
      window.ui.simulacrum.clearMessages();
    }

    return {
      success: true,
      message: '✅ Conversation history cleared.',
    };
  }

  /**
   * Execute compress command
   * @param {ConversationManager} conversationManager
   * @returns {Object} Command result
   * @private
   */
  static _executeCompress(conversationManager) {
    const beforeTokens = conversationManager.getSessionTokens();
    const beforeMessages = conversationManager.messages.length;

    conversationManager.compressHistory();

    const afterTokens = conversationManager.getSessionTokens();
    const afterMessages = conversationManager.messages.length;

    const tokensSaved = beforeTokens - afterTokens;
    const messagesSaved = beforeMessages - afterMessages;

    return {
      success: true,
      message: `✅ Conversation compressed. Saved ${tokensSaved} tokens and ${messagesSaved} messages.`,
    };
  }

  /**
   * Execute stats command
   * @param {ConversationManager} conversationManager
   * @returns {Object} Command result
   * @private
   */
  static _executeStats(conversationManager) {
    const currentTokens = conversationManager.getSessionTokens();
    const maxTokens = conversationManager.maxTokens;
    const messageCount = conversationManager.messages.length;
    const tokenUsage = ((currentTokens / maxTokens) * 100).toFixed(1);

    let message = '📊 **Conversation Statistics**\n';
    message += `• **Messages**: ${messageCount}\n`;
    message += `• **Tokens**: ${currentTokens} / ${maxTokens} (${tokenUsage}%)\n`;
    message += `• **User**: ${conversationManager.userId}\n`;
    message += `• **World**: ${conversationManager.worldId}`;

    if (currentTokens > maxTokens * 0.8) {
      message += '\n⚠️ Warning: Token usage is high. Consider using `/compress`.';
    }

    return {
      success: true,
      message,
    };
  }

  /**
   * Handle a conversation command from the UI
   * @param {string} message - The message that might be a command
   * @param {ConversationManager} conversationManager - Conversation manager
   * @returns {Promise<Object>} Processing result
   */
  static async handleConversationCommand(message, conversationManager) {
    const parsed = this.parseCommand(message);

    if (!parsed) {
      return { success: false, isCommand: false };
    }

    const result = await this.executeCommand(parsed.command, parsed.args, conversationManager);

    return {
      success: result.success,
      isCommand: true,
      message: result.message,
    };
  }

  /**
   * Get help text for conversation commands
   * @returns {string} Help text
   */
  static getHelpText() {
    let help = '💬 **Conversation Commands**\n';

    Object.entries(this.COMMANDS).forEach(([cmd, desc]) => {
      help += `• **/${cmd}** - ${desc}\n`;
    });

    return help;
  }
}

export { ConversationCommands };
