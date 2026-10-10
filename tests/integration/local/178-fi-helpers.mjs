// #178 fault-injection harness — shared helpers.
//
// DESIGN PRINCIPLE (avoids the #209 anti-pattern): this harness drives the REAL
// production path end to end —
//     real ChatHandler -> real ConversationEngine -> real SimulacrumCore.generateResponse
//     -> real processToolCallLoop -> real tool execution -> real AIClient
//     over a REAL local HTTP endpoint.
// Only the LLM endpoint is scripted (a tiny local HTTP server that answers a fixed
// sequence and can hang/fail at a chosen request). AIClient.chat is NOT mocked: the
// real requestTimeout / NetworkError / retry / abort path runs.
//
// Exports: Foundry-global shim, a scripted-LLM HTTP server, an OpenAI response
// builder, and runRealChain() which drives the real chain and returns the
// user-visible outcome + the #202 loop timeline for one loopId.

import http from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';

// --- Foundry globals, stubbed BEFORE the production modules are imported. ---
let _settings = {};
let _idCounter = 0;
const _flags = new Map();

export function setSetting(key, value) {
  _settings[key] = value;
}
export function resetSettings() {
  _settings = {};
}

export function installGlobals() {
  globalThis.foundry = { utils: { randomID: () => `fi-178-${++_idCounter}` } };
  globalThis.Hooks = { callAll: () => {}, call: () => {} };
  globalThis.game = {
    world: { id: 'fi-178-world' },
    user: {
      getFlag: async (_s, k) => _flags.get(k) ?? null,
      setFlag: async (_s, k, v) => {
        _flags.set(k, v);
        return true;
      },
    },
    settings: {
      get: (scope, key) =>
        _settings[key] !== undefined
          ? _settings[key]
          : key === 'toolLoopLimit'
            ? 10
            : key === 'legacyMode'
              ? false
              : undefined,
      set: async () => true,
      register: () => {},
    },
    i18n: { localize: k => k },
    modules: { get: () => undefined },
    canvas: { ready: true },
  };
  globalThis.FormApplication = class {
    static get defaultOptions() {
      return {};
    }
    render() {}
    close() {}
  };
  globalThis.ui = { notifications: { info: () => {}, error: () => {} } };
  globalThis.document = { createElement: () => ({}) };
}

// --- OpenAI-style raw response builders (what the scripted endpoint returns) ---
export function rawToolCall(id, name, args, content = '') {
  return {
    model: 'fi-178-model',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
          tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
        },
        finish_reason: 'tool_calls',
      },
    ],
  };
}

export function rawText(content) {
  return {
    model: 'fi-178-model',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  };
}

// A single scripted endpoint step.
//   { kind:'ok', body }                    -> 200 + JSON body
//   { kind:'hang' }                        -> accept, never respond (wedged endpoint)
//   { kind:'http_error', status, body }    -> error status
export async function startScriptedLLM(steps, log = []) {
  let n = 0;
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      const reqNo = n + 1;
      n += 1;
      log.push({ reqNo, at: Date.now() });
      req.resume(); // drain request body
      const step = steps[Math.min(reqNo - 1, steps.length - 1)];
      if (!step) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'no scripted step' }));
        return;
      }
      if (step.kind === 'hang') {
        res.socket?.setKeepAlive(true);
        res.socket?.unref?.();
        return; // wedged endpoint: accepted, never responds
      }
      if (step.kind === 'http_error') {
        res.writeHead(step.status || 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(step.body || { error: 'server error' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(step.body));
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    port,
    baseURL: `http://127.0.0.1:${port}/v1`,
    requests: () => log.map(l => l.reqNo),
    close: () => {
      try {
        server.closeAllConnections?.();
      } catch {
        /* ignore */
      }
      server.close();
    },
  };
}

// Drive the REAL production chain for one user message and capture the outcome.
// options:
//   baseURL            - scripted endpoint base URL
//   requestTimeoutMs   - sets the AIClient requestTimeout (world setting) before run
//   emitFault(tr)      - if returns true, the loop-layer assistant-emit (handleToolResult) throws
//                        BEFORE the loop logs assistant_emitted (B3)
//   uiDrop(m)          - if returns true, the UI callback swallows/drops the message (B4)
//   message, signal, entriesBefore, conversationManager
export async function runRealChain(opts) {
  const { ChatHandler } = await import('../../../scripts/core/chat-handler.js');
  const { AIClient } = await import('../../../scripts/core/ai-client.js');
  const { SimulacrumCore } = await import('../../../scripts/core/simulacrum-core.js');
  const { interactionLogger } = await import('../../../scripts/core/interaction-logger.js');

  if (opts.requestTimeoutMs != null) setSetting('requestTimeout', opts.requestTimeoutMs);

  const aiClient = new AIClient({
    apiKey: 'fi-178-key',
    baseURL: opts.baseURL,
    model: 'fi-178-model',
  });
  SimulacrumCore.aiClient = aiClient;
  // The system prompt is not part of the boundary under test; the real builder
  // needs live macro/world state, so use a fixed prompt. (The loop's own
  // getSystemPrompt call goes through this same static.)
  SimulacrumCore.getSystemPrompt = async () => 'fi-178 test system prompt';
  SimulacrumCore.conversationManager = null; // no pre-loop compaction; the loop does its own

  const handler = new ChatHandler(opts.conversationManager);

  // B3 fault: throw at the loop-layer emit (handleToolResult) before assistant_emitted is logged.
  if (opts.emitFault) {
    const orig = handler.handleToolResult.bind(handler);
    handler.handleToolResult = async (toolResult, o) => {
      if (opts.emitFault(toolResult)) {
        throw new Error('INJECTED_EMIT_FAULT: assistant turn emit path failed');
      }
      return orig(toolResult, o);
    };
  }

  const uiSeen = [];
  const uiDropped = [];
  const notifications = [];
  const onAssistantMessage = async m => {
    if (opts.uiDrop && opts.uiDrop(m)) {
      uiDropped.push({ role: m.role, content: m.content, display: m.display });
      return;
    }
    uiSeen.push({ role: m.role, content: m.content, display: m.display });
  };

  const startedAt = Date.now();
  let result = undefined;
  let thrown = undefined;
  try {
    result = await handler.processUserMessage(opts.message, 'fi-178-user', {
      signal: opts.signal,
      onAssistantMessage,
      onUserMessage: () => {},
      onError: err => {
        notifications.push({ onError: true, originalMessage: err?.originalMessage, error: err?.error?.message });
      },
      onToolResult: () => {},
      onToolPending: () => {},
    });
  } catch (e) {
    thrown = e;
  }
  const elapsedMs = Date.now() - startedAt;

  const slice = interactionLogger._entries.slice(opts.entriesBefore);
  const loopIds = [...new Set(slice.filter(e => e.type === 'loop_event' && e.loopId).map(e => e.loopId))];
  const loopId = loopIds[loopIds.length - 1] || null;
  const timeline = slice.filter(e => e.loopId === loopId);

  // #178 auto-capture: the per-loopId timeline captured at loop_ended by the logger.
  const capturedTimeline =
    loopId && typeof interactionLogger.getCapturedLoopTimeline === 'function'
      ? interactionLogger.getCapturedLoopTimeline(loopId)
      : null;

  return {
    result,
    thrown,
    elapsedMs,
    uiSeen,
    uiDropped,
    notifications,
    loopId,
    timeline,
    capturedTimeline,
    conversationMessages: opts.conversationManager.messages.map(m => ({
      role: m.role,
      content: m.content,
      tool_call_id: m.tool_call_id,
    })),
  };
}

// Persist one loopId's timeline to a JSON trace file; returns the absolute path.
export function writeTimelineTrace(outDir, name, data) {
  mkdirSync(outDir, { recursive: true });
  const safe = String(name).replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = `${outDir}/loop-${safe}.timeline.json`;
  writeFileSync(path, JSON.stringify(data, null, 2));
  return path;
}
