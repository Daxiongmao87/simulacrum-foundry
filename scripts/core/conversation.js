// import { SimulacrumError } from '../utils/errors.js'; // Unused

/**
 * @class ConversationManager
 * @description Manages the conversation history, token counting, and compression for AI interactions.
 *              Mirrors qwen-code's conversation patterns, adapted for FoundryVTT context.
 */
import { defaultTokenizer } from '../utils/tokenizer.js';

class ConversationManager {
  /**
   * @param {string} userId - The ID of the FoundryVTT user initiating the conversation.
   * @param {string} worldId - The ID of the FoundryVTT world the conversation is taking place in.
   * @param {number} [maxTokens=32000] - The maximum token limit for the conversation history.
   */
  constructor(userId, worldId, maxTokens = 32000, tokenizer = null) {
    this.userId = userId;
    this.worldId = worldId;
    this.messages = [];
    this.sessionTokens = 0;
    this.maxTokens = maxTokens;
    this.tokenizer = tokenizer || defaultTokenizer; // Pluggable adapter
  }

  /**
   * Adds a message to the conversation history and updates token count.
   * @param {string} role - The role of the message sender ('user', 'assistant', 'tool').
   * @param {string} content - The content of the message.
   * @param {Array<object>} [toolCalls=null] - Optional: Tool calls made by the assistant.
   * @param {string} [toolCallId=null] - Optional: The ID of the tool call this message is a response to.
   */
  addMessage(role, content, toolCalls = null, toolCallId = null) {
    const message = { role, content };
    if (toolCalls) {
      message.tool_calls = toolCalls;
    }
    if (toolCallId) {
      message.tool_call_id = toolCallId;
    }
    this.messages.push(message);
    this.sessionTokens += this._estimateTokens(message);
  }

  /**
   * Compresses the conversation history if it exceeds the maximum token limit.
   * This is a simplified version for MVP, a real implementation would use a more sophisticated algorithm.
   */
  compressHistory() {
    // For MVP, a simple truncation strategy. A more advanced approach would summarize old messages.
    while (this.sessionTokens > this.maxTokens && this.messages.length > 1) {
      const removedMessage = this.messages.shift(); // Remove oldest message (after system message)
      this.sessionTokens -= this._estimateTokens(removedMessage);
    }
    if (this.sessionTokens > this.maxTokens) {
      // If even after removing all but the last message, it's still too long, clear all but system message
      const systemMessage = this.messages.shift();
      this.messages = [systemMessage];
      this.sessionTokens = this._estimateTokens(systemMessage);
    }
  }

  /**
   * Clears the entire conversation history.
   */
  clear() {
    this.messages = [];
    this.sessionTokens = 0;
  }

  /**
   * Returns the current conversation history.
   * @returns {Array<object>} The array of messages.
   */
  getMessages() {
    return this.messages;
  }

  /**
   * Returns the current token count for the session.
   * @returns {number}
   */
  getSessionTokens() {
    return this.sessionTokens;
  }

  /**
   * Placeholder for a token estimation function. In a real scenario, this would use a library
   * like `tiktoken` or a similar model-specific token counter.
   * @param {object} message - The message to estimate tokens for.
   * @returns {number} The estimated number of tokens.
   * @private
   */
  _estimateTokens(message) {
    try {
      return this.tokenizer.estimateMessageTokens(message);
    } catch (_e) {
      const content = String(message?.content || '');
      const tools = message?.tool_calls ? JSON.stringify(message.tool_calls) : '';
      const words = (content.trim().match(/\S+/g) || []).length;
      const toolWords = (tools.trim().match(/\S+/g) || []).length;
      return words + toolWords;
    }
  }
  /**
   * Back-compat shim for tests: return an estimator object.
   * @returns {{estimate: function(string): number}}
   */
  _getTokenEstimator() {
    const adapter = this.tokenizer;
    return {
      estimate: (text) => {
        try {
          return adapter.estimateMessageTokens({ role: 'system', content: String(text || '') });
        } catch (_e) {
          const str = String(text || '').trim();
          return str ? (str.match(/\S+/g) || []).length : 0
        }
      }
    };
  }

}


export { ConversationManager };
