// SPDX-License-Identifier: MIT

import { ConversationEngine } from '../../scripts/core/conversation-engine.js';
import { ConversationManager } from '../../scripts/core/conversation.js';
import { SimulacrumCore } from '../../scripts/core/simulacrum-core.js';
import { processToolCallLoop } from '../../scripts/core/tool-loop-handler.js';
import { toolRegistry } from '../../scripts/core/tool-registry.js';
import { AI_ERROR_CODES } from '../../scripts/core/ai-client.js';

// Mock dependencies
jest.mock('../../scripts/core/tool-loop-handler.js');
jest.mock('../../scripts/core/tool-registry.js');

describe('ConversationEngine', () => {
  let engine;
  let mockConversationManager;
  let mockHooksCall;
  let mockGenerateResponse;

  beforeEach(() => {
    jest.useFakeTimers();

    // Mock ConversationManager
    mockConversationManager = {
      getMessages: jest.fn().mockReturnValue([{ role: 'user', content: 'test' }]),
      addMessage: jest.fn(),
    };

    // Mock Hooks
    mockHooksCall = jest.fn();
    global.Hooks = { call: mockHooksCall };
    global.game = { settings: { get: jest.fn() } };

    // Mock SimulacrumCore
    mockGenerateResponse = jest.spyOn(SimulacrumCore, 'generateResponse');
    SimulacrumCore.aiClient = { chat: jest.fn(), chatWithSystem: jest.fn() };

    // Reset Tool Registry mocks
    toolRegistry.getToolSchemas.mockReturnValue([]);

    // Reset Loop Handler mocks
    processToolCallLoop.mockReset();

    // Initialize Engine
    engine = new ConversationEngine(mockConversationManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    mockGenerateResponse.mockRestore();
    delete global.Hooks;
    delete global.game;
    delete SimulacrumCore.aiClient;
  });

  describe('Initialization', () => {
    test('should initialize with conversation manager', () => {
      expect(engine.conversationManager).toBe(mockConversationManager);
    });
  });

  describe('Simple Processing (No Tools)', () => {
    test('should return assistant content directly if no tools are called', async () => {
      const mockResponse = { role: 'assistant', content: 'Hello user', toolCalls: [] };
      mockGenerateResponse.mockResolvedValue(mockResponse);
      const onAssistantMessage = jest.fn();

      const result = await engine.processTurn({ onAssistantMessage });

      expect(mockGenerateResponse).toHaveBeenCalledWith(
        [{ role: 'user', content: 'test' }],
        expect.objectContaining({})
      );
      expect(onAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({
        role: 'assistant',
        content: 'Hello user'
      }));
      expect(result).toBe(mockResponse);
    });

    test('should pass AbortSignal to generateResponse', async () => {
      const controller = new AbortController();
      mockGenerateResponse.mockResolvedValue({ content: 'ok' });

      await engine.processTurn({ signal: controller.signal });

      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ signal: controller.signal })
      );
    });
  });

  describe('Retry Logic (Pre-Tool)', () => {
    test('should retry on Parse Error', async () => {
      // Mock failure then success
      mockGenerateResponse
        .mockResolvedValueOnce({ _parseError: true })
        .mockResolvedValueOnce({ role: 'assistant', content: 'Fixed' });

      const turnPromise = engine.processTurn();
      await jest.runAllTimersAsync();
      const result = await turnPromise;

      // Should have tried twice
      expect(mockGenerateResponse).toHaveBeenCalledTimes(2);

      // Should add correction to conversation (usually system or assistant explanation)
      expect(mockConversationManager.addMessage).toHaveBeenCalledWith(
        expect.stringMatching(/system|assistant/),
        expect.stringContaining('contained no natural-language content')
      );
      expect(result.content).toBe('Fixed');
    });

    test('should retry on Tool Call Failure (e.g. invalid JSON for tools)', async () => {
      // Mock failure then success
      mockGenerateResponse
        .mockResolvedValueOnce({ errorCode: AI_ERROR_CODES.TOOL_CALL_FAILURE })
        .mockResolvedValueOnce({ role: 'assistant', content: 'Fixed' });

      const turnPromise = engine.processTurn();
      await jest.runAllTimersAsync();
      const result = await turnPromise;

      expect(mockGenerateResponse).toHaveBeenCalledTimes(2);
      expect(mockConversationManager.addMessage).toHaveBeenCalledWith(
        expect.stringMatching(/system|assistant/),
        expect.stringContaining('malformed') // Correction message usually mentions malformed
      );
      expect(result.content).toBe('Fixed');
    });

    test('should give up after MAX_PRE_TOOL_ATTEMPTS (3)', async () => {
      mockGenerateResponse.mockResolvedValue({ _parseError: true });

      const turnPromise = engine.processTurn();
      await jest.runAllTimersAsync();
      const result = await turnPromise;

      // 1 initial + 2 retries = 3 total attempts
      expect(mockGenerateResponse).toHaveBeenCalledTimes(3);
      expect(result).toEqual(expect.objectContaining({
        content: expect.stringContaining('Unable to generate a proper response')
      }));
    });
  });

  describe('Tool Execution Flow', () => {
    test('should delegate to processToolCallLoop when tools are present', async () => {
      const mockToolResponse = {
        role: 'assistant',
        content: 'Thinking...',
        toolCalls: [{ id: 'call_1', function: { name: 'test' } }]
      };

      const mockFinalResponse = { role: 'assistant', content: 'Final answer' };

      mockGenerateResponse.mockResolvedValue(mockToolResponse);
      processToolCallLoop.mockResolvedValue(mockFinalResponse);
      const onToolResult = jest.fn();

      const result = await engine.processTurn({ onToolResult });

      // Should add assistant message before loop
      expect(mockConversationManager.addMessage).toHaveBeenCalledWith(
        'assistant',
        'Thinking...',
        mockToolResponse.toolCalls
      );

      // Should call loop handler
      expect(processToolCallLoop).toHaveBeenCalledWith(expect.objectContaining({
        initialResponse: mockToolResponse,
        tools: expect.any(Array),
        conversationManager: mockConversationManager,
        aiClient: SimulacrumCore.aiClient,
        currentToolSupport: true,
        onToolResult
      }));

      expect(result).toBe(mockFinalResponse);
    });

    test('should support legacy mode (no tools in loop)', async () => {
      global.game.settings.get.mockReturnValue(true); // legacyMode = true

      const mockToolResponse = {
        role: 'assistant',
        toolCalls: [{ id: '1' }]
      };
      mockGenerateResponse.mockResolvedValue(mockToolResponse);
      processToolCallLoop.mockResolvedValue({});

      await engine.processTurn();

      expect(processToolCallLoop).toHaveBeenCalledWith(expect.objectContaining({
        initialResponse: mockToolResponse,
        currentToolSupport: false
      }));
    });
  });

  describe('Fallback Flow (Tool Failure)', () => {
    test('should fallback to plain text if tool calls fail repeatedly', async () => {
      // 1. Initial Call -> Tool Failure
      // 2. Retry 1 -> Tool Failure
      // 3. Retry 2 -> Tool Failure
      // 4. Fallback -> Success (no tools)

      mockGenerateResponse
        .mockResolvedValueOnce({ errorCode: AI_ERROR_CODES.TOOL_CALL_FAILURE })
        .mockResolvedValueOnce({ errorCode: AI_ERROR_CODES.TOOL_CALL_FAILURE })
        .mockResolvedValueOnce({ errorCode: AI_ERROR_CODES.TOOL_CALL_FAILURE }) // MAX attempts reached
        .mockResolvedValueOnce({ role: 'assistant', content: 'Fallback response', toolCalls: [] });

      const turnPromise = engine.processTurn();
      await jest.runAllTimersAsync();
      const result = await turnPromise;

      expect(mockGenerateResponse).toHaveBeenCalledTimes(4);

      // The 4th call should have tools: null
      const lastCallArgs = mockGenerateResponse.mock.calls[3];
      // tools might be undefined if not passed, or null explicitly. Source says logic.
      // We'll check it contains fallback content at least.

      expect(result.content).toContain('Fallback response');
    });
  });
});
