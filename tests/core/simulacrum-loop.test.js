// SPDX-License-Identifier: MIT

import { SimulacrumCore } from '../../scripts/core/simulacrum-core.js';
import { toolRegistry } from '../../scripts/core/tool-registry.js';

// Mock AI client module to control chat responses
jest.mock('../../scripts/core/ai-client.js', () => ({
  AIClient: jest.fn().mockImplementation(() => ({
    chat: jest.fn()
  }))
}));

function setupGameAndHooks() {
  global.game = {
    settings: {
      get: jest.fn()
    },
    user: { id: 'u1' },
    world: { id: 'w1' }
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
    // Arrange AI responses sequence: first with tool_calls, then final answer
    await SimulacrumCore.onReady();
    const mockChat = jest.spyOn(SimulacrumCore.aiClient, 'chat');
    mockChat
      // First call returns a tool call
      .mockResolvedValueOnce({
        choices: [{ message: { content: '', tool_calls: [
          { id: 'call_1', function: { name: 'list_documents', arguments: JSON.stringify({ process_label: 'Working...' }) } }
        ] } }]
      })
      // Second call returns final content
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Done.' } }]
      });

    // Spy on executeTool to avoid executing real tools
    const execSpy = jest.spyOn(toolRegistry, 'executeTool').mockResolvedValue({ result: { content: 'tool output' } });

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
