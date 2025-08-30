/**
 * @class AgentResponseParser
 * @description Parses natural language responses with embedded tool calls from the AI agent.
 */
export class AgentResponseParser {
  /**
   * @param {object} aiService - An instance of the AIService for retrying malformed responses.
   */
  constructor(aiService) {
    this.aiService = aiService;
  }

  /**
   * Parses natural language responses with tool calls from the AI agent.
   * @param {string} rawResponse - The raw natural language response received from the AI.
   * @param {AbortSignal} abortSignal - Signal to cancel the operation.
   * @returns {Promise<object>} A promise that resolves with the parsed response object.
   */
  async parseAgentResponse(rawResponse, abortSignal) {
    try {
      // Handle empty response
      if (!rawResponse || rawResponse.trim() === '') {
        return {
          message: 'I received an empty response. Please try again.',
          tool_calls: [],
          continuation: { in_progress: false, gerund: null },
        };
      }

      // First try to parse as JSON (for compatibility with existing structured output)
      let parsed;
      try {
        parsed = JSON.parse(rawResponse);
        // If JSON parsing succeeds and has expected structure, validate and use it
        if (parsed.message && parsed.continuation) {
          // Validate types to ensure it's actually valid
          if (
            typeof parsed.message === 'string' &&
            typeof parsed.continuation === 'object' &&
            typeof parsed.continuation.in_progress === 'boolean'
          ) {
            // Ensure tool_calls exists and is valid
            if (!parsed.tool_calls || parsed.tool_calls === null) {
              parsed.tool_calls = [];
              return parsed;
            } else if (!Array.isArray(parsed.tool_calls)) {
              // Invalid tool_calls type - treat as natural language
              // Fall through to natural language parsing
            } else {
              return parsed;
            }
          }
        }
        // JSON parsed successfully but doesn't have expected structure
        // Fall through to treat as natural language
      } catch {
        // Not JSON, parse as natural language - this is expected now
      }

      // Parse natural language response
      const result = {
        message: rawResponse.trim(),
        tool_calls: [],
        continuation: { in_progress: false, gerund: null },
      };

      // Extract any tool calls that were provided by the model
      // This will be handled by the tool calling mechanism in the AI service
      // For now, assume no tool calls in natural language mode

      return result;
    } catch (error) {
      game.simulacrum?.logger?.error('Error parsing agent response:', error);

      // Return a safe fallback response
      return {
        message:
          'I encountered an error processing my response. Please try rephrasing your request.',
        tool_calls: [],
        continuation: { in_progress: false, gerund: null },
      };
    }
  }
}
