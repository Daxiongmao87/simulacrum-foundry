/**
 * Context Window Compaction System
 * Automatically detects context window limits and compresses chat history when approaching capacity
 */

/**
 * ModelContextDetector - Detects context window size from AI model endpoints
 */
class ModelContextDetector {
  /**
   * Detect context window size from model API
   * @param {string} apiEndpoint - The API endpoint URL
   * @param {string} modelName - The model name to query
   * @returns {Promise<number>} - Context window size in tokens
   */
  async detectContextWindow(apiEndpoint, modelName) {
    try {
      // First try to get from cached settings
      const cachedWindow = game.settings.get('simulacrum', 'contextWindow');
      if (cachedWindow && cachedWindow > 0) {
        console.log(
          `🔍 Using cached context window: ${cachedWindow} tokens for ${modelName}`
        );
        return cachedWindow;
      }

      // Try Ollama-style API first
      const response = await fetch(`${apiEndpoint}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
      });

      if (response.ok) {
        const modelInfo = await response.json();
        const parameters = modelInfo.parameters || {};
        const contextWindow = parameters.num_ctx || 4096;

        console.log(
          `🔍 Detected context window: ${contextWindow} tokens for ${modelName}`
        );
        return contextWindow;
      }
    } catch (error) {
      console.warn('🔍 Context window detection failed:', error);
    }

    // Fallback to reasonable default
    const fallbackWindow = 4096;
    console.log(
      `🔍 Using fallback context window: ${fallbackWindow} tokens for ${modelName || 'unknown model'}`
    );
    return fallbackWindow;
  }
}

/**
 * ContextCompaction - Manages automatic context window compaction
 */
export class ContextCompaction {
  constructor(aiService) {
    this.aiService = aiService;
    this.maxTokens = null;
    this.compactionThreshold = 0.75; // 75% of context window
    this.detector = new ModelContextDetector();
  }

  /**
   * Initialize context compaction with endpoint and model
   * @param {string} apiEndpoint - API endpoint URL
   * @param {string} modelName - Model name
   */
  async initialize(apiEndpoint, modelName) {
    this.maxTokens = await this.detector.detectContextWindow(
      apiEndpoint,
      modelName
    );
    console.log(
      `📦 Context compaction initialized with ${this.maxTokens} max tokens`
    );
  }

  /**
   * Set maximum tokens manually (used when dynamic detection is available)
   * @param {number} maxTokens - Maximum token count
   */
  setMaxTokens(maxTokens) {
    this.maxTokens = maxTokens;
    console.log(`📦 Context compaction max tokens set to ${this.maxTokens}`);
  }

  /**
   * Check if compaction is needed and perform it if necessary
   * @param {Array} chatHistory - Array of chat messages
   * @param {TokenTracker} tokenTracker - Token tracking instance
   * @returns {Promise<Array>} - Potentially compacted chat history
   */
  async checkAndCompact(chatHistory, tokenTracker) {
    if (!this.maxTokens || !tokenTracker) {
      return chatHistory; // No compaction possible
    }

    const stats = tokenTracker.getContextWindowStats();
    const currentUsage = stats.currentPromptTokens;
    const thresholdTokens = this.maxTokens * this.compactionThreshold;

    if (currentUsage > thresholdTokens) {
      console.log(
        `🗜️ Context compaction triggered at ${currentUsage}/${this.maxTokens} tokens (${Math.round((currentUsage / this.maxTokens) * 100)}%)`
      );
      return await this.performCompaction(chatHistory);
    }

    return chatHistory; // No compaction needed
  }

  /**
   * Perform the actual compaction process
   * @param {Array} chatHistory - Array of chat messages
   * @returns {Promise<Array>} - Compacted chat history
   */
  async performCompaction(chatHistory) {
    try {
      // Always preserve the first message (usually system/welcome) if it exists
      const hasSystemMessage =
        chatHistory.length > 0 &&
        (chatHistory[0].role === 'system' ||
          chatHistory[0].role === 'assistant');
      const preservedStart = hasSystemMessage ? chatHistory.slice(0, 1) : [];
      const workingHistory = hasSystemMessage
        ? chatHistory.slice(1)
        : chatHistory;

      if (workingHistory.length <= 2) {
        // Too few messages to compact meaningfully
        console.log('📦 Skipping compaction - too few messages to compress');
        return chatHistory;
      }

      // Split working history: older half vs newer half
      const midpoint = Math.floor(workingHistory.length / 2);
      const olderHalf = workingHistory.slice(0, midpoint);
      const newerHalf = workingHistory.slice(midpoint);

      console.log(
        `📦 Compacting ${olderHalf.length} older messages, preserving ${newerHalf.length} newer messages`
      );

      // Send older half to AI for summarization
      const summary = await this.summarizeHistory(olderHalf);

      // Build compacted history: preserved start + summary + newer half
      const compactedHistory = [
        ...preservedStart,
        {
          role: 'system',
          content: `[COMPACTED HISTORY]: ${summary}`,
          isCompacted: true,
          timestamp: new Date().toISOString(),
        },
        ...newerHalf,
      ];

      console.log(
        `📦 Compacted ${olderHalf.length} messages into 1 summary. New history length: ${compactedHistory.length}`
      );
      return compactedHistory;
    } catch (error) {
      console.error('📦 Context compaction failed:', error);
      // Return original history on failure
      return chatHistory;
    }
  }

  /**
   * Use AI to summarize a portion of chat history
   * @param {Array} messages - Messages to summarize
   * @returns {Promise<string>} - Summary text
   */
  async summarizeHistory(messages) {
    if (!messages || messages.length === 0) {
      return 'No previous conversation history.';
    }

    // Build history text for summarization
    const historyText = messages
      .map((msg) => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        return `${role}: ${msg.content}`;
      })
      .join('\n\n');

    const prompt = `Please summarize the following chat conversation, preserving all important details, context, decisions made, and key information that might be relevant for continuing the conversation:

${historyText}

Provide a comprehensive summary that captures:
- Key topics discussed
- Important decisions or conclusions reached  
- Relevant context for ongoing work
- Any unresolved issues or pending tasks
- Character names, locations, or other important details mentioned
- Tool execution results and their outcomes

Summary:`;

    try {
      const response = await this.aiService.sendMessage(prompt);
      return response.trim();
    } catch (error) {
      console.error('📦 History summarization failed:', error);
      // Fallback to a simple concatenation
      return `Previous conversation covered: ${messages.map((m) => m.content.substring(0, 50)).join('; ')}...`;
    }
  }
}
