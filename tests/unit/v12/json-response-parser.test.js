import { jest } from '@jest/globals';
import { AgentResponseParser } from '../../../scripts/core/json-response-parser.js';

describe('AgentResponseParser', () => {
  let mockAiService;
  let parser;

  beforeEach(() => {
    // Mock AI service with both methods
    mockAiService = {
      sendMessage: jest.fn(),
      sendJsonMessage: jest.fn()
    };
    
    // Create parser instance
    parser = new AgentResponseParser(mockAiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
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
      const result = await parser.parseAgentResponse(validJsonResponse);
      
      expect(result).toEqual({
        message: "Test response",
        tool_calls: [],
        continuation: {
          in_progress: false,
          gerund: null
        }
      });
      expect(mockAiService.sendJsonMessage).not.toHaveBeenCalled();
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

      const result = await parser.parseAgentResponse(jsonWithTools);
      
      expect(result.message).toBe("I'll help you with that");
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls[0].tool_name).toBe("test_tool");
      expect(result.continuation.in_progress).toBe(true);
      expect(mockAiService.sendJsonMessage).not.toHaveBeenCalled();
    });

    test('should retry and recover from malformed JSON', async () => {
      const malformedJson = '{"message": "Test", "tool_calls": [], "continuation": {"in_progress": false'; // Missing closing braces
      
      mockAiService.sendJsonMessage.mockResolvedValueOnce(validJsonResponse);

      const result = await parser.parseAgentResponse(malformedJson);
      
      expect(mockAiService.sendJsonMessage).toHaveBeenCalledTimes(1);
      expect(mockAiService.sendJsonMessage).toHaveBeenCalledWith('Please respond in the required JSON format.');
      expect(result.message).toBe("Test response");
    });

    test('should retry and recover from missing required fields', async () => {
      const incompleteJson = JSON.stringify({
        message: "Test response"
        // Missing tool_calls and continuation
      });
      
      mockAiService.sendJsonMessage.mockResolvedValueOnce(validJsonResponse);

      const result = await parser.parseAgentResponse(incompleteJson);
      
      expect(mockAiService.sendJsonMessage).toHaveBeenCalledTimes(1);
      expect(mockAiService.sendJsonMessage).toHaveBeenCalledWith('Please respond in the required JSON format.');
      expect(result.message).toBe("Test response");
    });

    test('should handle multiple retry attempts until success', async () => {
      const malformedJson = '{"invalid": "json"';
      const firstRetryJson = '{"message": "Still invalid"}'; // Missing fields
      const secondRetryJson = validJsonResponse;

      mockAiService.sendJsonMessage
        .mockResolvedValueOnce(firstRetryJson)
        .mockResolvedValueOnce(secondRetryJson);

      const result = await parser.parseAgentResponse(malformedJson);

      expect(result.message).toBe("Test response");
      expect(mockAiService.sendJsonMessage).toHaveBeenCalledTimes(2);
      expect(mockAiService.sendJsonMessage).toHaveBeenNthCalledWith(1, 'Please respond in the required JSON format.');
      expect(mockAiService.sendJsonMessage).toHaveBeenNthCalledWith(2, 'Please respond in the required JSON format.');
    });

    test('should validate all required fields are present', async () => {
      const testCases = [
        { message: "test" }, // Missing tool_calls and continuation
        { tool_calls: [] }, // Missing message and continuation
        { continuation: { in_progress: false } }, // Missing message and tool_calls
        { message: "test", tool_calls: [] }, // Missing continuation
        { message: "test", continuation: { in_progress: false } }, // Missing tool_calls
        { tool_calls: [], continuation: { in_progress: false } } // Missing message
      ];

      for (const testCase of testCases) {
        mockAiService.sendJsonMessage.mockResolvedValueOnce(validJsonResponse);
        
        const result = await parser.parseAgentResponse(JSON.stringify(testCase));
        
        expect(result.message).toBe("Test response");
        expect(mockAiService.sendJsonMessage).toHaveBeenCalledWith('Please respond in the required JSON format.');
      }

      expect(mockAiService.sendJsonMessage).toHaveBeenCalledTimes(testCases.length);
    });

    test('should log error details for debugging', async () => {
      const malformedJson = '{"message": "Test", invalid json here';
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      mockAiService.sendJsonMessage.mockResolvedValueOnce(validJsonResponse);

      await parser.parseAgentResponse(malformedJson);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Simulacrum | Parsing error (attempt 1/10), retrying:',
        expect.any(String)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'Simulacrum | Problematic JSON:',
        malformedJson
      );
      
      consoleSpy.mockRestore();
    });

    test('should handle empty or null responses', async () => {
      const testCases = ['', '   ', 'null', 'undefined'];
      
      for (const testCase of testCases) {
        mockAiService.sendJsonMessage.mockResolvedValueOnce(validJsonResponse);
        
        const result = await parser.parseAgentResponse(testCase);
        
        expect(result.message).toBe("Test response");
        expect(mockAiService.sendJsonMessage).toHaveBeenCalledWith('Please respond in the required JSON format.');
      }
    });

    test('should return fallback response after max retries (10 attempts)', async () => {
      const malformedJson = 'invalid json';
      
      // Mock AI service to always return malformed JSON
      mockAiService.sendJsonMessage.mockResolvedValue('still invalid json');

      const result = await parser.parseAgentResponse(malformedJson);
      
      expect(mockAiService.sendJsonMessage).toHaveBeenCalledTimes(9); // Initial failure + 9 retries = 10 total attempts
      expect(result).toEqual({
        message: "I encountered persistent JSON formatting errors after 10 attempts. Please try rephrasing your request.",
        tool_calls: [],
        continuation: {
          in_progress: false,
          gerund: null
        }
      });
    });

    test('should log attempt numbers correctly', async () => {
      const malformedJson = 'invalid';
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // First retry returns malformed, second retry returns valid
      mockAiService.sendJsonMessage
        .mockResolvedValueOnce('still invalid')
        .mockResolvedValueOnce(validJsonResponse);

      const result = await parser.parseAgentResponse(malformedJson);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Simulacrum | Parsing error (attempt 1/10), retrying:',
        expect.any(String)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'Simulacrum | Parsing error (attempt 2/10), retrying:',
        expect.any(String)
      );
      
      consoleSpy.mockRestore();
      expect(result.message).toBe("Test response");
    });
  });
});