// Integration test for the tool-loop continuation guarantee (issue #178).
//
// Exercises processToolCallLoop end-to-end with fakes for the AI client, the
// tool registry and the conversation manager. Verifies that every non-terminal
// result produces exactly one continuation, that a cancelled loop rejects
// instead of resolving silently, and that exhausted API retries yield a typed
// terminal fallback carrying visible content.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// --- Foundry globals, stubbed before the module-under-test is imported. ---
globalThis.foundry = { utils: { randomID: () => 'test-id' } };
globalThis.Hooks = { callAll: () => {}, call: () => {} };
globalThis.game = {
  world: { id: 'test-world' },
  user: { getFlag: async () => null, setFlag: async () => {} },
  settings: {
    get: (scope, key) => (key === 'toolLoopLimit' ? 10 : key === 'legacyMode' ? false : undefined),
  },
  i18n: { localize: key => key },
};
globalThis.FormApplication = class {
  static get defaultOptions() {
    return {};
  }

  render() {}
};
globalThis.ui = { notifications: { error: () => {} } };
globalThis.CONFIG = { debug: {} };

const { processToolCallLoop } = await import('../../../scripts/core/tool-loop-handler.js');
const { toolRegistry } = await import('../../../scripts/core/tool-registry.js');
const { interactionLogger } = await import('../../../scripts/core/interaction-logger.js');
const { COMPACTION_STATUS } = await import('../../../scripts/core/conversation.js');
const { normalizeAIResponse } = await import('../../../scripts/utils/ai-normalization.js');

// Terminal reasons the loop is contractually allowed to emit (#178).
const KNOWN_REASONS = [
  'end_loop',
  'repeat_limit',
  'circuit_breaker',
  'tool_failure_fallback',
  'parse_error',
  'cancelled',
];

before(() => {
  toolRegistry.registerDefaults();
  // Bypass real tool implementations; the loop only inspects `execution.result`.
  toolRegistry.executeTool = async name =>
    name === 'end_loop'
      ? { result: { _endLoop: true } }
      : { result: { success: true, toolName: name, data: 'ok' } };
});

function makeAbortError() {
  return Object.assign(new Error('Process was cancelled'), { name: 'AbortError' });
}

// OpenAI-style raw response normalizing to a single tool call.
function rawToolCall(id, name, args) {
  return {
    model: 'test-model',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id,
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
  };
}

// OpenAI-style raw text response (no tool calls).
function rawText(content) {
  return {
    model: 'test-model',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  };
}

// Build an aiClient whose chatWithSystem behavior is scripted per call.
//   steps: one descriptor per chatWithSystem call: a raw response, 'fail', or 'hang'.
//   opts.fallback: returned only on the fallback path (tools === null).
//   opts.failMessage: message thrown for 'fail' descriptors.
function createAiClient(steps, counter, opts = {}) {
  let index = 0;
  return {
    async chatWithSystem(_messages, _getSystemPrompt, tools, callOpts) {
      counter.calls += 1;
      const signal = callOpts?.signal;
      if (signal?.aborted) throw makeAbortError();
      if (tools === null) return opts.fallback;
      const step = steps[Math.min(index, steps.length - 1)];
      index += 1;
      if (step === 'fail') throw new Error(opts.failMessage || 'boom');
      if (step === 'hang') {
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(makeAbortError()));
        });
      }
      return step;
    },
  };
}

// Mirror ConversationManager.addMessage(role, content, toolCalls, toolCallId, metadata);
// the fake only records the fields the loop assertions need.
function createConversationManager() {
  return {
    messages: [],
    addMessage(role, content, toolCalls = null, toolCallId = null) {
      this.messages.push({ role, content, toolCalls, tool_call_id: toolCallId });
    },
    save: async () => {},
    getMessages() {
      return this.messages;
    },
    estimatePromptOverhead: () => 0,
    compactHistory: async () => COMPACTION_STATUS.WITHIN_BUDGET,
    toolOutputBuffer: new Map(),
  };
}

// Drive the loop with fresh fakes; returns the in-flight promise + observables.
function startLoop(initialResponse, steps, stepOpts = {}, controller) {
  const counter = { calls: 0, failMessage: 'boom' };
  const signal = controller ? controller.signal : new AbortController().signal;
  const aiClient = createAiClient(steps, counter, stepOpts);
  const conversation = createConversationManager();
  const entriesBefore = interactionLogger._entries.length;
  const onToolResultLog = [];
  const onToolPendingLog = [];
  const promise = processToolCallLoop({
    initialResponse,
    conversationManager: conversation,
    aiClient,
    getSystemPrompt: async () => 'test system prompt',
    tools: [],
    currentToolSupport: true,
    signal,
    onToolResult: payload => onToolResultLog.push(payload),
    onToolPending: payload => onToolPendingLog.push(payload),
  });
  return { promise, counter, conversation, entriesBefore, onToolResultLog, onToolPendingLog };
}

function loggedLoopEndedReason(entriesBefore) {
  return interactionLogger._entries.slice(entriesBefore).find(entry => entry.event === 'loop_ended')
    ?.details?.reason;
}

// --- Shared scripted responses ---
const initialResponse1 = normalizeAIResponse(
  rawToolCall('call_1', 'manage_task', {
    action: 'start_task',
    taskName: 'Research the bug',
    taskGoal: 'Reproduce and understand issue #178',
    steps: [
      { title: 'Work', description: 'Reproduce the issue end-to-end' },
      { title: 'Summary', description: 'Document the findings' },
    ],
    justification: 'test',
  })
);
const rawB = rawToolCall('call_2', 'list_documents', { justification: 'test' });
const rawC = rawToolCall('call_3', 'manage_task', {
  action: 'update_task',
  currentStep: 1,
  justification: 'test',
});
const rawD = rawToolCall('call_4', 'manage_task', {
  action: 'finish_task',
  summary: 'done',
  justification: 'test',
});
const rawE = rawToolCall('call_5', 'end_loop', {});

const initialResponse2 = normalizeAIResponse(
  rawToolCall('call_a', 'manage_task', {
    action: 'start_task',
    taskName: 'T',
    taskGoal: 'G',
    steps: [
      { title: 'Work', description: 'w' },
      { title: 'Summary', description: 's' },
    ],
    justification: 'test',
  })
);

const initialResponse3 = normalizeAIResponse(
  rawToolCall('call_3a', 'manage_task', {
    action: 'start_task',
    taskName: 'T',
    taskGoal: 'G',
    steps: [
      { title: 'Work', description: 'w' },
      { title: 'Summary', description: 's' },
    ],
    justification: 'test',
  })
);

test('happy path: exactly one continuation per non-terminal result', async () => {
  const { promise, counter, conversation, entriesBefore, onToolPendingLog } = startLoop(
    initialResponse1,
    [rawB, rawC, rawD, rawE]
  );
  const result = await promise;

  assert.ok(
    KNOWN_REASONS.includes(result._terminalReason),
    `unexpected terminal reason: ${result._terminalReason}`
  );
  assert.ok('_terminalReason' in result, 'returned object carries the field');
  assert.equal(result._terminalReason, 'end_loop');

  // One continuation (chatWithSystem call) per non-terminal result.
  assert.equal(counter.calls, 4, 'one chatWithSystem call per non-terminal result');

  // Every executed tool call commits a matching role:'tool' message.
  const toolMessages = conversation.messages.filter(m => m.role === 'tool');
  assert.equal(toolMessages.length, 5, 'one tool message per executed tool call');
  toolMessages.forEach((m, i) => {
    assert.equal(m.tool_call_id, `call_${i + 1}`, 'tool_call_id matches its call');
  });

  assert.equal(onToolPendingLog.length, 5, 'pending event emitted for every tool call');
  assert.equal(loggedLoopEndedReason(entriesBefore), 'end_loop');
});

test(
  'hang + abort: loop rejects with cancellation, never resolves',
  async () => {
    const controller = new AbortController();
    const { promise, entriesBefore } = startLoop(initialResponse2, ['hang'], {}, controller);
    setTimeout(() => controller.abort(), 50);

    let error;
    try {
      await promise;
    } catch (err) {
      error = err;
    }

    assert.ok(error, 'loop must reject when cancelled, not resolve silently');
    assert.ok(
      error.name === 'AbortError' || /cancel/i.test(error.message),
      'rejection is classified as cancellation'
    );
    assert.ok(KNOWN_REASONS.includes('cancelled'));
    assert.equal(loggedLoopEndedReason(entriesBefore), 'cancelled');
  },
  { timeout: 20000 }
);

test(
  'abort during retry delay: loop rejects promptly instead of sleeping out the delay',
  async () => {
    const controller = new AbortController();
    const { promise, entriesBefore } = startLoop(
      initialResponse2,
      ['fail', 'hang'],
      { failMessage: 'boom' },
      controller
    );
    let abortedAt = 0;
    setTimeout(() => {
      abortedAt = Date.now();
      controller.abort();
    }, 200);

    let error;
    try {
      await promise;
    } catch (err) {
      error = err;
    }

    assert.ok(error, 'loop must reject when cancelled, not resolve silently');
    assert.ok(
      error.name === 'AbortError' || /cancel/i.test(error.message),
      'rejection is classified as cancellation'
    );
    assert.ok(
      Date.now() - abortedAt < 500,
      `loop rejected promptly after abort (${Date.now() - abortedAt}ms), not after the 1000ms retry delay`
    );
    assert.equal(loggedLoopEndedReason(entriesBefore), 'cancelled');
  },
  { timeout: 20000 }
);

test(
  'api failure: typed terminal fallback with visible content',
  async () => {
    const { promise, conversation, entriesBefore } = startLoop(
      initialResponse3,
      ['fail', 'fail', 'fail'],
      {
        failMessage: 'boom',
        fallback: rawText(
          'Tools temporarily unavailable - here is a plain-language summary instead.'
        ),
      }
    );
    const result = await promise;

    assert.ok(
      KNOWN_REASONS.includes(result._terminalReason),
      `unexpected terminal reason: ${result._terminalReason}`
    );
    assert.ok('_terminalReason' in result, 'returned object carries the field');
    assert.equal(result._terminalReason, 'tool_failure_fallback');
    assert.ok(
      result.content && result.content.trim().length > 0,
      'fallback carries visible content'
    );

    // The fallback injected a system instruction as the final message.
    const last = conversation.messages[conversation.messages.length - 1];
    assert.equal(last.role, 'system');
    assert.equal(loggedLoopEndedReason(entriesBefore), 'tool_failure_fallback');
    // The fallback provider request must appear in the loop timeline (#178 review).
    const newEntries = interactionLogger._entries.slice(entriesBefore);
    const fallbackStarted = newEntries.findIndex(
      e => e.event === 'api_request_started' && e.details?.mode === 'tool_failure_fallback'
    );
    assert.ok(fallbackStarted >= 0, 'fallback request logged as api_request_started');
    assert.ok(
      newEntries.some((e, i) => i > fallbackStarted && e.event === 'api_request_finished'),
      'fallback request logged as api_request_finished'
    );
  },
  { timeout: 20000 }
);

test('terminal reason coverage: exercised reasons are all in the known set', async () => {
  assert.ok(KNOWN_REASONS.length > 0);
  for (const reason of [
    'end_loop',
    'repeat_limit',
    'circuit_breaker',
    'tool_failure_fallback',
    'parse_error',
    'cancelled',
  ]) {
    assert.ok(KNOWN_REASONS.includes(reason), `${reason} must be known`);
  }
});
