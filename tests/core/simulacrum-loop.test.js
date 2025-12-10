// SPDX-License-Identifier: MIT

import { SimulacrumCore } from '../../scripts/core/simulacrum-core.js';
import { toolRegistry } from '../../scripts/core/tool-registry.js';

// Mock AI client module to control chat responses
// Mock AI client module to control chat responses
jest.mock('../../scripts/core/ai-client.js', () => ({
  AIClient: jest.fn().mockImplementation(() => ({
    chat: jest.fn(),
    chatWithSystem: jest.fn()
  })),
  AI_ERROR_CODES: {
    TOOL_CALL_FAILURE: 'TOOL_CALL_FAILURE'
  }
}));

// Mock tool loop handler to spy on it, but use actual implementation for logic?
// Easier: Just spy on toolRegistry to see if it's reached.
// If it's not reached, assume processToolCallLoop is not called or arguments bad.
// I will add a log to see Result of processMessage
// But first, let's try to verify if `ai-normalization` works by unit testing IT separately?
// No, integration test.

// Adding console log to ConversationEngine logic requires editing source.
// I will try to Mock ToolRegistry completely to trace calls.
jest.mock('../../scripts/core/conversation.js', () => ({
  ConversationManager: jest.fn().mockImplementation(() => ({
    getMessages: jest.fn().mockReturnValue([
      { role: 'user', content: 'List docs' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', function: { name: 'list_documents', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'call_1', content: 'tool output' },
      { role: 'assistant', content: 'Done.' }
    ]),
    addMessage: jest.fn(),
    save: jest.fn(),
    load: jest.fn(),
    clear: jest.fn(),
    setupPeriodicSave: jest.fn(),
    getPersistenceKey: jest.fn().mockReturnValue('mock-key')
  }))
}));

jest.mock('../../scripts/core/tool-registry.js', () => ({
  toolRegistry: {
    executeTool: jest.fn().mockResolvedValue({ result: { content: 'tool output' } }),
    getToolSchemas: jest.fn().mockReturnValue([{ name: 'list_documents', function: { name: 'list_documents' } }]),
    registerDefaults: jest.fn(),
    registerTool: jest.fn(),
    hasTool: jest.fn().mockReturnValue(true),
    getTool: jest.fn().mockReturnValue({ execute: jest.fn() })
  }
}));

function setupGameAndHooks() {
  global.game = {
    settings: {
      get: jest.fn()
    },
    user: { id: 'u1' },
    world: { id: 'w1' },
    macros: { forEach: jest.fn() },
    packs: {
      filter: jest.fn().mockReturnValue([]),
      get: jest.fn().mockReturnValue({
        get: jest.fn(),
        getIndex: jest.fn().mockResolvedValue([])
      })
    },
    collections: { get: jest.fn() },
    i18n: { localize: jest.fn(str => str), format: jest.fn(str => str) }
  };
  global.Hooks = {
    callAll: jest.fn(),
    once: jest.fn(),
    on: jest.fn()
  };
  global.foundry = {
    utils: {
      randomID: jest.fn().mockReturnValue('mock-id')
    }
  };
}

describe('Simulacrum tool-calling loop integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupGameAndHooks();
    // Provide required settings
    game.settings.get
      .mockReturnValueOnce('sk-test')               // apiKey
      .mockReturnValueOnce('https://api.openai.com/v1') // baseURL
      .mockReturnValueOnce('gpt-3.5-turbo');        // model
  });

  it('executes tool then produces final assistant message', async () => {
    // Arrange AI responses sequence: first with tool_calls, then final answer
    await SimulacrumCore.onReady();

    // We need to verify that conversationManager is set on SimulacrumCore
    // Since onReady initializes it using the (mocked) ConversationManager class

    const mockChat = jest.spyOn(SimulacrumCore.aiClient, 'chatWithSystem');
    mockChat
      // First call: AI proposes a tool call
      .mockResolvedValueOnce({
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              { id: 'call_1', type: 'function', function: { name: 'list_documents', arguments: JSON.stringify({ process_label: 'Working...' }) } }
            ]
          },
          finish_reason: 'tool_calls'
        }]
      })
      // Second call: AI sees tool output and responds
      .mockResolvedValueOnce({
        choices: [{
          message: { role: 'assistant', content: 'Done.' },
          finish_reason: 'stop'
        }]
      });

    const result = await SimulacrumCore.processMessage('List docs');

    // Verify tool execution
    expect(toolRegistry.executeTool).toHaveBeenCalledWith('list_documents', expect.any(Object));

    // Verify result is the final assistant message
    expect(result).toBeDefined();
    expect(result.content).toBe('Done.');

    // Verify chat loop:
    // 1. Initial user message (handled by processMessage caller usually, but here processMessage calls aiClient.chatWithSystem with history)
    // Actually SimulacrumCore.processMessage gets history from ConversationManager.
    // The mocked ConversationManager.getMessages() returns a fixed array, which we mocked above.
    // So checking SimulacrumCore.conversationManager.getMessages() is not proving the LOOP added messages.
    // We should check calls to addMessage on the conversation manager mock.

    const cm = SimulacrumCore.conversationManager;
    // Expect: 
    // 1. 'user' message 'List docs' added (by processMessage)
    // 2. 'assistant' message with tool_calls added (by loop)
    // 3. 'tool' message added (by loop)
    // 4. 'assistant' final response added (by loop)

    expect(cm.addMessage).toHaveBeenCalledWith('user', 'List docs', null, null);
    expect(cm.addMessage).toHaveBeenCalledWith('assistant', '', expect.arrayContaining([
      expect.objectContaining({ id: 'call_1' })
    ]));
    // Tool result message
    expect(cm.addMessage).toHaveBeenCalledWith('tool', expect.stringContaining('tool output'), null, 'call_1');
    // Final assistant reply
    expect(cm.addMessage).toHaveBeenCalledWith('assistant', 'Done.', null, null);
  });
});
