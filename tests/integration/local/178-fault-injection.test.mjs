// #178 fault-injection harness — reproduction at the #202 instrumented boundaries.
//
// The invariant under test (#178): "A successful non-terminal tool call always
// results in another assistant turn."
//
// Sequence under test (each case, its own loopId, its own captured timeline):
//   scripted assistant turn with a tool call -> execute the tool (succeeds)
//   -> tool_results_committed -> continuation_requested -> next AI request
//   -> assistant turn emitted.
//
// This drives the REAL production path (ChatHandler -> ConversationEngine ->
// SimulacrumCore.generateResponse -> processToolCallLoop -> real tool execution ->
// real AIClient over a REAL local HTTP endpoint). ONLY the LLM endpoint is
// scripted. AIClient.chat is NOT mocked (the #209 anti-pattern is deliberately
// avoided): the real requestTimeout / NetworkError / retry / abort path runs.
//
// Fault injection is done entirely from the test layer (no production file
// changes): a scripted local endpoint (answer sequence + hang point), the
// requestTimeout world setting, a loop-layer emit fault (B3), and a UI-layer
// drop (B4).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '178-timelines');

import {
  installGlobals,
  setSetting,
  rawToolCall,
  rawText,
  startScriptedLLM,
  runRealChain,
  writeTimelineTrace,
} from './178-fi-helpers.mjs';

installGlobals();

const { toolRegistry } = await import('../../../scripts/core/tool-registry.js');
const { ConversationManager } = await import('../../../scripts/core/conversation.js');
const { interactionLogger } = await import('../../../scripts/core/interaction-logger.js');

before(() => {
  toolRegistry.registerDefaults();
});

after(() => {
  // Nothing global to tear down; each case closes its own server.
});

// --- Shared scripted turns ---
const FIRST_TOOL_CALL = rawToolCall('c1', 'list_documents', { justification: 'list my documents' });
const END_LOOP = rawToolCall('c2', 'end_loop', { reason: 'task_complete', justification: 'done' });
const CONTINUATION_TEXT = rawText('All done. I listed your documents.');

function makeConversation() {
  return new ConversationManager('fi-178-user', 'fi-178-world', 32000);
}

function eventsOf(timeline, name) {
  return timeline.filter(e => e.event === name);
}

function timelineNames(timeline) {
  return timeline.map(e => e.event);
}

function tracePath(result, extra = {}) {
  return writeTimelineTrace(
    OUT_DIR,
    result.loopId,
    {
      loopId: result.loopId,
      events: timelineNames(result.timeline),
      timeline: result.timeline,
      userVisible: {
        resultContent: result.result?.content,
        resultDisplay: result.result?.display,
        isFinalError: Boolean(result.result?.error),
        thrown: result.thrown ? { name: result.thrown.name, message: result.thrown.message } : null,
        uiAssistantTurns: result.uiSeen.filter(u => u.role === 'assistant' && (u.content || u.display)),
        uiDropped: result.uiDropped,
        notifications: result.notifications,
      },
      elapsedMs: result.elapsedMs,
      conversationRoles: result.conversationMessages.map(m => m.role),
      ...extra,
    }
  );
}

test('baseline (no fault): successful tool call -> continuation -> assistant turn emitted', async () => {
  const llm = await startScriptedLLM([
    { kind: 'ok', body: FIRST_TOOL_CALL },
    { kind: 'ok', body: CONTINUATION_TEXT },
    { kind: 'ok', body: END_LOOP },
  ]);
  try {
    const conversation = makeConversation();
    const entriesBefore = interactionLogger._entries.length;
    const result = await runRealChain({
      message: 'List my documents',
      baseURL: llm.baseURL,
      signal: new AbortController().signal,
      conversationManager: conversation,
      entriesBefore,
    });
    const path = tracePath(result, { case: 'baseline' });

    const names = timelineNames(result.timeline);
    assert.ok(names.includes('loop_started'), 'loop_started present');
    assert.ok(names.includes('tool_results_committed'), 'tool_results_committed present');
    assert.ok(
      names.includes('continuation_requested'),
      'continuation_requested present (invariant transition)'
    );
    assert.ok(eventsOf(result.timeline, 'api_request_finished').length >= 1, 'a continuation AI request finished');
    assert.ok(eventsOf(result.timeline, 'api_request_started').length >= 2, 'initial + continuation requests made');
    assert.ok(eventsOf(result.timeline, 'assistant_emitted').length >= 1, 'assistant_emitted present');
    const end = eventsOf(result.timeline, 'loop_ended');
    assert.equal(end.length, 1, 'exactly one loop_ended');
    assert.equal(end[0].details.reason, 'end_loop');

    const finalTurn = result.uiSeen.find(
      u => u.role === 'assistant' && u.content === 'All done. I listed your documents.'
    );
    assert.ok(finalTurn, 'continuation assistant turn reached the UI');

    console.log(`[baseline] loopId=${result.loopId} trace=${path}`);
    console.log(`[baseline] events: ${names.join(' -> ')}`);
  } finally {
    llm.close();
  }
}, { timeout: 20000 });

test('B1: after tool_results_committed, is continuation_requested guaranteed? (transition cannot disappear in current code)', async () => {
  const llm = await startScriptedLLM([
    { kind: 'ok', body: FIRST_TOOL_CALL },
    { kind: 'ok', body: CONTINUATION_TEXT },
    { kind: 'ok', body: END_LOOP },
  ]);
  try {
    const conversation = makeConversation();
    const entriesBefore = interactionLogger._entries.length;
    const result = await runRealChain({
      message: 'List my documents',
      baseURL: llm.baseURL,
      signal: new AbortController().signal,
      conversationManager: conversation,
      entriesBefore,
    });
    const path = tracePath(result, { case: 'B1' });
    const names = timelineNames(result.timeline);

    // DIAGNOSIS: in tool-loop-handler.js, after a successful non-end_loop tool
    // result the code UNCONDITIONALLY logs continuation_requested and enters
    // _getNextAIResponse (first attempt). There is no code path where
    // tool_results_committed is followed by loop_ended without a continuation.
    const committed = names.indexOf('tool_results_committed');
    assert.ok(committed >= 0, 'tool_results_committed present');
    const continuation = names.indexOf('continuation_requested', committed + 1);
    assert.ok(continuation > committed, 'continuation_requested immediately follows tool_results_committed');
    assert.ok(
      names.slice(committed + 1).includes('api_request_started'),
      'an AI request is actually made after the continuation'
    );

    console.log(`[B1] loopId=${result.loopId} trace=${path}`);
    console.log(`[B1] events: ${names.join(' -> ')}`);
    console.log('[B1] DIAGNOSIS: continuation is structurally guaranteed; this boundary cannot be made to drop a continuation without a production code change.');
  } finally {
    llm.close();
  }
}, { timeout: 20000 });

test('B2: api_request_started then endpoint hangs -> #209 bounded timeout, terminal request_timeout', async () => {
  setSetting('requestTimeout', 5000); // short configured timeout per mission
  const llm = await startScriptedLLM([
    { kind: 'ok', body: FIRST_TOOL_CALL },
    { kind: 'hang' }, // second request: accepted, never responds
  ]);
  try {
    const conversation = makeConversation();
    const entriesBefore = interactionLogger._entries.length;
    const started = Date.now();
    const result = await runRealChain({
      message: 'List my documents',
      baseURL: llm.baseURL,
      signal: new AbortController().signal,
      conversationManager: conversation,
      entriesBefore,
      requestTimeoutMs: 5000,
    });
    const wallMs = Date.now() - started;
    const path = tracePath(result, { case: 'B2', wallMs });
    const names = timelineNames(result.timeline);

    assert.ok(names.includes('api_request_started'), 'api_request_started present');
    assert.ok(wallMs < 12000, `loop settled within a bounded time (${wallMs}ms), not hung forever`);

    const end = eventsOf(result.timeline, 'loop_ended');
    assert.equal(end.length, 1, 'loop_ended present');
    assert.equal(end[0].details.reason, 'request_timeout', 'terminal reason is request_timeout (#209)');

    // The ONLY assistant_emitted is the iteration-1 tool-call anchor (hasContent:false).
    // No content-bearing assistant turn exists: the continuation turn was never produced.
    const emitted = eventsOf(result.timeline, 'assistant_emitted');
    assert.ok(
      !emitted.some(e => e.details?.hasContent === true),
      'no content-bearing assistant_emitted: the continuation turn was never produced'
    );

    // Exact user-visible outcome: chat-handler catch -> Network Error bubble.
    assert.ok(result.result?.error, 'final result is an error object');
    assert.match(String(result.result?.content), /AI request timed out after 5s/, 'timeout message surfaced');
    // NOTE: the 'Network Error' bubble branch in chat-handler matches only the
    // literal strings 'Failed to fetch'/'NetworkError'; a typed request-timeout
    // NetworkError falls to the generic `Error: ${error.message}` bubble.
    assert.match(String(result.result?.display), /AI request timed out after 5s/, 'user sees a plain error bubble with the timeout text');

    console.log(`[B2] loopId=${result.loopId} trace=${path} wallMs=${wallMs}`);
    console.log(`[B2] events: ${names.join(' -> ')}`);
    console.log(`[B2] user-visible: "${result.result?.content}" / display: "${result.result?.display}"`);
  } finally {
    llm.close();
  }
}, { timeout: 20000 });

test('B3: continuation returns a valid turn but the turn is lost (loop_ended WITHOUT assistant_emitted)', async () => {
  const llm = await startScriptedLLM([
    { kind: 'ok', body: FIRST_TOOL_CALL },
    { kind: 'ok', body: CONTINUATION_TEXT }, // second request returns a VALID assistant turn
  ]);
  try {
    const conversation = makeConversation();
    const entriesBefore = interactionLogger._entries.length;
    const result = await runRealChain({
      message: 'List my documents',
      baseURL: llm.baseURL,
      signal: new AbortController().signal,
      conversationManager: conversation,
      entriesBefore,
      // Injected fault in the continuation/emit path: the loop-layer assistant
      // emit (handleToolResult) throws BEFORE assistant_emitted is logged.
      // Injected fault in the continuation/emit path: the loop-layer assistant
      // emit (handleToolResult) throws ONLY for the continuation text turn, i.e.
      // AFTER request 2 returned a valid turn and AFTER the loop re-entered the
      // iteration. This models the turn being lost in the emit path.
      emitFault: tr => tr?.role === 'assistant' && tr?.content === 'All done. I listed your documents.',
    });
    const path = tracePath(result, { case: 'B3' });
    const names = timelineNames(result.timeline);

    assert.ok(names.includes('api_request_finished'), 'continuation request finished (valid turn returned)');
    // The valid turn was produced by the model (request 2 finished) yet the loop
    // ended WITHOUT emitting it (assistant_emitted for that turn is absent).
    const emitted = eventsOf(result.timeline, 'assistant_emitted');
    assert.ok(
      !emitted.some(e => e.details?.hasContent === true),
      'no assistant_emitted WITH content: the valid continuation turn was lost'
    );
    const end = eventsOf(result.timeline, 'loop_ended');
    assert.equal(end.length, 1, 'loop_ended present');
    assert.notEqual(end[0].details.reason, 'end_loop', 'loop ended abnormally, not via end_loop');
    assert.match(String(end[0].details.reason), /error|INJECTED/i, 'loop_ended reflects the emitted-path fault');

    const finalTurn = result.uiSeen.find(u => u.content === 'All done. I listed your documents.');
    assert.ok(!finalTurn, 'valid continuation turn did NOT reach the UI');

    console.log(`[B3] loopId=${result.loopId} trace=${path}`);
    console.log(`[B3] events: ${names.join(' -> ')}`);
    console.log(`[B3] loop_ended reason: ${end[0].details.reason}; valid turn lost: ${!finalTurn}`);
  } finally {
    llm.close();
  }
}, { timeout: 20000 });

test('B4: assistant_emitted fires but the UI emission is lost (render/emit layer drop)', async () => {
  const llm = await startScriptedLLM([
    { kind: 'ok', body: FIRST_TOOL_CALL },
    { kind: 'ok', body: CONTINUATION_TEXT },
  ]);
  try {
    const conversation = makeConversation();
    const entriesBefore = interactionLogger._entries.length;
    const result = await runRealChain({
      message: 'List my documents',
      baseURL: llm.baseURL,
      signal: new AbortController().signal,
      conversationManager: conversation,
      entriesBefore,
      // Injected fault in the render/emit layer: the UI callback swallows the
      // continuation assistant turn (assistant_emitted already logged at loop layer).
      uiDrop: m => m?.role === 'assistant' && m?.content === 'All done. I listed your documents.',
    });
    const path = tracePath(result, { case: 'B4' });
    const names = timelineNames(result.timeline);

    assert.ok(eventsOf(result.timeline, 'assistant_emitted').length >= 1, 'assistant_emitted fired (loop layer)');
    const end = eventsOf(result.timeline, 'loop_ended');
    assert.equal(end.length, 1, 'loop_ended present');
    // A text-only continuation with a dropped UI emission repeats until the
    // circuit breaker trips (no end_loop is ever reached in this fault).
    assert.equal(end[0].details.reason, 'circuit_breaker');

    // The UI-layer emission of the continuation turn was lost:
    assert.ok(
      result.uiDropped.some(u => u.content === 'All done. I listed your documents.'),
      'turn was dropped at the UI layer (assistant_emitted fired, render lost)'
    );
    // Observed: the engine's final-response path re-emits the content, so the
    // user may still see the text via a second, independent path.
    const finalTurn = result.uiSeen.find(u => u.content === 'All done. I listed your documents.');
    console.log(`[B4] note: final-response re-emission present=${Boolean(finalTurn)}`);

    console.log(`[B4] loopId=${result.loopId} trace=${path}`);
    console.log(`[B4] events: ${names.join(' -> ')}`);
    console.log('[B4] assistant_emitted fired but UI dropped the turn.');
  } finally {
    llm.close();
  }
}, { timeout: 20000 });
