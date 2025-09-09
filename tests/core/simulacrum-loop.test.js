// SPDX-License-Identifier: MIT

import { SimulacrumCore } from '../../scripts/core/simulacrum-core.js';
import { toolRegistry } from '../../scripts/core/tool-registry.js';

// Mock AI client module to control chat responses
const mockChatFn = jest.fn();
jest.mock('../../scripts/core/ai-client.js', () => ({
  AIClient: jest.fn().mockImplementation(() => ({
    chat: mockChatFn
  }))
}));

function setupGameAndHooks() {
  global.game = {
    settings: {
      get: jest.fn()
    },
    user: { id: 'u1' },
    world: { id: 'w1' },
    i18n: {
      localize: jest.fn(key => key),
      format: jest.fn((key, data) => `${key} ${JSON.stringify(data)}`)
    }
  };
  global.Hooks = {
    callAll: jest.fn(),
    once: jest.fn(),
    on: jest.fn()
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
    // Arrange AI responses sequence
    mockChatFn
      // 1. Response for detectToolCallingSupport in onReady()
      .mockResolvedValueOnce({
        choices: [{ message: { content: '', tool_calls: [
          { id: 'probe_call', function: { name: 'list_documents', arguments: '{}' } }
        ] } }]
      })
      // 2. First call in processMessage returns a tool call
      .mockResolvedValueOnce({
        choices: [{ message: { content: '', tool_calls: [
          { id: 'call_1', function: { name: 'list_documents', arguments: JSON.stringify({ process_label: 'Working...' }) } }
        ] } }]
      })
      // 3. Second call in processMessage (after tool execution) returns final content
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Done.' } }]
      });

    // onReady will consume the first mock response for the tool support probe
    await SimulacrumCore.onReady();

    // Spy on executeTool to avoid executing real tools
    const execSpy = jest.spyOn(toolRegistry, 'executeTool').mockResolvedValue({ result: { content: 'tool output' } });

    // processMessage will consume the second and third mock responses
    const result = await SimulacrumCore.processMessage('List docs');

    expect(execSpy).toHaveBeenCalledWith('list_documents', expect.any(Object));
    expect(result).toBeDefined();
    expect(typeof result.content).toBe('string');
    expect(result.content).toContain('Done');

    // Verify assistant -> tool -> assistant sequence recorded
    const msgs = SimulacrumCore.conversationManager.getMessages();
    const roles = msgs.slice(-3).map(m => m.role);
    expect(roles).toEqual(['assistant', 'tool', 'assistant']);
  });
});
