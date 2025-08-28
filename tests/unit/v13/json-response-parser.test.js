import { jest } from '@jest/globals';
import { AgentResponseParser } from '../../../scripts/core/json-response-parser.js';

describe('AgentResponseParser', () => {
  let mockAiService;
  let parser;
  let mockAbortSignal;

  beforeEach(() => {
    // Mock AI service
    mockAiService = {
      sendJsonMessage: jest.fn()
    };
    
    // Create parser instance
    parser = new AgentResponseParser(mockAiService);
    
    // Mock abort signal
    mockAbortSignal = {
      aborted: false
    };
  });

  describe('parseAgentResponse', () => {
    const validJsonResponse = JSON.stringify({
      message: "Test response",
      tool_calls: [],
      continuation: {
        in_progress: false,
        gerund: null
      }
    });

    test('should parse valid JSON response successfully', async () => {
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

    test('should parse valid JSON response with tool calls', async () => {
      const jsonWithTools = JSON.stringify({
        message: "I'll help you with that",
        tool_calls: [
          {
            tool_name: "test_tool",
            parameters: { param1: "value1" },
            reasoning: "This tool helps test functionality"
          }
        ],
        continuation: {
          in_progress: true,
          gerund: "processing"
        }
      });

      const result = await parser.parseAgentResponse(jsonWithTools, mockAbortSignal);
      
      expect(result.message).toBe("I'll help you with that");
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls[0].tool_name).toBe("test_tool");
      expect(result.continuation.in_progress).toBe(true);
    });

    test('should retry and recover from malformed JSON', async () => {
      const malformedJson = '{"message": "Test", "tool_calls": [], "continuation": {"in_progress": false'; // Missing closing braces
      
      mockAiService.sendJsonMessage.mockResolvedValueOnce(validJsonResponse);

      const result = await parser.parseAgentResponse(malformedJson, mockAbortSignal);
      
      expect(mockAiService.sendJsonMessage).toHaveBeenCalledTimes(1);
      expect(mockAiService.sendJsonMessage).toHaveBeenCalledWith(
        expect.stringContaining('JSON parsing error'),
        mockAbortSignal
      );
      expect(result.message).toBe("Test response");
    });

    test('should retry and recover from missing required fields', async () => {
      const incompleteJson = JSON.stringify({
        message: "Test response"
        // Missing tool_calls and continuation
      });
      
      mockAiService.sendJsonMessage.mockResolvedValueOnce(validJsonResponse);

      const result = await parser.parseAgentResponse(incompleteJson, mockAbortSignal);
      
      expect(mockAiService.sendJsonMessage).toHaveBeenCalledTimes(1);
      expect(result.message).toBe("Test response");
    });

    test('should validate field types correctly', async () => {
      const invalidTypesJson = JSON.stringify({
        message: 123, // Should be string
        tool_calls: "not an array",
        continuation: {
          in_progress: "not a boolean",
          gerund: null
        }
      });
      
      mockAiService.sendJsonMessage.mockResolvedValueOnce(validJsonResponse);

      const result = await parser.parseAgentResponse(invalidTypesJson, mockAbortSignal);
      
      expect(mockAiService.sendJsonMessage).toHaveBeenCalledTimes(1);
      expect(mockAiService.sendJsonMessage).toHaveBeenCalledWith(
        expect.stringContaining('Field "message" must be a string'),
        mockAbortSignal
      );
    });

    test('should provide detailed error context in retry messages', async () => {
      const malformedJson = '{"message": "This has a syntax error"'; // Missing closing brace
      
      mockAiService.sendJsonMessage.mockResolvedValueOnce(validJsonResponse);

      await parser.parseAgentResponse(malformedJson, mockAbortSignal);
      
      const errorMessage = mockAiService.sendJsonMessage.mock.calls[0][0];
      expect(errorMessage).toContain('JSON parsing error');
      expect(errorMessage).toContain('Problem occurred in this response snippet');
      expect(errorMessage).toContain('{"message": "This has a syntax error"');
      expect(errorMessage).toContain('You MUST respond with valid JSON');
    });

    test('should return fallback response after max retry attempts', async () => {
      const malformedJson = 'invalid json';
      
      // Mock AI service to keep returning malformed JSON
      mockAiService.sendJsonMessage.mockResolvedValue('still invalid json');

      const result = await parser.parseAgentResponse(malformedJson, mockAbortSignal);
      
      expect(mockAiService.sendJsonMessage).toHaveBeenCalledTimes(4); // 5 attempts total - 1 original = 4 retries
      expect(result).toEqual({
        message: "I encountered a formatting error and reached maximum retry attempts. Please try rephrasing your request.",
        tool_calls: [],
        continuation: {
          in_progress: false,
          gerund: null
        }
      });
    });

    test('should handle empty response gracefully', async () => {
      const emptyResponse = '';
      
      mockAiService.sendJsonMessage.mockResolvedValueOnce(validJsonResponse);

      const result = await parser.parseAgentResponse(emptyResponse, mockAbortSignal);
      
      expect(mockAiService.sendJsonMessage).toHaveBeenCalledTimes(1);
      const errorMessage = mockAiService.sendJsonMessage.mock.calls[0][0];
      expect(errorMessage).toContain('No response received');
    });

    test('should handle continuation object validation', async () => {
      const invalidContinuation = JSON.stringify({
        message: "Test response",
        tool_calls: [],
        continuation: null // Should be an object
      });
      
      mockAiService.sendJsonMessage.mockResolvedValueOnce(validJsonResponse);

      const result = await parser.parseAgentResponse(invalidContinuation, mockAbortSignal);
      
      expect(mockAiService.sendJsonMessage).toHaveBeenCalledTimes(1);
      // The error message should contain information about the missing required fields since continuation: null fails the initial check
      expect(mockAiService.sendJsonMessage).toHaveBeenCalledWith(
        expect.stringContaining('Missing required fields'),
        mockAbortSignal
      );
    });

    test('should track attempt numbers correctly', async () => {
      const malformedJson = 'invalid';
      
      // First retry returns malformed, second retry returns valid
      mockAiService.sendJsonMessage
        .mockResolvedValueOnce('still invalid')
        .mockResolvedValueOnce(validJsonResponse);

      const result = await parser.parseAgentResponse(malformedJson, mockAbortSignal);
      
      expect(game.simulacrum.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('(attempt 1/5)'),
        expect.any(String)
      );
      expect(game.simulacrum.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('(attempt 2/5)'),
        expect.any(String)
      );
    });

    test('should handle very long responses by truncating error snippets', async () => {
      const longMalformedJson = 'invalid json ' + 'x'.repeat(300);
      
      mockAiService.sendJsonMessage.mockResolvedValueOnce(validJsonResponse);

      await parser.parseAgentResponse(longMalformedJson, mockAbortSignal);
      
      const errorMessage = mockAiService.sendJsonMessage.mock.calls[0][0];
      expect(errorMessage).toContain('...');
      expect(errorMessage.indexOf('invalid json')).toBe(errorMessage.lastIndexOf('invalid json')); // Should only appear once in snippet
    });
  });
});