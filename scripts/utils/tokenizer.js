/**
 * Tokenizer Adapter (MVP)
 * - Provides a pluggable interface for token estimation.
 * - Defaults to a simple heuristic to avoid external deps.
 * - Future: swap with model-specific tokenizers (e.g., tiktoken) when allowed.
 */

class TokenizerAdapter {
  /**
   * @param {object} [options]
   * @param {string} [options.model]
   */
  constructor(options = {}) {
    this.model = options.model || null;
  }

  /**
   * Estimate tokens for a single message.
   * Keeps parity with prior heuristic: word-count for content + JSON length of tool_calls.
   * @param {object} message
   * @returns {number}
   */
  estimateMessageTokens(message) {
    if (!message) return 0;
    let tokens = 0;
    if (message.content) {
      tokens += this._estimateText(String(message.content || ''));
    }
    if (message.tool_calls) {
      // Rough cost for tool_calls payload
      tokens += this._estimateText(JSON.stringify(message.tool_calls));
    }
    return tokens;
  }

  /**
   * Estimate tokens for multiple messages.
   * @param {Array<object>} messages
   * @returns {number}
   */
  estimateMessagesTokens(messages) {
    if (!Array.isArray(messages)) return 0;
    return messages.reduce((sum, m) => sum + this.estimateMessageTokens(m), 0);
  }

  /**
   * Internal heuristic: whitespace-separated word count as proxy for tokens.
   * @param {string} text
   * @returns {number}
   */
  _estimateText(text) {
    const s = String(text || '').trim();
    if (!s) return 0;
    // Count words; fallback to length for very short non-spaced strings
    const parts = s.split(/\s+/g);
    return parts.length || s.length;
  }
}

/**
 * Factory for default tokenizer adapter.
 * In the future, we can pick based on model/provider settings.
 */
function createDefaultTokenizer(model = null) {
  return new TokenizerAdapter({ model });
}

const defaultTokenizer = createDefaultTokenizer();

export { TokenizerAdapter, createDefaultTokenizer, defaultTokenizer };
export default defaultTokenizer;
