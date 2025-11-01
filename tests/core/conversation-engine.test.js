// SPDX-License-Identifier: MIT

import { ConversationEngine } from '../../scripts/core/conversation-engine.js';
import { ConversationManager } from '../../scripts/core/conversation.js';
import { SimulacrumCore } from '../../scripts/core/simulacrum-core.js';
import { AI_ERROR_CODES } from '../../scripts/core/ai-client.js';

describe('ConversationEngine tool failure recovery', () => {
  let generateResponseMock;
  let hooksCallMock;

  beforeEach(() => {
    jest.useFakeTimers();
    hooksCallMock = jest.fn();
    global.Hooks = { call: hooksCallMock };
    generateResponseMock = jest.spyOn(SimulacrumCore, 'generateResponse');
  });

  afterEach(() => {
    generateResponseMock.mockRestore();
    jest.useRealTimers();
    delete global.Hooks;
  });

  const flushNextTimer = async () => {
    if (typeof jest.runOnlyPendingTimersAsync === 'function') {
      await jest.runOnlyPendingTimersAsync();
    } else {
      jest.runOnlyPendingTimers();
    }
  };

  test('retries tool call failures with fallback notice and tool-free request', async () => {
    const toolFailure = () => ({ errorCode: AI_ERROR_CODES.TOOL_CALL_FAILURE, _originalResponse: { candidates: [] } });
    const fallbackSuccess = { content: 'Plain response', display: 'Plain response', toolCalls: [] };

    generateResponseMock
      .mockResolvedValueOnce(toolFailure())
      .mockResolvedValueOnce(toolFailure())
      .mockResolvedValueOnce(toolFailure())
      .mockResolvedValueOnce(fallbackSuccess);

    const cm = new ConversationManager('user', 'world');
    cm.addMessage('user', 'hello');
    const engine = new ConversationEngine(cm);
    const onAssistantMessage = jest.fn();

    const responsePromise = engine.processTurn({ onAssistantMessage });

    await Promise.resolve();
    expect(generateResponseMock).toHaveBeenCalledTimes(1);

    await flushNextTimer();
    await Promise.resolve();
    expect(generateResponseMock).toHaveBeenCalledTimes(2);

    await flushNextTimer();
    await Promise.resolve();
    expect(generateResponseMock).toHaveBeenCalledTimes(3);

    const result = await responsePromise;

    expect(generateResponseMock).toHaveBeenCalledTimes(4);
    expect(generateResponseMock.mock.calls[3][1]).toMatchObject({ tools: null });

    expect(result.content).toContain('Note: Tool functionality was temporarily unavailable for this response.');
    expect(result.toolCalls).toEqual([]);

    expect(onAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('Tool functionality was temporarily unavailable'),
    }));

    const statusCalls = hooksCallMock.mock.calls
      .filter(([hook]) => hook === 'simulacrum:processStatus')
      .map(([, payload]) => payload)
      .filter(Boolean);

    const retryLabels = statusCalls
      .filter(payload => payload.state === 'start')
      .map(payload => payload.label);

    expect(retryLabels).toContain('Retrying request (attempt 2 of 3)...');
    expect(retryLabels).toContain('Retrying request (attempt 3 of 3)...');
  });
});

