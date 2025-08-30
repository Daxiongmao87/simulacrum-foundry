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
 * Fallback JSON format instructions for system prompt
 * Used when structured output is not supported by the API
 */
export const FALLBACK_JSON_INSTRUCTIONS = `
## RESPONSE FORMAT - CRITICAL:
You MUST respond with valid JSON only. No markdown, no code blocks, no additional text.

Required structure:
{
  "message": "Your response to the user",
  "tool_calls": [  // OPTIONAL - omit entirely or use empty array [] if no tools needed
    {
      "tool_name": "exact_tool_name",
      "parameters": {"param1": "value1"},
      "reasoning": "Why you're using this specific tool"
    }
  ],
  "continuation": {
    "in_progress": true/false,
    "gerund": "Single descriptive word ending in -ing or null"
  }
}

JSON Rules:
- NEVER use JavaScript comments (// or /* */)
- NEVER include trailing commas
- ALWAYS use double quotes for strings
- gerund: Required when in_progress=true, null when in_progress=false
`;
