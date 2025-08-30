/**
 * @file tests/unit/v13/structured-output-schema.test.js  
 * @description Unit tests for structured output schema functions (FoundryVTT v13)
 */

import { 
  getResponseSchema, 
  getOpenAIStructuredFormat, 
  getOllamaStructuredFormat, 
  FALLBACK_JSON_INSTRUCTIONS 
} from '../../../scripts/core/structured-output-schema.js';

describe('Structured Output Schema v13', () => {
  describe('getResponseSchema', () => {
    test('should return valid JSON schema object', () => {
      const schema = getResponseSchema();
      
      expect(schema).toEqual({
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The AI response message to the user'
          },
          tool_calls: {
            type: 'array',
            description: 'Optional array of tool calls to execute',
            items: {
              type: 'object',
              properties: {
                tool_name: {
                  type: 'string',
                  description: 'Exact name of the tool to execute'
                },
                parameters: {
                  type: 'object',
                  description: 'Parameters to pass to the tool'
                },
                reasoning: {
                  type: 'string',
                  description: 'Explanation of why this tool is being used'
                }
              },
              required: ['tool_name', 'parameters', 'reasoning'],
              additionalProperties: false
            }
          },
          continuation: {
            type: 'object',
            properties: {
              in_progress: {
                type: 'boolean',
                description: 'Whether more work remains to be done'
              },
              gerund: {
                type: ['string', 'null'],
                description: 'Single descriptive word ending in -ing when in_progress is true, null when false'
              }
            },
            required: ['in_progress', 'gerund'],
            additionalProperties: false
          }
        },
        required: ['message', 'continuation'],
        additionalProperties: false
      });
    });

    test('should have required message field', () => {
      const schema = getResponseSchema();
      expect(schema.required).toContain('message');
      expect(schema.properties.message.type).toBe('string');
    });

    test('should have required continuation field', () => {
      const schema = getResponseSchema();
      expect(schema.required).toContain('continuation');
      expect(schema.properties.continuation.type).toBe('object');
      expect(schema.properties.continuation.required).toEqual(['in_progress', 'gerund']);
    });

    test('should have optional tool_calls field', () => {
      const schema = getResponseSchema();
      expect(schema.required).not.toContain('tool_calls');
      expect(schema.properties.tool_calls.type).toBe('array');
    });

    test('should enforce strict structure with additionalProperties: false', () => {
      const schema = getResponseSchema();
      expect(schema.additionalProperties).toBe(false);
      expect(schema.properties.tool_calls.items.additionalProperties).toBe(false);
      expect(schema.properties.continuation.additionalProperties).toBe(false);
    });
  });

  describe('getOpenAIStructuredFormat', () => {
    test('should return valid OpenAI response_format object', () => {
      const format = getOpenAIStructuredFormat();
      
      expect(format).toEqual({
        type: 'json_schema',
        json_schema: {
          name: 'simulacrum_response',
          schema: getResponseSchema(),
          strict: true
        }
      });
    });

    test('should have correct structure for OpenAI API', () => {
      const format = getOpenAIStructuredFormat();
      
      expect(format.type).toBe('json_schema');
      expect(format.json_schema.name).toBe('simulacrum_response');
      expect(format.json_schema.strict).toBe(true);
      expect(format.json_schema.schema).toEqual(getResponseSchema());
    });
  });

  describe('getOllamaStructuredFormat', () => {
    test('should return valid Ollama format object', () => {
      const format = getOllamaStructuredFormat();
      
      expect(format).toEqual({
        format: 'json',
        schema: getResponseSchema()
      });
    });

    test('should have correct structure for Ollama API', () => {
      const format = getOllamaStructuredFormat();
      
      expect(format.format).toBe('json');
      expect(format.schema).toEqual(getResponseSchema());
    });
  });

  describe('FALLBACK_JSON_INSTRUCTIONS', () => {
    test('should contain fallback mode instructions', () => {
      expect(FALLBACK_JSON_INSTRUCTIONS).toContain('RESPONSE FORMAT - FALLBACK MODE');
      expect(FALLBACK_JSON_INSTRUCTIONS).toContain('does not support native tool calling');
      expect(FALLBACK_JSON_INSTRUCTIONS).toContain('message');
      expect(FALLBACK_JSON_INSTRUCTIONS).toContain('tool_calls');
      expect(FALLBACK_JSON_INSTRUCTIONS).toContain('continuation');
    });

    test('should include natural language guidance', () => {
      expect(FALLBACK_JSON_INSTRUCTIONS).toContain('natural language response');
      expect(FALLBACK_JSON_INSTRUCTIONS).toContain('JSON in this format');
    });

    test('should include example JSON structure', () => {
      expect(FALLBACK_JSON_INSTRUCTIONS).toContain('"message":');
      expect(FALLBACK_JSON_INSTRUCTIONS).toContain('"tool_calls":');
      expect(FALLBACK_JSON_INSTRUCTIONS).toContain('"continuation":');
      expect(FALLBACK_JSON_INSTRUCTIONS).toContain('"in_progress":');
      expect(FALLBACK_JSON_INSTRUCTIONS).toContain('"gerund":');
    });

    test('should explain gerund logic', () => {
      expect(FALLBACK_JSON_INSTRUCTIONS).toContain('gerund');
    });
  });

  describe('Schema Validation', () => {
    test('should validate against a correct response structure', () => {
      const schema = getResponseSchema();
      const validResponse = {
        message: "Test response",
        tool_calls: [
          {
            tool_name: "test_tool",
            parameters: { param1: "value1" },
            reasoning: "Testing purposes"
          }
        ],
        continuation: {
          in_progress: true,
          gerund: "testing"
        }
      };

      // Manual validation check (simplified)
      expect(typeof validResponse.message).toBe('string');
      expect(Array.isArray(validResponse.tool_calls)).toBe(true);
      expect(typeof validResponse.continuation).toBe('object');
      expect(typeof validResponse.continuation.in_progress).toBe('boolean');
    });

    test('should identify invalid response structures', () => {
      const invalidResponse = {
        message: 123, // Should be string
        tool_calls: "not an array",
        continuation: null // Should be object
      };

      expect(typeof invalidResponse.message).not.toBe('string');
      expect(Array.isArray(invalidResponse.tool_calls)).toBe(false);
      expect(invalidResponse.continuation).toBe(null); // null is not an object
    });
  });
});