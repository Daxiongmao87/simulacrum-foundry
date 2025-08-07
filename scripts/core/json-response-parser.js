/**
 * @class AgentResponseParser
 * @description Parses and validates JSON responses from the AI agent, with unlimited retry for malformed responses.
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
        while (true) {
            try {
                const parsed = JSON.parse(rawResponse);

                // Validate required fields
                if (!parsed.message || !parsed.tool_calls || !parsed.continuation) {
                    throw new Error("Missing required fields: message, tool_calls, or continuation.");
                }

                return parsed;
            } catch (error) {
                console.log("Simulacrum | Parsing error, retrying:", error.message);
                // Request a new response from the AI service
                rawResponse = await this.aiService.sendMessage("Please respond in the required JSON format.");
            }
        }
    }
}
