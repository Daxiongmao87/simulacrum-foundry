/**
 * @file TokenTracker class for tracking API token usage.
 * @module simulacrum.core.TokenTracker
 */

/**
 * Manages and tracks API token usage for different categories (e.g., prompt, completion, total).
 */
export class TokenTracker {
  /**
   * Creates an instance of TokenTracker.
   * @param {object} [initialCounts={}] - Initial token counts.
   * @param {number} [initialCounts.prompt=0] - Initial prompt token count.
   * @param {number} [initialCounts.completion=0] - Initial completion token count.
   * @param {number} [initialCounts.total=0] - Initial total token count.
   */
  constructor(initialCounts = {}) {
    /**
     * @private
     * @type {number}
     */
    this._promptTokens = initialCounts.prompt || 0;
    /**
     * @private
     * @type {number}
     */
    this._completionTokens = initialCounts.completion || 0;
    /**
     * @private
     * @type {number}
     */
    this._totalTokens = initialCounts.total || 0;

    /**
     * Maximum tokens for context window
     * @private
     * @type {number|null}
     */
    this._maxTokens = null;

    /**
     * Current token usage from latest API response
     * @private
     * @type {number}
     */
    this._currentPromptTokens = 0;
  }

  /**
   * Adds tokens to the prompt count.
   * @param {number} count - The number of tokens to add.
   */
  addPromptTokens(count) {
    if (typeof count !== 'number' || count < 0) {
      console.warn(
        'Simulacrum | TokenTracker: Invalid prompt token count provided.',
        count
      );
      return;
    }
    this._promptTokens += count;
    this._totalTokens += count;
    console.log(
      `Simulacrum | TokenTracker: Added ${count} prompt tokens. Current total: ${this._promptTokens}`
    );
  }

  /**
   * Adds tokens to the completion count.
   * @param {number} count - The number of tokens to add.
   */
  addCompletionTokens(count) {
    if (typeof count !== 'number' || count < 0) {
      console.warn(
        'Simulacrum | TokenTracker: Invalid completion token count provided.',
        count
      );
      return;
    }
    this._completionTokens += count;
    this._totalTokens += count;
    console.log(
      `Simulacrum | TokenTracker: Added ${count} completion tokens. Current total: ${this._completionTokens}`
    );
  }

  /**
   * Resets all token counts to zero.
   */
  reset() {
    this._promptTokens = 0;
    this._completionTokens = 0;
    this._totalTokens = 0;
    console.log('Simulacrum | TokenTracker: All token counts reset.');
  }

  /**
   * Gets the current prompt token count.
   * @returns {number} The current prompt token count.
   */
  get promptTokens() {
    return this._promptTokens;
  }

  /**
   * Gets the current completion token count.
   * @returns {number} The current completion token count.
   */
  get completionTokens() {
    return this._completionTokens;
  }

  /**
   * Gets the current total token count.
   * @returns {number} The current total token count.
   */
  get totalTokens() {
    return this._totalTokens;
  }

  /**
   * Returns an object with all current token counts.
   * @returns {{prompt: number, completion: number, total: number}} An object containing all token counts.
   */
  getCounts() {
    return {
      prompt: this._promptTokens,
      completion: this._completionTokens,
      total: this._totalTokens,
    };
  }

  /**
   * Set the maximum token limit for the context window
   * @param {number} maxTokens - Maximum tokens available
   */
  setMaxTokens(maxTokens) {
    this._maxTokens = maxTokens;
    console.log(
      `🎯 TokenTracker initialized with ${maxTokens} token context window`
    );
  }

  /**
   * Update token count from API response
   * @param {Object} apiResponse - Response from AI service with usage data
   */
  updateFromResponse(apiResponse) {
    // API returns: { "usage": { "prompt_tokens": 80, "total_tokens": 180 } }
    if (apiResponse && apiResponse.usage && apiResponse.usage.prompt_tokens) {
      this._currentPromptTokens = apiResponse.usage.prompt_tokens;
    }
  }

  /**
   * Get remaining tokens available in context window
   * @returns {number} Available tokens
   */
  getAvailableTokens() {
    if (!this._maxTokens) {
      return 0;
    }
    return Math.max(0, this._maxTokens - this._currentPromptTokens);
  }

  /**
   * Get maximum tokens that should be used for tool results
   * @returns {number} Max tokens for tool results (half of available space)
   */
  getMaxToolResultTokens() {
    return Math.floor(this.getAvailableTokens() / 2);
  }

  /**
   * Check if we have enough tokens remaining for operation
   * @param {number} requiredTokens - Tokens needed
   * @returns {boolean} True if tokens available
   */
  hasTokensAvailable(requiredTokens) {
    return this.getAvailableTokens() >= requiredTokens;
  }

  /**
   * Get current token usage stats including context window info
   * @returns {Object} Token usage information
   */
  getContextWindowStats() {
    return {
      maxTokens: this._maxTokens,
      currentPromptTokens: this._currentPromptTokens,
      availableTokens: this.getAvailableTokens(),
      maxToolResultTokens: this.getMaxToolResultTokens(),
    };
  }
}

/**
 * Format tool execution results for AI consumption with token-based truncation
 * @param {Array} toolResults - Array of tool execution results
 * @param {TokenTracker} tokenTracker - Token tracker instance
 * @returns {string} Formatted tool results text
 */
export function formatToolResultsForAI(toolResults, tokenTracker) {
  if (!toolResults || toolResults.length === 0) {
    return '';
  }

  const maxTokens = tokenTracker.getMaxToolResultTokens();
  // Rough estimate: 4 characters per token
  const maxChars = maxTokens * 4;

  let formattedResults = toolResults
    .map((result) => {
      if (result.success) {
        let resultStr = JSON.stringify(result.result);
        // Truncate individual tool result if too large
        if (resultStr.length > 1000) {
          resultStr = resultStr.substring(0, 1000) + '...[truncated]';
        }
        return `Tool ${result.toolName} succeeded: ${resultStr}`;
      } else {
        return `Tool ${result.toolName} failed: ${result.error}`;
      }
    })
    .join('\n');

  // Truncate entire results if exceeds token limit
  if (formattedResults.length > maxChars) {
    formattedResults =
      formattedResults.substring(0, maxChars) + '...[results truncated]';
  }

  return formattedResults;
}
