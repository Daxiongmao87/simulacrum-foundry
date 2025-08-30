/**
 * @class AgentResponseParser
 * @description Parses and validates JSON responses from the AI agent, with retry limit to prevent infinite loops.
 */
export class AgentResponseParser {
  /**
   * @param {object} aiService - An instance of the AIService for retrying malformed responses.
   */
  constructor(aiService) {
    this.aiService = aiService;
  }

  /**
   * Parses and validates a raw JSON response from the AI agent.
   * If the response is malformed or missing required fields, it retries by requesting a new response from the AI service.
   * @param {string} rawResponse - The raw JSON string received from the AI.
   * @param {AbortSignal} abortSignal - Signal to cancel the operation.
   * @returns {Promise<object>} A promise that resolves with the parsed and validated JSON object.
   */
  async parseAgentResponse(rawResponse, abortSignal) {
    const MAX_RETRIES = 5; // Limit retries to prevent infinite loops
    let attemptCount = 0;

    while (attemptCount < MAX_RETRIES) {
      try {
        // Handle empty response
        if (!rawResponse || rawResponse.trim() === '') {
          throw new Error('No response received from AI service');
        }

        const parsed = JSON.parse(rawResponse);

        // Validate required fields existence (treat null as missing)
        const requiredFields = ['message', 'continuation'];
        const missingFields = requiredFields.filter(
          (field) => parsed[field] === undefined || parsed[field] === null
        );

        if (missingFields.length > 0) {
          throw new Error(
            `Missing required fields: ${missingFields.join(', ')}`
          );
        }

        // Validate field types
        if (typeof parsed.message !== 'string') {
          throw new Error('Field "message" must be a string');
        }

        // tool_calls is optional - if not provided, default to empty array
        if (parsed.tool_calls === undefined || parsed.tool_calls === null) {
          parsed.tool_calls = [];
        }

        if (!Array.isArray(parsed.tool_calls)) {
          throw new Error('Field "tool_calls" must be an array if provided');
        }

        if (
          typeof parsed.continuation !== 'object' ||
          parsed.continuation === null
        ) {
          throw new Error('Field "continuation" must be an object');
        }

        if (typeof parsed.continuation.in_progress !== 'boolean') {
          throw new Error('Field "continuation.in_progress" must be a boolean');
        }

        return parsed;
      } catch (error) {
        attemptCount++;
        game.simulacrum?.logger?.warn(
          `Parsing error (attempt ${attemptCount}/${MAX_RETRIES}), retrying:`,
          error.message
        );

        if (attemptCount >= MAX_RETRIES) {
          game.simulacrum?.logger?.error(
            `Failed to parse JSON after ${MAX_RETRIES} attempts. Returning fallback response.`
          );
          // Return a fallback response to prevent system failure
          return {
            message:
              'I encountered a formatting error and reached maximum retry attempts. Please try rephrasing your request.',
            tool_calls: [],
            continuation: {
              in_progress: false,
              gerund: null,
            },
          };
        }

        // Generate detailed error message for retry
        let errorMessage;
        if (!rawResponse || rawResponse.trim() === '') {
          errorMessage =
            'No response received from AI service. You MUST respond with valid JSON.';
        } else {
          // Create snippet for context, truncate if too long
          const snippet =
            rawResponse.length > 200
              ? rawResponse.substring(0, 200) + '...'
              : rawResponse;

          if (error.message.includes('JSON')) {
            errorMessage = `JSON parsing error: ${error.message}\n\nProblem occurred in this response snippet:\n${snippet}\n\nCommon JSON errors:\n- NO JavaScript comments (// breaks JSON)\n- NO trailing commas\n- Use double quotes for strings\n- Validate JSON syntax\n\nYou MUST respond with valid JSON.`;
          } else {
            errorMessage = `Validation error: ${error.message}\n\nProblem occurred in this response snippet:\n${snippet}\n\nYou MUST respond with valid JSON.`;
          }
        }

        // Request a new response from the AI service with error appended to system prompt
        rawResponse = await this.aiService.sendWithSystemAddition(
          errorMessage,
          abortSignal
        );
      }
    }
  }
}
