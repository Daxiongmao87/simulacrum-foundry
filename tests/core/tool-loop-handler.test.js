/**
 * @jest-environment jsdom
 */

import { processToolCallLoop } from '../../scripts/core/tool-loop-handler.js';
import { AI_ERROR_CODES } from '../../scripts/core/ai-client.js';
import { SimulacrumCore } from '../../scripts/core/simulacrum-core.js';

describe('tool-loop-handler module imports', () => {
  test('should import all required dependencies without errors', () => {
    expect(processToolCallLoop).toBeDefined();
    expect(typeof processToolCallLoop).toBe('function');
  });

  test('should import isDiagnosticsEnabled from dev utils', async () => {
    const { isDiagnosticsEnabled } = await import('../../scripts/utils/dev.js');
    expect(isDiagnosticsEnabled).toBeDefined();
    expect(typeof isDiagnosticsEnabled).toBe('function');
  });

  test('should import createLogger from logger utils', async () => {
    const { createLogger } = await import('../../scripts/utils/logger.js');
    expect(createLogger).toBeDefined();
    expect(typeof createLogger).toBe('function');
  });

  test('should import toolRegistry from tool-registry', async () => {
    const { toolRegistry } = await import('../../scripts/core/tool-registry.js');
    expect(toolRegistry).toBeDefined();
  });

  test('should import performPostToolVerification from tool-verification', async () => {
    const { performPostToolVerification } = await import('../../scripts/core/tool-verification.js');
    expect(performPostToolVerification).toBeDefined();
    expect(typeof performPostToolVerification).toBe('function');
  });
});

describe('Tool Fallback Behavior', () => {
  let mockConversationManager;
  let mockAIClient;
  let originalExecuteTool;
  
  const createMockConversationManager = () => ({
    messages: [],
    addMessage(role, content, toolCalls, toolCallId) {
      this.messages.push({ role, content, toolCalls, toolCallId });
    },
    getMessages() {
      return this.messages;
    }
  });

  const createMockAIClient = () => ({
    calls: [],
    chat(messages, tools) {
      this.calls.push({ messages, tools });
      return Promise.resolve({
        choices: [{
          message: {
            content: 'Task completed',
            tool_calls: []
          }
        }]
      });
    },
    chatWithSystem(messages, _getSystemPrompt, tools) {
      this.calls.push({ messages, tools });
      return Promise.resolve({
        choices: [{
          message: {
            content: 'Task completed',
            tool_calls: []
          }
        }]
      });
    }
  });
  
  beforeEach(async () => {
    mockConversationManager = createMockConversationManager();
    mockAIClient = createMockAIClient();
    
    // Mock tool registry's executeTool method
    const { toolRegistry } = await import('../../scripts/core/tool-registry.js');
    originalExecuteTool = toolRegistry.executeTool;
  });
  
  afterEach(async () => {
    // Restore original method
    if (originalExecuteTool) {
      const { toolRegistry } = await import('../../scripts/core/tool-registry.js');
      toolRegistry.executeTool = originalExecuteTool;
    }
  });

  const getSystemPrompt = () => 'Test system prompt';
  
  const mockTools = [
    {
      type: 'function',
      function: {
        name: 'test_tool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            data: { type: 'string' }
          }
        }
      }
    }
  ];

  test('should disable tool calling after critical execution errors', async () => {
    const { toolRegistry } = await import('../../scripts/core/tool-registry.js');
    
    // Mock tool execution to fail with "global is not defined"
    toolRegistry.executeTool = jest.fn().mockRejectedValue(
      new Error('global is not defined')
    );
    
    const initialResponse = {
      content: 'I will execute a tool',
      display: 'I will execute a tool',
      toolCalls: [{
        id: 'test-call-1',
        function: {
          name: 'test_tool',
          arguments: JSON.stringify({ data: 'test' })
        }
      }],
      model: 'test-model',
      usage: { total_tokens: 100 }
    };

    await processToolCallLoop(
      initialResponse,
      mockTools,
      mockConversationManager,
    mockAIClient,
    getSystemPrompt,
    true // toolCallingSupported initially true
  );

    // Check that at least one call was made
    expect(mockAIClient.calls.length).toBeGreaterThan(0);
    
    // Find calls after the first tool execution failure
    const callsAfterFailure = mockAIClient.calls.slice(1);
    
    if (callsAfterFailure.length > 0) {
      // Subsequent calls should not include tools due to the critical error
      callsAfterFailure.forEach(call => {
        expect(call.tools).toBeNull();
      });
    }
  });

  test('should continue with tools for non-critical errors', async () => {
    const { toolRegistry } = await import('../../scripts/core/tool-registry.js');
    
    // Mock tool execution to fail with a non-critical error
    toolRegistry.executeTool = jest.fn().mockRejectedValue(
      new Error('Some other error')
    );
    
    const initialResponse = {
      content: 'I will execute a tool',
      display: 'I will execute a tool',
      toolCalls: [{
        id: 'test-call-1',
        function: {
          name: 'test_tool',
          arguments: JSON.stringify({ data: 'test' })
        }
      }],
      model: 'test-model',
      usage: { total_tokens: 100 }
    };

    await processToolCallLoop(
      initialResponse,
      mockTools,
      mockConversationManager,
      mockAIClient,
      getSystemPrompt,
      true // toolCallingSupported initially true
    );

    // All calls should still include tools since it's not a critical error
    mockAIClient.calls.forEach(call => {
      expect(call.tools).toEqual(mockTools);
    });
  });

  test('should respect initial toolCallingSupported=false', async () => {
    const initialResponse = {
      content: 'I will execute a tool',
      display: 'I will execute a tool',
      toolCalls: [{
        id: 'test-call-1',
        function: {
          name: 'test_tool',
          arguments: JSON.stringify({ data: 'test' })
        }
      }],
      model: 'test-model',
      usage: { total_tokens: 100 }
    };

    await processToolCallLoop(
      initialResponse,
      mockTools,
      mockConversationManager,
      mockAIClient,
      getSystemPrompt,
      false // toolCallingSupported initially false
    );

    // All calls should not include tools
    mockAIClient.calls.forEach(call => {
      expect(call.tools).toBeNull();
    });
  });

  test('retries malformed tool calls before executing tools', async () => {
    const { toolRegistry } = await import('../../scripts/core/tool-registry.js');

    toolRegistry.executeTool = jest.fn().mockResolvedValue({
      success: true,
      result: { content: 'Execution result' }
    });

    const mockAIClientWithRetry = createMockAIClient();
    mockAIClientWithRetry.chatWithSystem = jest.fn()
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: 'Retry plan',
            tool_calls: [{
              id: 'retry-call-1',
              function: { name: 'test_tool', arguments: JSON.stringify({ data: 'fixed' }) }
            }]
          }
        }]
      })
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: 'Final response',
            tool_calls: []
          }
        }]
      });

    const initialResponse = {
      content: '',
      display: '',
      errorCode: AI_ERROR_CODES.TOOL_CALL_FAILURE,
      errorMetadata: { provider: 'gemini' },
      _originalResponse: {
        candidates: [{
          content: {
            parts: [{ functionCall: { name: 'test_tool', args: {} } }]
          }
        }]
      },
      toolCalls: [{
        id: 'initial-call-1',
        function: {
          name: 'test_tool',
          arguments: JSON.stringify({ data: 'invalid' })
        }
      }]
    };

    const result = await processToolCallLoop(
      initialResponse,
      mockTools,
      mockConversationManager,
      mockAIClientWithRetry,
      getSystemPrompt,
      true
    );

    expect(mockAIClientWithRetry.chatWithSystem).toHaveBeenCalledTimes(2);
    expect(toolRegistry.executeTool).toHaveBeenCalledTimes(1);
    expect(result.toolCalls).toEqual([]);

    const assistantCorrection = mockConversationManager.messages.find(msg => msg.role === 'assistant' && msg.content.includes('Previous tool call'));
    const systemCorrection = mockConversationManager.messages.find(msg => msg.role === 'system' && msg.content.includes('invalid or malformed arguments'));

    expect(assistantCorrection).toBeTruthy();
    expect(systemCorrection).toBeTruthy();
  });

  test('falls back to plain response when tool call failures persist', async () => {
    const { toolRegistry } = await import('../../scripts/core/tool-registry.js');
    toolRegistry.executeTool = jest.fn();

    const mockAIClientWithFailures = createMockAIClient();
    mockAIClientWithFailures.chatWithSystem = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: 'Plain fallback response',
            tool_calls: []
          }
        }]
      });

    const normalizeSpy = jest.spyOn(SimulacrumCore, '_normalizeAIResponse');
    try {
      normalizeSpy
        .mockReturnValueOnce({
          content: '',
          display: '',
          errorCode: AI_ERROR_CODES.TOOL_CALL_FAILURE,
          toolCalls: []
        })
        .mockReturnValueOnce({
          content: '',
          display: '',
          errorCode: AI_ERROR_CODES.TOOL_CALL_FAILURE,
          toolCalls: []
        })
        .mockReturnValueOnce({
          content: 'Plain fallback response',
          display: 'Plain fallback response',
          toolCalls: []
        });

      const initialResponse = {
        content: '',
        display: '',
        errorCode: AI_ERROR_CODES.TOOL_CALL_FAILURE,
        errorMetadata: { provider: 'gemini' },
        _originalResponse: {
          candidates: [{
            content: {
              parts: [{ functionCall: { name: 'test_tool', args: {} } }]
            }
          }]
        },
        toolCalls: [{
          id: 'initial-call-1',
          function: {
            name: 'test_tool',
            arguments: JSON.stringify({ data: 'invalid' })
          }
        }]
      };

      const result = await processToolCallLoop(
        initialResponse,
        mockTools,
        mockConversationManager,
        mockAIClientWithFailures,
        getSystemPrompt,
        true
      );

      expect(mockAIClientWithFailures.chatWithSystem).toHaveBeenCalledTimes(3);
      expect(toolRegistry.executeTool).not.toHaveBeenCalled();
      expect(result.content).toContain('Tool functionality was temporarily unavailable');
      expect(result.toolCalls).toEqual([]);

      const lastCall = mockAIClientWithFailures.chatWithSystem.mock.calls.at(-1);
      expect(lastCall?.[2]).toBeNull();
    } finally {
      normalizeSpy.mockRestore();
    }
  });
});
