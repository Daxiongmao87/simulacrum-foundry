/**
 * AI normalization utilities (shared)
 */
import { createLogger, isDebugEnabled } from './logger.js';
import { toolRegistry } from '../core/tool-registry.js';

/**
 * Sanitize messages for providers without native tool support.
 * Keeps only system/user/assistant roles and non-empty string content.
 */
export function sanitizeMessagesForFallback(messages) {
  try {
    return (messages || [])
      .filter(m => {
        const r = m && m.role;
        if (r !== 'system' && r !== 'user' && r !== 'assistant' && r !== 'developer') return false;
        const c = typeof m.content === 'string' ? m.content.trim() : '';
        return c.length > 0;
      })
      .map((m, i) => {
        // Downgrade 'developer' to 'user' in fallback mode (no provider detection available)
        if (m.role === 'developer') {
          return { role: 'user', content: `[DEVELOPER CORRECTION] ${String(m.content)}` };
        }
        // Downgrade mid-conversation 'system' to 'user' (position 0 is fine)
        if (m.role === 'system' && i > 0) {
          return { role: 'user', content: `[SYSTEM CORRECTION] ${String(m.content)}` };
        }
        return { role: m.role, content: String(m.content) };
      });
  } catch {
    return [];
  }
}

/**
 * Normalize AI response into consistent format.
 * Preserves existing behavior from SimulacrumCore._normalizeAIResponse.
 */
export function normalizeAIResponse(raw) {
  // 1. Check if already normalized
  if (typeof raw?.content === 'string' && !raw.choices && !raw.candidates) {
    return _handleAlreadyNormalized(raw);
  }

  // 2. Check for Gemini format
  if (Array.isArray(raw?.candidates) && raw.candidates.length > 0) {
    return _handleGeminiFormat(raw);
  }

  // 3. Check for Responses API style (prioritize over OpenAI fallback to fix unreachable code bug)
  if (Array.isArray(raw?.output) && raw.output[0] && raw.output[0].content) {
    return _handleResponsesAPIFormat(raw);
  }

  // 4. Fallback to OpenAI format (standard)
  return _handleOpenAIFormat(raw);
}

/**
 * Parse a tool_call from a fenced JSON block in the assistant's content.
 * Strict parser ported from SimulacrumCore._parseInlineToolCall.
 */
export function parseInlineToolCall(text) {
  if (!text || typeof text !== 'string') return null;

  const cleanText = _cleanThinkTags(text);
  if (!cleanText) return null;

  const match = cleanText.match(/```json([\s\S]*?)```/i);
  if (!match) return null;

  const block = (match[1] || '').trim();
  const obj = _tryParseFallbackJson(block);

  if (!obj) {
    return { parseError: 'Invalid JSON', content: block };
  }

  return _extractToolCallFromObject(obj, cleanText, match[0]);
}

function _cleanThinkTags(text) {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  if (!clean || !clean.trim()) return null;

  try {
    if (isDebugEnabled() && text !== clean) {
      _logThinkTagStats(text.length, clean.length, text.includes('<think>'));
    }
  } catch {
    /* empty */
  }
  return clean;
}

function _logThinkTagStats(orig, clean, hasTags) {
  createLogger('AIDiagnostics').info('think_tag_filtered', {
    originalLength: orig,
    cleanedLength: clean,
    hadThinkTags: hasTags,
  });
}

function _tryParseFallbackJson(block) {
  const obj = _tryParseJSON(block);
  if (!obj) {
    try {
      if (isDebugEnabled())
        createLogger('AIDiagnostics').warn('fallback.parse.json_error', { content: block });
    } catch {
      /* empty */
    }
  }
  return obj;
}

// --- Internal Helper Functions ---

function _attachProviderMetadata(payload, source) {
  const result = { ...payload, raw: source };
  if (source && source.errorCode) result.errorCode = source.errorCode;
  if (source && source.errorMetadata) result.errorMetadata = source.errorMetadata;

  // New: Standardized metadata persistence
  if (source) {
    result.provider_metadata = {
      original_response: source._originalResponse || source,
    };
  }

  if (source && source._originalResponse) {
    result._originalResponse = source._originalResponse;
  } else if (!result._originalResponse) {
    result._originalResponse = source;
  }
  return result;
}

function _handleAlreadyNormalized(raw) {
  if (!raw.content || raw.content.trim().length === 0) {
    _logEmptyResponse('already-normalized', raw);
    return _createErrorResponse(
      'Empty response not allowed - please provide a meaningful response to the user.',
      raw
    );
  }

  return _attachProviderMetadata(
    {
      content: raw.content,
      display: raw.display ?? raw.content,
      toolCalls: raw.toolCalls ?? raw.tool_calls ?? [],
      model: raw.model,
      usage: raw.usage,
    },
    raw
  );
}

function _handleGeminiFormat(raw) {
  const candidate = raw.candidates.find(c => c?.content?.parts) || raw.candidates[0];
  const parts = candidate?.content?.parts || [];
  const textSegments = [];
  const toolCalls = [];

  for (const part of parts) {
    if (part?.functionCall) {
      const fc = part.functionCall;
      toolCalls.push({
        id: fc?.name
          ? `gemini_${fc.name}_${toolCalls.length + 1}`
          : `gemini_call_${toolCalls.length + 1}`,
        function: {
          name: fc?.name || 'unknown_function',
          arguments: JSON.stringify(fc?.args ?? {}),
        },
      });
    } else if (typeof part?.text === 'string') {
      textSegments.push(part.text);
    }
  }

  const combinedText = textSegments.join('\n').trim();
  return _attachProviderMetadata(
    {
      content: combinedText,
      display: combinedText,
      toolCalls,
      model: raw?.model,
      usage: raw?.usage,
    },
    raw
  );
}

function _handleResponsesAPIFormat(raw) {
  const parts = raw.output[0].content;
  const text = Array.isArray(parts)
    ? parts
        .map(p => p?.text ?? '')
        .filter(Boolean)
        .join('\n')
    : '';

  return _attachProviderMetadata(
    {
      content: text || '',
      display: text || '',
      toolCalls: [],
      model: raw?.model,
      usage: raw?.usage,
    },
    raw
  );
}

function _handleOpenAIFormat(raw) {
  const { content, toolCalls } = _extractOpenAIData(raw);

  if ((!content || content.trim().length === 0) && (!toolCalls || toolCalls.length === 0)) {
    _logEmptyResponse('OpenAI-style', raw);
    return _createErrorResponse(
      'Empty response not allowed - please provide a meaningful response to the user.',
      raw
    );
  }

  const normalized = {
    content,
    display: content,
    toolCalls,
    model: raw?.model,
    usage: raw?.usage,
  };

  _applyInlineFallback(normalized);
  _logToolCalls(normalized.toolCalls);
  return _attachProviderMetadata(normalized, raw);
}

function _extractOpenAIData(raw) {
  const choice = Array.isArray(raw?.choices) ? raw.choices[0] : undefined;
  const msg = choice?.message ?? {};
  const content = typeof msg.content === 'string' ? msg.content : '';
  let toolCalls = msg.tool_calls || [];

  if ((!toolCalls || toolCalls.length === 0) && msg.function_call?.name) {
    toolCalls = [
      {
        id: msg.function_call.id,
        function: { name: msg.function_call.name, arguments: msg.function_call.arguments },
      },
    ];
  }

  // Repair malformed tool-call arguments before they enter history. Truncated
  // JSON here would otherwise cause a provider 500 on the next turn when the
  // assistant message is replayed.
  toolCalls = Array.isArray(toolCalls) ? toolCalls.map(normalizeToolCallArguments) : toolCalls;
  return { content, toolCalls };
}

/**
 * Normalizes tool-call arguments by attempting repair and ensuring they
 * are stored/sent as valid JSON strings. (Tracked in #145)
 * @param {object} tc - The tool call object
 * @returns {object} The normalized tool call
 */
export function normalizeToolCallArguments(tc) {
  if (!tc) return tc;
  const fn = tc.function;
  const rawArgs = fn?.arguments ?? tc.arguments;

  // Handle null/undefined by coercing to empty object string
  if (rawArgs == null) {
    const emptyArgs = '{}';
    if (fn) return { ...tc, function: { ...fn, arguments: emptyArgs } };
    return { ...tc, arguments: emptyArgs };
  }

  const outcome = repairToolCallArguments(rawArgs);

  // If already a valid JSON string and not repaired, early return
  if (typeof rawArgs === 'string' && outcome.ok && !outcome.repaired) return tc;

  const name = fn?.name || tc.name || 'unknown';
  const nextArgsString = outcome.ok
    ? outcome.argsString
    : _makeMalformedArgumentSentinelString(outcome.parseError, rawArgs);
  _logToolCallRepair(name, outcome);

  if (fn) {
    return { ...tc, function: { ...fn, arguments: nextArgsString } };
  }
  return { ...tc, arguments: nextArgsString };
}

function _logToolCallRepair(name, outcome) {
  try {
    const diag = createLogger('AIDiagnostics');
    if (outcome.ok && isDebugEnabled()) {
      diag.warn('tool_call.args.repaired', { name });
    } else if (!outcome.ok) {
      diag.warn('tool_call.args.unrecoverable', { name, error: outcome.parseError });
    }
  } catch {
    /* ignore */
  }
}

function _makeMalformedArgumentSentinelString(parseError, rawFragment) {
  const raw = typeof rawFragment === 'string' ? rawFragment : '';
  const sentinel = {
    __simulacrumParseError: true,
    parseError: String(parseError || 'unknown parse error'),
    rawFragment: raw.slice(0, 500),
  };
  return JSON.stringify(sentinel);
}

function _okResult(argsObject, argsString, repaired) {
  return { ok: true, argsObject, argsString, repaired, parseError: null };
}

function _failResult(argsString, parseError) {
  return { ok: false, argsObject: null, argsString, repaired: false, parseError };
}

/**
 * Attempt to parse tool-call arguments, applying narrow repairs for common
 * malformed outputs (trailing commas, single quotes, truncated closers).
 * Returns an outcome object; never throws.
 */
export function repairToolCallArguments(raw) {
  if (raw == null) return _okResult({}, '{}', true);
  if (typeof raw !== 'string') {
    try {
      return _okResult(raw, JSON.stringify(raw), false);
    } catch (e) {
      return _failResult(String(raw), e?.message ?? String(e));
    }
  }

  const trimmed = raw.trim();
  if (trimmed === '') {
    return _failResult('', 'Empty tool call arguments');
  }

  try {
    return _okResult(JSON.parse(trimmed), trimmed, false);
  } catch (e) {
    const repaired = _tryLenientOrEofRepair(trimmed);
    if (repaired) return _okResult(repaired, JSON.stringify(repaired), true);
    return _failResult(trimmed, e?.message ?? String(e));
  }
}

function _tryLenientOrEofRepair(trimmed) {
  const lenient = _tryParseJSON(trimmed);
  if (lenient && typeof lenient === 'object') return lenient;
  const eof = _tryEofRepair(trimmed);
  if (eof && typeof eof === 'object') return eof;
  return null;
}

/**
 * Narrow repair for tool-call arguments truncated before their closing
 * `}`/`]`. Only applies when bracket balancing is unambiguous and the
 * truncation is not inside a string literal or dangling after a `:`/`,`.
 */
function _tryEofRepair(s) {
  if (typeof s !== 'string' || s.length === 0) return null;

  const scan = _scanBrackets(s);
  if (!scan) return null;
  const { stack, inStr } = scan;
  if (inStr || stack.length === 0) return null;

  const candidate = s.replace(/,\s*$/, '');
  const lastNonWs = candidate.replace(/\s+$/, '').slice(-1);
  if (lastNonWs === ':' || lastNonWs === ',') return null;

  const suffix = _buildClosingSuffix(stack);
  try {
    return JSON.parse(candidate + suffix);
  } catch {
    return null;
  }
}

function _scanBrackets(s) {
  const state = { stack: [], inStr: false, esc: false, invalid: false };
  for (let i = 0; i < s.length && !state.invalid; i++) {
    _advanceBracketState(state, s[i]);
  }
  if (state.invalid) return null;
  return { stack: state.stack, inStr: state.inStr };
}

function _advanceBracketState(state, c) {
  if (state.inStr) {
    _advanceStringState(state, c);
    return;
  }
  _advanceStructuralState(state, c);
}

function _advanceStringState(state, c) {
  if (state.esc) state.esc = false;
  else if (c === '\\') state.esc = true;
  else if (c === '"') state.inStr = false;
}

function _advanceStructuralState(state, c) {
  if (c === '"') state.inStr = true;
  else if (c === '{' || c === '[') state.stack.push(c);
  else if (c === '}' && state.stack.pop() !== '{') state.invalid = true;
  else if (c === ']' && state.stack.pop() !== '[') state.invalid = true;
}

function _buildClosingSuffix(stack) {
  const closers = { '{': '}', '[': ']' };
  let suffix = '';
  for (let i = stack.length - 1; i >= 0; i--) {
    suffix += closers[stack[i]];
  }
  return suffix;
}

function _applyInlineFallback(normalized) {
  if (Array.isArray(normalized.toolCalls) && normalized.toolCalls.length > 0) return;

  const parseResult = parseInlineToolCall(normalized.content);
  if (!parseResult) return;

  if (parseResult.name) {
    normalized.toolCalls = [
      {
        id: `fallback_${Date.now()}`,
        function: {
          name: parseResult.name,
          arguments: JSON.stringify(parseResult.arguments || {}),
        },
      },
    ];
    normalized.content = parseResult.cleanedText;
    normalized.display = parseResult.cleanedText;
  } else if (parseResult.parseError) {
    const errorMessage = _buildJsonParseErrorMessage(parseResult);
    normalized.content = errorMessage;
    normalized.display = errorMessage;
    normalized._parseError = true;
  }
}

// --- Utility Helpers ---

function _logEmptyResponse(type, raw) {
  if (isDebugEnabled()) {
    const logger = createLogger('AIDiagnostics');
    logger.warn(`Empty content detected in ${type} response:`, {
      model: raw?.model,
      usage: raw?.usage,
      rawKeys: Object.keys(raw || {}),
    });
  }
  {
    const logger = createLogger('AIDiagnostics');
    logger.error('assistant.empty_response', { model: raw?.model, hasToolCalls: false });
  }
}

function _createErrorResponse(message, raw) {
  return _attachProviderMetadata(
    {
      content: message,
      display: message,
      toolCalls: [],
      model: raw?.model,
      _parseError: true,
    },
    raw
  );
}

function _logToolCalls(toolCalls) {
  try {
    if (isDebugEnabled()) {
      const diag = createLogger('AIDiagnostics');
      const names = Array.isArray(toolCalls)
        ? toolCalls.map(c => c?.function?.name || c?.name).filter(Boolean)
        : [];
      diag.info('tool_calls', { count: names.length, names });
    }
  } catch {
    /* intentionally empty */
  }
}

function _buildJsonParseErrorMessage(parseResult) {
  return [
    game.i18n.format('SIMULACRUM.Errors.JSONParsingError', { error: parseResult.parseError }),
    '',
    game.i18n.localize('SIMULACRUM.Errors.JSONParsingInstructions'),
    game.i18n.localize('SIMULACRUM.Errors.JSONFormatExample'),
    '',
    game.i18n.format('SIMULACRUM.Errors.ProblematicContent', { content: parseResult.content }),
  ].join('\n');
}

function _tryParseJSON(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    try {
      const fixed = s
        .replace(/\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g, '["$1","$2"]')
        .replace(/:\s*'([^']*)'(?=\s*[,}])/g, ': "$1"')
        .replace(/,(\s*[}\]])/g, '$1')
        .replace(/("(?:[^"\\]|\\.)*?)"((?:[^"\\]|\\.)*)"(?:[^"\\]|\\.)*?"/g, function (match) {
          const quoteCount = (match.match(/"/g) || []).length;
          if (quoteCount % 2 !== 0 && quoteCount > 2) {
            try {
              JSON.parse('{' + match + '}');
              return match;
            } catch (e) {
              return match.replace(/^"(.*)"$/, function (inner) {
                return '"' + inner.slice(1, -1).replace(/([^\\])"/g, '$1\\"') + '"';
              });
            }
          }
          return match;
        });
      return JSON.parse(fixed);
    } catch (e2) {
      return null;
    }
  }
}

function _extractToolCallFromObject(obj, cleanText, matchText) {
  const toolCall = obj.tool_call || obj;
  const name = toolCall?.name || toolCall?.function;

  if (!name) {
    _logFallbackError('missing_name', { keys: Object.keys(obj) });
    return null;
  }

  let args = toolCall?.arguments ?? {};
  if (typeof args === 'string') {
    args = _tryParseJSON(args) || {};
  }

  // Log validation warning but don't block parsing - validation happens at execution time
  _validateToolName(name);

  const cleanedText = cleanText.replace(matchText, '').trim();
  _logFallbackSuccess(name, args);

  return {
    name,
    arguments: args,
    cleanedText,
  };
}

function _logFallbackError(type, data) {
  try {
    if (isDebugEnabled()) createLogger('AIDiagnostics').warn(`fallback.parse.${type}`, data);
  } catch {
    /* empty */
  }
}

function _validateToolName(name) {
  try {
    const info = toolRegistry.getToolInfo(name);
    if (!info) {
      _logFallbackError('invalid_tool', { name });
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

function _logFallbackSuccess(name, args) {
  try {
    if (isDebugEnabled()) {
      createLogger('AIDiagnostics').info('fallback.parse.success', {
        name,
        argsKeys: Object.keys(args),
      });
    }
  } catch {
    /* empty */
  }
}
