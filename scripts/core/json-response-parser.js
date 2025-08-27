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
   * @returns {Promise<object>} A promise that resolves with the parsed and validated JSON object.
   */
  async parseAgentResponse(rawResponse) {
    const MAX_RETRIES = 10; // Match agentic loop controller limit to prevent infinite loops
    let retryCount = 0;

    while (retryCount < MAX_RETRIES) {
      try {
        const parsed = JSON.parse(rawResponse);

        // Validate required fields
        if (!parsed.message || !parsed.tool_calls || !parsed.continuation) {
          throw new Error(
            'Missing required fields: message, tool_calls, or continuation.'
          );
        }

        return parsed;
      } catch (error) {
        retryCount++;
        console.warn(
          `Simulacrum | Parsing error (attempt ${retryCount}/${MAX_RETRIES}), retrying:`,
          error.message
        );
        console.warn('Simulacrum | Problematic JSON:', rawResponse);

        if (retryCount >= MAX_RETRIES) {
          console.error(
            `Simulacrum | Failed to parse JSON after ${MAX_RETRIES} attempts. Returning fallback response.`
          );
          // Return a fallback response to prevent system failure
          return {
            message: `I encountered persistent JSON formatting errors after ${MAX_RETRIES} attempts. Please try rephrasing your request.`,
            tool_calls: [],
            continuation: {
              in_progress: false,
              gerund: null,
            },
          };
        }

        // Request a new response from the AI service using JSON mode
        rawResponse = await this.aiService.sendJsonMessage(
          'Please respond in the required JSON format.'
        );
      }
    }
  }
}
