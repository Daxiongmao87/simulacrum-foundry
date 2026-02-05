/* eslint-disable complexity, max-params */
// import { SimulacrumError } from '../utils/errors.js'; // Unused

/**
 * @class ConversationManager
 * @description Manages the conversation history, token counting, and compression for AI interactions.
 *              Mirrors qwen-code's conversation patterns, adapted for FoundryVTT context.
 */
import { defaultTokenizer } from '../utils/tokenizer.js';
import { createLogger, isDebugEnabled } from '../utils/logger.js';
import { interactionLogger } from './interaction-logger.js';

const logger = createLogger('Conversation');

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
    this.messages = []; // Backward compatibility - synced from activeMessages
    this.sessionTokens = 0;

    // Tiered Context Architecture (Context Compaction)
    this.rollingSummary = ''; // Tier 2: Compressed history summary
    this.activeMessages = []; // Tier 3: Recent messages in full fidelity
    this.toolOutputBuffer = new Map(); // Store full tool outputs for indexed access

    // Configurable token limit support (fallback context limit)
    let configuredMax = maxTokens;
    try {
      if (typeof game !== 'undefined' && game?.settings?.get) {
        const limit = game.settings.get('simulacrum', 'fallbackContextLimit');
        if (limit && limit > 0) {
          configuredMax = limit;
        }
      }
    } catch {
      // Ignore settings access errors
    }
    this.maxTokens = configuredMax;
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
  addMessage(role, content, toolCalls = null, toolCallId = null, metadata = null) {
    const message = { role, content };
    if (metadata) {
      // Support _internal flag for messages that shouldn't be displayed to users
      // (e.g., correction context for AI)
      if (metadata._internal === true) {
        message._internal = true;
      }
      // Store provider metadata separately
      const { _internal, ...providerMeta } = metadata;
      if (Object.keys(providerMeta).length > 0) {
        message.provider_metadata = providerMeta;
      }
    }
    if (toolCalls) {
      // Fix: Ensure every tool call has the required 'type' property (default to 'function')
      // This prevents API errors where tool calls are ignored due to missing schema fields.
      message.tool_calls = toolCalls.map(tc => ({
        type: 'function',
        ...tc,
      }));
    }
    if (toolCallId) {
      message.tool_call_id = toolCallId;
    }

    // Log interaction if enabled
    interactionLogger.logMessage(message, { toolCalls, toolCallId, metadata });

    // Add to activeMessages (Tier 3) and sync to messages for backward compatibility
    this.activeMessages.push(message);
    this.messages = [...this.activeMessages]; // Sync for external consumers
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
      this.sessionTokens += newTokens - oldTokens;

      // Trigger auto-save if callback is provided
      this._triggerStateChange();
    }
  }

  /**
   * Calculate the compaction threshold based on model context window
   * @returns {number} Token threshold for triggering compaction
   * @private
   */
  _getCompactionThreshold() {
    const contextWindow = this.maxTokens;
    const contextTarget = Math.floor(contextWindow * 0.33); // 33% for working memory
    const compactionPromptSize = 500; // Overhead for summarization prompt
    return contextWindow - contextTarget - compactionPromptSize;
  }

  /**
   * Build the prompt for AI summarization
   * @param {Array} messages - Messages to summarize
   * @returns {string} Summarization prompt
   * @private
   */
  _buildSummarizationPrompt(messages) {
    const currentSaga = this.rollingSummary
      ? `Current Summary:\n${this.rollingSummary}\n\n`
      : '';

    const newContent = messages
      .map(m => `[${m.role}]: ${m.content?.substring(0, 500) || '[tool call]'}`)
      .join('\n');

    return `${currentSaga}Update the summary with these new events. Preserve proper nouns, document IDs, and key decisions. Be concise.\n\nNew Events:\n${newContent}`;
  }

  /**
   * Recalculate total token count from activeMessages and rollingSummary
   * @private
   */
  _recalculateTokens() {
    const messageTokens = this.activeMessages.reduce(
      (acc, msg) => acc + this._estimateTokens(msg),
      0
    );
    const summaryTokens = this.rollingSummary
      ? Math.ceil(this.rollingSummary.length / 4)
      : 0;
    this.sessionTokens = messageTokens + summaryTokens;
  }

  /**
   * Compact history using AI-driven summarization
   * @param {object} aiClient - AI client for summarization calls
   * @returns {Promise<boolean>} Whether compaction occurred
   */
  async compactHistory(aiClient) {
    const threshold = this._getCompactionThreshold();
    const currentTokens = this.sessionTokens;

    if (currentTokens <= threshold) {
      return false; // No compaction needed
    }

    // Extract oldest messages to compact (keep system message)
    // Extract oldest messages to compact (keep system message)
    const systemMsg =
      this.activeMessages[0]?.role === 'system' ? this.activeMessages[0] : null;
    const startIdx = systemMsg ? 1 : 0;

    // Define initial chunk size
    let chunkEnd = startIdx + 5;

    // Boundary Check 1: prevent stranding a tool message as an orphan
    // If the message that would become the new head (at chunkEnd) is a 'tool' message,
    // we must include it in the compaction batch (consume it).
    // We implicitly assume that if we are compacting the parent Assistant message,
    // we must also compact its children Tool messages.
    while (
      chunkEnd < this.activeMessages.length &&
      this.activeMessages[chunkEnd].role === 'tool'
    ) {
      chunkEnd++;
    }

    // Boundary Check 2: If the last message we're keeping (at chunkEnd - 1) is an assistant
    // message with tool_calls, we need to include all its corresponding tool responses.
    // Otherwise, we'd leave orphaned tool responses in the remaining messages.
    while (chunkEnd > startIdx) {
      const lastCompacted = this.activeMessages[chunkEnd - 1];
      if (lastCompacted?.role === 'assistant' && lastCompacted?.tool_calls?.length > 0) {
        // This assistant has tool_calls - we must include its tool responses
        // Count how many tool responses follow
        const toolCallIds = new Set(lastCompacted.tool_calls.map(tc => tc.id));
        while (
          chunkEnd < this.activeMessages.length &&
          this.activeMessages[chunkEnd].role === 'tool' &&
          toolCallIds.has(this.activeMessages[chunkEnd].tool_call_id)
        ) {
          chunkEnd++;
        }
        break; // Only need to check the last message once
      }
      break;
    }

    const messagesToCompact = this.activeMessages.slice(startIdx, chunkEnd);

    if (messagesToCompact.length === 0) {
      return false;
    }

    // Build summarization prompt
    const prompt = this._buildSummarizationPrompt(messagesToCompact);

    try {
      const response = await aiClient.chat(
        [{ role: 'user', content: prompt }],
        null,
        { maxTokens: 500, isBackground: true }
      );

      const newSummary = response?.choices?.[0]?.message?.content || '';
      if (newSummary) {
        this.rollingSummary = newSummary;

        // 4. Update state: remove compacted messages, keep system + summary + remaining
        this.activeMessages = [
          ...this.activeMessages.slice(0, startIdx),
          ...this.activeMessages.slice(chunkEnd),
        ];

        // Sync messages array for backward compatibility
        this.messages = [...this.activeMessages];

        this._recalculateTokens();
        this._triggerStateChange();
        return true;
      }
    } catch (error) {
      logger.warn('Compaction failed:', error);
    }

    return false;
  }

  /**
   * Legacy compressHistory - now delegates to simple truncation fallback
   * For synchronous fallback when AI-driven compaction cannot be used
   */
  compressHistory() {
    // Simple truncation fallback for backward compatibility
    while (this.sessionTokens > this.maxTokens && this.activeMessages.length > 1) {
      const removedMessage = this.activeMessages.shift();
      this.sessionTokens -= this._estimateTokens(removedMessage);

      // Fix: If the new head message is a 'tool' result, it is now an orphan.
      while (this.activeMessages.length > 0 && this.activeMessages[0].role === 'tool') {
        const removedOrphan = this.activeMessages.shift();
        this.sessionTokens -= this._estimateTokens(removedOrphan);
      }
    }

    // Sync messages array
    this.messages = [...this.activeMessages];

    // Trigger auto-save if callback is provided
    this._triggerStateChange();
  }

  /**
   * Clears the entire conversation history.
   */
  clear() {
    this.messages = [];
    this.activeMessages = [];
    this.rollingSummary = '';
    this.toolOutputBuffer.clear();
    this.sessionTokens = 0;

    // Trigger auto-save if callback is provided
    this._triggerStateChange();
  }

  /**
   * Returns the synthesized message array for AI consumption.
   * Injects rollingSummary as a system message if present.
   * @returns {Array<object>} The array of messages.
   */
  getMessages() {
    if (!this.rollingSummary) {
      return this.activeMessages;
    }

    // Find system message position
    const systemIdx = this.activeMessages.findIndex(m => m.role === 'system');
    const insertIdx = systemIdx >= 0 ? systemIdx + 1 : 0;

    // Inject summary after system message
    const summaryMsg = {
      role: 'system',
      content: `### PREVIOUS CONVERSATION SUMMARY\n${this.rollingSummary}`,
    };

    return [
      ...this.activeMessages.slice(0, insertIdx),
      summaryMsg,
      ...this.activeMessages.slice(insertIdx),
    ];
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
      estimate: text => {
        try {
          return adapter.estimateMessageTokens({ role: 'system', content: String(text || '') });
        } catch (_e) {
          const str = String(text || '').trim();
          return str ? (str.match(/\S+/g) || []).length : 0;
        }
      },
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
        logger.warn('State change callback failed:', error);
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
      activeMessages: this.activeMessages,
      rollingSummary: this.rollingSummary,
      toolOutputBuffer: Array.from(this.toolOutputBuffer.entries()),
      sessionTokens: this.sessionTokens,
      v: 2,
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
      if (
        typeof game !== 'undefined' &&
        game?.settings &&
        typeof game.settings.set === 'function'
      ) {
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
        if (
          typeof game !== 'undefined' &&
          game?.settings &&
          typeof game.settings.get === 'function'
        ) {
          state = game.settings.get('simulacrum', key);
        }
      } catch (_e) {
        // ignore
      }
    }

    if (!state) return false;

    // Handle schema versions
    if (state.v === 2) {
      // v2: Tiered context architecture
      this.activeMessages = Array.isArray(state.activeMessages) ? state.activeMessages : [];
      this.rollingSummary = typeof state.rollingSummary === 'string' ? state.rollingSummary : '';
      this.toolOutputBuffer = new Map(state.toolOutputBuffer || []);
      this.sessionTokens = Number.isFinite(state.sessionTokens) ? state.sessionTokens : 0;
      // Sync messages for backward compatibility
      this.messages = [...this.activeMessages];
    } else {
      // v1 or legacy: Migrate - treat all messages as active
      this.activeMessages = Array.isArray(state.messages) ? state.messages : [];
      this.rollingSummary = '';
      this.toolOutputBuffer = new Map();
      this.sessionTokens = Number.isFinite(state.sessionTokens) ? state.sessionTokens : 0;
      this.messages = [...this.activeMessages];
    }

    // Sanitize loaded messages to ensure tool call/response parity
    // This handles backward compatibility with old conversations and tool changes
    this._sanitizeMessages();

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

  /**
   * Sanitize messages to ensure tool call/response parity.
   * This is critical for Mistral and other strict APIs that require every
   * tool_call to have a corresponding tool response.
   * 
   * Handles:
   * - Old conversations with incomplete tool executions
   * - Conversations interrupted during tool execution
   * - Tool changes (additions/removals) between sessions
   * @private
   */
  _sanitizeMessages() {
    if (!this.activeMessages || this.activeMessages.length === 0) return;

    // Build sets of expected tool responses and received tool responses
    const expectedToolResponses = new Map(); // tool_call_id -> index of assistant message
    const receivedToolResponses = new Set();

    for (let i = 0; i < this.activeMessages.length; i++) {
      const msg = this.activeMessages[i];
      if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          if (tc.id) {
            expectedToolResponses.set(tc.id, i);
          }
        }
      }
      if (msg.role === 'tool' && msg.tool_call_id) {
        receivedToolResponses.add(msg.tool_call_id);
      }
    }

    // Find mismatches
    const missingResponses = [...expectedToolResponses.keys()].filter(
      id => !receivedToolResponses.has(id)
    );
    const orphanResponses = [...receivedToolResponses].filter(
      id => !expectedToolResponses.has(id)
    );

    if (missingResponses.length === 0 && orphanResponses.length === 0) {
      return; // No issues to fix
    }

    logger.warn('Sanitizing conversation history:', {
      missingToolResponses: missingResponses.length,
      orphanToolResponses: orphanResponses.length,
    });

    // Strategy 1: Add stub responses for missing tool responses
    // Find where to insert them (after the assistant message with the tool_calls)
    if (missingResponses.length > 0) {
      const stubResponse = {
        error: 'Tool execution was interrupted or the conversation was restored from a previous session.',
        stale: true,
      };

      // Group missing responses by their assistant message index
      const insertions = [];
      for (const toolCallId of missingResponses) {
        const assistantIdx = expectedToolResponses.get(toolCallId);
        insertions.push({
          afterIndex: assistantIdx,
          message: {
            role: 'tool',
            content: JSON.stringify(stubResponse),
            tool_call_id: toolCallId,
          },
        });
      }

      // Sort by index descending so we can insert without shifting indices
      insertions.sort((a, b) => b.afterIndex - a.afterIndex);

      for (const ins of insertions) {
        // Find the correct position: after the assistant message and any existing tool responses
        let insertPos = ins.afterIndex + 1;
        while (
          insertPos < this.activeMessages.length &&
          this.activeMessages[insertPos].role === 'tool'
        ) {
          insertPos++;
        }
        this.activeMessages.splice(insertPos, 0, ins.message);
      }
    }

    // Strategy 2: Remove orphan tool responses (responses without matching tool_calls)
    if (orphanResponses.length > 0) {
      this.activeMessages = this.activeMessages.filter(msg => {
        if (msg.role === 'tool' && msg.tool_call_id) {
          return !orphanResponses.includes(msg.tool_call_id);
        }
        return true;
      });
    }

    // Sync messages array
    this.messages = [...this.activeMessages];
    this._recalculateTokens();

    if (isDebugEnabled()) logger.debug('Conversation history sanitized successfully');
  }
}

export { ConversationManager };
