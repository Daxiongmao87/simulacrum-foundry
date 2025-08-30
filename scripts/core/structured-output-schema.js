/**
 * Structured Output Schema for Simulacrum AI Responses
 *
 * Defines the exact JSON schema that AI responses must follow,
 * supporting both OpenAI and Ollama structured output enforcement.
 */

/**
 * Gets the structured output schema for AI responses
 * @returns {Object} JSON schema for AI response format
 */
export function getResponseSchema() {
  return {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'The AI response message to the user',
      },
      tool_calls: {
        type: 'array',
        description: 'Optional array of tool calls to execute',
        items: {
          type: 'object',
          properties: {
            tool_name: {
              type: 'string',
              description: 'Exact name of the tool to execute',
            },
            parameters: {
              type: 'object',
              description: 'Parameters to pass to the tool',
            },
            reasoning: {
              type: 'string',
              description: 'Explanation of why this tool is being used',
            },
          },
          required: ['tool_name', 'parameters', 'reasoning'],
          additionalProperties: false,
        },
      },
      continuation: {
        type: 'object',
        properties: {
          in_progress: {
            type: 'boolean',
            description: 'Whether more work remains to be done',
          },
          gerund: {
            type: ['string', 'null'],
            description:
              'Single descriptive word ending in -ing when in_progress is true, null when false',
          },
        },
        required: ['in_progress', 'gerund'],
        additionalProperties: false,
      },
    },
    required: ['message', 'continuation'],
    additionalProperties: false,
  };
}

/**
 * Creates OpenAI-compatible structured output format
 * @returns {Object} OpenAI response_format object
 */
export function getOpenAIStructuredFormat() {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'simulacrum_response',
      schema: getResponseSchema(),
      strict: true,
    },
  };
}

/**
 * Creates Ollama-compatible structured output format
 * @returns {Object} Ollama format object
 */
export function getOllamaStructuredFormat() {
  return {
    format: 'json',
    schema: getResponseSchema(),
  };
}

/**
 * Fallback natural language instructions for system prompt
 * Used when structured output is not supported by the API
 */
export const FALLBACK_NATURAL_LANGUAGE_INSTRUCTIONS = `
## NATURAL LANGUAGE COMMUNICATION:
Use natural language to communicate with users. Be concise and action-oriented.
The system will handle tool calling through native function calling mechanisms.
Focus on executing the user's request efficiently using available tools.
`;

/**
 * Fallback JSON instructions when neither native tool calling nor structured output is supported
 * This is the last resort for very basic AI systems
 */
export const FALLBACK_JSON_INSTRUCTIONS = `
## RESPONSE FORMAT - FALLBACK MODE:
Your system does not support native tool calling. Please respond with JSON in this format:

{
  "message": "Your natural language response to the user",
  "tool_calls": [
    {
      "tool_name": "exact_tool_name",
      "parameters": {"param1": "value1"},
      "reasoning": "Why you're using this specific tool"
    }
  ],
  "continuation": {
    "in_progress": true/false,
    "gerund": "describing_action or null"
  }
}

Use natural language in the "message" field, but format the overall response as JSON.
`;
