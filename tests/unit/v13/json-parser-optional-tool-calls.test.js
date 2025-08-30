import { jest } from '@jest/globals';
import { AgentResponseParser } from '../../../scripts/core/json-response-parser.js';

describe('AgentResponseParser - Optional tool_calls', () => {
  let parser;
  let mockAIService;

  beforeEach(() => {
    mockAIService = {
      sendJsonMessage: jest.fn(),
      sendWithSystemAddition: jest.fn()
    };
    parser = new AgentResponseParser(mockAIService);

    // Reset console mocks
    global.game = {
      simulacrum: {
        logger: {
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn()
        }
      }
    };
  });

  test('should accept response with empty tool_calls array', async () => {
    const response = JSON.stringify({
      message: "Hello! How can I help you today?",
      tool_calls: [],
      continuation: {
        in_progress: false,
        gerund: null
      }
    });

    const result = await parser.parseAgentResponse(response);
    
    expect(result).toEqual({
      message: "Hello! How can I help you today?",
      tool_calls: [],
      continuation: {
        in_progress: false,
        gerund: null
      }
    });
  });

  test('should accept response with omitted tool_calls (undefined)', async () => {
    const response = JSON.stringify({
      message: "Hello! Nice to meet you!",
      continuation: {
        in_progress: false,
        gerund: null
      }
    });

    const result = await parser.parseAgentResponse(response);
    
    // Parser should add empty array for tool_calls
    expect(result).toEqual({
      message: "Hello! Nice to meet you!",
      tool_calls: [],
      continuation: {
        in_progress: false,
        gerund: null
      }
    });
  });

  test('should accept response with null tool_calls', async () => {
    const response = JSON.stringify({
      message: "I understand your question.",
      tool_calls: null,
      continuation: {
        in_progress: false,
        gerund: null
      }
    });

    const result = await parser.parseAgentResponse(response);
    
    // Parser should convert null to empty array
    expect(result).toEqual({
      message: "I understand your question.",
      tool_calls: [],
      continuation: {
        in_progress: false,
        gerund: null
      }
    });
  });

  test('should accept response with populated tool_calls', async () => {
    const response = JSON.stringify({
      message: "I'll search for that information.",
      tool_calls: [
        {
          tool_name: "search_documents",
          parameters: { query: "dragon" },
          reasoning: "Searching for dragon-related content"
        }
      ],
      continuation: {
        in_progress: true,
        gerund: "searching"
      }
    });

    const result = await parser.parseAgentResponse(response);
    
    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls[0].tool_name).toBe("search_documents");
  });

  test('should reject response with invalid tool_calls type', async () => {
    const response = JSON.stringify({
      message: "This should fail",
      tool_calls: "not an array",
      continuation: {
        in_progress: false,
        gerund: null
      }
    });

    // Mock the retry message to avoid actual API call
    mockAIService.sendWithSystemAddition.mockResolvedValue(JSON.stringify({
      message: "I corrected the format error.",
      tool_calls: [],
      continuation: {
        in_progress: false,
        gerund: null
      }
    }));

    const result = await parser.parseAgentResponse(response);
    
    expect(game.simulacrum.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Parsing error'),
      expect.stringContaining('tool_calls')
    );
    expect(result.message).toBe("I corrected the format error.");
  });

  test('should handle simple conversational responses', async () => {
    const simpleResponses = [
      {
        message: "Hello! How are you?",
        continuation: { in_progress: false, gerund: null }
      },
      {
        message: "The weather in your campaign world is up to you to decide!",
        continuation: { in_progress: false, gerund: null }
      },
      {
        message: "That's an interesting question about game mechanics.",
        continuation: { in_progress: false, gerund: null }
      }
    ];

    for (const expected of simpleResponses) {
      const result = await parser.parseAgentResponse(JSON.stringify(expected));
      
      expect(result.message).toBe(expected.message);
      expect(result.tool_calls).toEqual([]);
      expect(result.continuation.in_progress).toBe(false);
    }
  });
});