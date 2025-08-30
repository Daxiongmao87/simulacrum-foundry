import { jest } from '@jest/globals';
import { AgentResponseParser } from '../../../scripts/core/agent-response-parser.js';

describe('AgentResponseParser - Natural Language + JSON Support', () => {
  let mockAiService;
  let parser;
  let mockAbortSignal;

  beforeEach(() => {
    // Mock AI service
    mockAiService = {
      sendJsonMessage: jest.fn(),
      sendWithSystemAddition: jest.fn()
    };
    
    // Create parser instance
    parser = new AgentResponseParser(mockAiService);
    
    // Mock abort signal
    mockAbortSignal = {
      aborted: false
    };
  });

  describe('parseAgentResponse', () => {
    test('should parse valid JSON response (backward compatibility)', async () => {
      const validJsonResponse = JSON.stringify({
        message: "Test response",
        tool_calls: [],
        continuation: {
          in_progress: false,
          gerund: null
        }
      });

      const result = await parser.parseAgentResponse(validJsonResponse, mockAbortSignal);
      
      expect(result).toEqual({
        message: "Test response",
        tool_calls: [],
        continuation: {
          in_progress: false,
          gerund: null
        }
      });
    });

    test('should parse natural language response', async () => {
      const naturalResponse = "I'll help you create that character. Let me search for existing NPCs first.";
      const result = await parser.parseAgentResponse(naturalResponse, mockAbortSignal);
      
      expect(result).toEqual({
        message: "I'll help you create that character. Let me search for existing NPCs first.",
        tool_calls: [],
        continuation: {
          in_progress: false,
          gerund: null
        }
      });
    });

    test('should parse JSON with tool calls', async () => {
      const jsonWithTools = JSON.stringify({
        message: "I'll help you with that",
        tool_calls: [
          {
            tool_name: "test_tool",
            parameters: { test: "value" },
            reasoning: "Testing the tool"
          }
        ],
        continuation: {
          in_progress: true,
          gerund: "testing"
        }
      });

      const result = await parser.parseAgentResponse(jsonWithTools, mockAbortSignal);
      
      expect(result.message).toBe("I'll help you with that");
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls[0].tool_name).toBe("test_tool");
      expect(result.continuation.in_progress).toBe(true);
    });

    test('should handle malformed JSON as natural language', async () => {
      const malformedJson = '{"message": "test", "tool_calls":'; // Missing closing
      
      const result = await parser.parseAgentResponse(malformedJson, mockAbortSignal);
      
      // No retry needed - malformed JSON is treated as natural language
      expect(mockAiService.sendWithSystemAddition).toHaveBeenCalledTimes(0);
      expect(result.message).toBe('{"message": "test", "tool_calls":');
      expect(result.tool_calls).toEqual([]);
      expect(result.continuation).toEqual({ in_progress: false, gerund: null });
    });

    test('should handle empty response gracefully', async () => {
      const emptyResponse = '';

      const result = await parser.parseAgentResponse(emptyResponse, mockAbortSignal);
      
      expect(result.message).toBe('I received an empty response. Please try again.');
      expect(result.tool_calls).toEqual([]);
      expect(result.continuation).toEqual({ in_progress: false, gerund: null });
    });

    test('should handle whitespace-only response', async () => {
      const whitespaceResponse = '   \n\t  ';

      const result = await parser.parseAgentResponse(whitespaceResponse, mockAbortSignal);
      
      expect(result.message).toBe('I received an empty response. Please try again.');
      expect(result.tool_calls).toEqual([]);
      expect(result.continuation).toEqual({ in_progress: false, gerund: null });
    });

    test('should handle JSON without required fields as natural language', async () => {
      const incompleteJson = JSON.stringify({
        message: "Test response"
        // Missing tool_calls and continuation
      });
      
      const result = await parser.parseAgentResponse(incompleteJson, mockAbortSignal);
      
      // Incomplete JSON treated as natural language since it lacks expected structure
      expect(result.message).toBe('{"message":"Test response"}');
      expect(result.tool_calls).toEqual([]);
      expect(result.continuation).toEqual({ in_progress: false, gerund: null });
    });

    test('should handle JSON parse failures as natural language', async () => {
      // When JSON.parse fails, content is treated as natural language
      const result = await parser.parseAgentResponse('{"test": "data"}', mockAbortSignal);
      
      // Should return the content as natural language (JSON.parse succeeded, but missing required fields)
      expect(result.message).toBe('{"test": "data"}');
      expect(result.tool_calls).toEqual([]);
      expect(result.continuation).toEqual({ in_progress: false, gerund: null });
    });
  });
});