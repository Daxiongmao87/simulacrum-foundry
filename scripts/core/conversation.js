/* eslint-disable complexity, max-params, no-console */
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
   * @param {Function} [onStateChange=null] - Callback function to trigger when conversation state changes.
   */
  constructor(userId, worldId, maxTokens = 32000, tokenizer = null, onStateChange = null) {
    this.userId = userId;
    this.worldId = worldId;
    this.messages = [];
    this.sessionTokens = 0;
    this.maxTokens = maxTokens;
    this.tokenizer = tokenizer || defaultTokenizer; // Pluggable adapter
    this.onStateChange = onStateChange; // Auto-save callback
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

    // Trigger auto-save if callback is provided
    this._triggerStateChange();
  }

  /**
   * Updates the system message (first message) with additional content.
   * @param {string} additionalContent - Content to append to the system message.
   */
  updateSystemMessage(additionalContent) {
    if (this.messages.length > 0 && this.messages[0].role === 'system') {
      const oldTokens = this._estimateTokens(this.messages[0]);
      this.messages[0].content += '\n\n' + additionalContent;
      const newTokens = this._estimateTokens(this.messages[0]);
      this.sessionTokens += (newTokens - oldTokens);

      // Trigger auto-save if callback is provided
      this._triggerStateChange();
    }
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

    // Trigger auto-save if callback is provided
    this._triggerStateChange();
  }

  /**
   * Clears the entire conversation history.
   */
  clear() {
    this.messages = [];
    this.sessionTokens = 0;

    // Trigger auto-save if callback is provided
    this._triggerStateChange();
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

  /**
   * Trigger the state change callback for auto-save
   * @private
   */
  _triggerStateChange() {
    if (typeof this.onStateChange === 'function') {
      try {
        this.onStateChange();
      } catch (error) {
        // Silently handle callback failures to avoid breaking conversation flow
        // Error details are logged for debugging if needed
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[ConversationManager] State change callback failed:', error);
        }
      }
    }
  }

  // =========================================================================
  // Persistence Methods (extracted from SimulacrumCore)
  // =========================================================================

  /**
   * Get unique persistence key for this user/world combination
   * @returns {string} Persistence key
   */
  getPersistenceKey() {
    const uid = this.userId || 'unknown-user';
    const wid = this.worldId || 'unknown-world';
    return `conversationState:${uid}:${wid}`;
  }

  /**
   * Save conversation state to user flag or module settings
   * @returns {Promise<boolean>} Whether save was successful
   */
  async save() {
    const key = this.getPersistenceKey();
    const state = {
      messages: this.messages,
      sessionTokens: this.sessionTokens,
      v: 1
    };

    // Prefer user flag when available (per-user scope)
    try {
      if (typeof game !== 'undefined' && game?.user && typeof game.user.setFlag === 'function') {
        await game.user.setFlag('simulacrum', this.worldId, state);
        return true;
      }
    } catch (_e) {
      // fall back below
    }

    // Fallback to module settings
    try {
      if (typeof game !== 'undefined' && game?.settings && typeof game.settings.set === 'function') {
        await game.settings.set('simulacrum', key, state);
        return true;
      }
    } catch (_e) {
      // ignore
    }

    return false;
  }

  /**
   * Load conversation state from user flag or module settings
   * @returns {Promise<boolean>} Whether load was successful
   */
  async load() {
    const key = this.getPersistenceKey();
    let state = null;

    // Prefer user flag storage (per-user scope)
    try {
      if (typeof game !== 'undefined' && game?.user && typeof game.user.getFlag === 'function') {
        state = await game.user.getFlag('simulacrum', this.worldId);
      }
    } catch (_e) {
      // fall back below
    }

    // Fallback to module settings
    if (!state) {
      try {
        if (typeof game !== 'undefined' && game?.settings && typeof game.settings.get === 'function') {
          state = game.settings.get('simulacrum', key);
        }
      } catch (_e) {
        // ignore
      }
    }

    if (!state) return false;

    // Validate and apply
    this.messages = Array.isArray(state.messages) ? state.messages : [];
    this.sessionTokens = Number.isFinite(state.sessionTokens) ? state.sessionTokens : 0;
    return true;
  }

  /**
   * Set up periodic auto-save for extra reliability
   * @param {number} [intervalMs=30000] - Interval in milliseconds
   */
  setupPeriodicSave(intervalMs = 30000) {
    // Clear any existing interval
    if (this._saveInterval) {
      clearInterval(this._saveInterval);
    }

    // Auto-save periodically if conversation has messages
    this._saveInterval = setInterval(async () => {
      if (this.messages.length > 0) {
        try {
          await this.save();
        } catch (_e) {
          // Ignore save failures in background
        }
      }
    }, intervalMs);

    // Save before page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        try {
          this.save();
        } catch (_e) {
          // Ignore
        }
      });
    }
  }

  /**
   * Stop periodic auto-save
   */
  stopPeriodicSave() {
    if (this._saveInterval) {
      clearInterval(this._saveInterval);
      this._saveInterval = null;
    }
  }

}


export { ConversationManager };
