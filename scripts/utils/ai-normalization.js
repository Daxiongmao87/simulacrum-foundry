/**
 * AI normalization utilities (shared)
 */

/**
 * Sanitize messages for providers without native tool support.
 * Keeps only system/user/assistant roles and non-empty string content.
 */
export function sanitizeMessagesForFallback(messages) {
  try {
    return (messages || [])
      .filter(m => {
        const r = m && m.role;
        if (r !== 'system' && r !== 'user' && r !== 'assistant') return false;
        const c = typeof m.content === 'string' ? m.content.trim() : '';
        return c.length > 0;
      })
      .map(m => ({ role: m.role, content: String(m.content) }));
  } catch {
    return [];
  }
}

import { createLogger } from './logger.js';
import { isDiagnosticsEnabled } from './dev.js';
import { toolRegistry } from '../core/tool-registry.js';

/**
 * Normalize AI response into consistent format.
 * Preserves existing behavior from SimulacrumCore._normalizeAIResponse.
 */
export function normalizeAIResponse(raw) {
  // If already normalized, check for empty content
  if (typeof raw?.content === 'string') {
    if (!raw.content || raw.content.trim().length === 0) {
      if (isDiagnosticsEnabled()) {
        const logger = createLogger('AIDiagnostics');
        logger.warn('Empty content detected in already-normalized response:', {
          rawContentValue: raw.content,
          rawContentType: typeof raw.content,
          rawContentLength: (raw.content || '').length,
          trimmedLength: (raw.content || '').trim().length,
          hasToolCalls: !!(raw.toolCalls && raw.toolCalls.length > 0),
          model: raw.model,
          usage: raw.usage,
          responseKeys: Object.keys(raw || {})
        });
      }
      if (isDiagnosticsEnabled()) {
        const logger = createLogger('AIDiagnostics');
        logger.error('assistant.empty_response', { model: raw?.model, hasToolCalls: !!(raw.toolCalls && raw.toolCalls.length > 0) });
      }
      return {
        content: 'Empty response not allowed - please provide a meaningful response to the user.',
        display: 'Empty response not allowed - please provide a meaningful response to the user.',
        toolCalls: [],
        model: raw.model,
        usage: raw.usage,
        raw,
        _parseError: true
      };
    }
    return {
      content: raw.content,
      display: raw.display ?? raw.content,
      toolCalls: raw.toolCalls ?? raw.tool_calls ?? [],
      model: raw.model,
      usage: raw.usage,
      raw
    };
  }

  // OpenAI-compatible: { choices: [ { message: { content, tool_calls } } ] }
  const __choices = raw && raw.choices;
  const choice = Array.isArray(__choices) ? __choices[0] : undefined;
  const msg = choice?.message ?? {};
  const content = typeof msg.content === 'string' ? msg.content : '';

  if (!content || content.trim().length === 0) {
    if (isDiagnosticsEnabled()) {
      const logger = createLogger('AIDiagnostics');
      logger.warn('Empty content detected in OpenAI-style response:', {
        rawResponseStructure: {
          hasChoices: !!(raw.choices && raw.choices.length > 0),
          choicesCount: (raw.choices || []).length,
          firstChoiceKeys: raw.choices?.[0] ? Object.keys(raw.choices[0]) : [],
          messageKeys: raw.choices?.[0]?.message ? Object.keys(raw.choices[0].message) : [],
          contentValue: raw.choices?.[0]?.message?.content,
          contentType: typeof raw.choices?.[0]?.message?.content,
          hasToolCalls: !!(raw.choices?.[0]?.message?.tool_calls && raw.choices[0].message.tool_calls.length > 0)
        },
        extractedContent: content,
        extractedContentLength: content.length,
        trimmedLength: content.trim().length,
        model: raw?.model,
        usage: raw?.usage
      });
    }
    if (isDiagnosticsEnabled()) {
      const logger = createLogger('AIDiagnostics');
      const has = !!(raw?.choices?.[0]?.message?.tool_calls && raw.choices[0].message.tool_calls.length > 0);
      logger.error('assistant.empty_response', { model: raw?.model, hasToolCalls: has });
    }
    return {
      content: 'Empty response not allowed - please provide a meaningful response to the user.',
      display: 'Empty response not allowed - please provide a meaningful response to the user.',
      toolCalls: [],
      model: raw?.model,
      usage: raw?.usage,
      raw,
      _parseError: true
    };
  }

  let toolCalls = msg.tool_calls || [];
  if ((!toolCalls || toolCalls.length === 0) && msg.function_call && msg.function_call.name) {
    toolCalls = [{ id: msg.function_call.id, function: { name: msg.function_call.name, arguments: msg.function_call.arguments } }];
  }

  // Responses API style
  if (!content && !toolCalls?.length && (Array.isArray(raw && raw.output) && (raw.output[0] && raw.output[0].content))) {
    const parts = raw.output[0].content;
    const text = parts.map?.(p => p?.text ?? '').filter(Boolean).join('\n');
    return { content: text || '', display: text || '', toolCalls: [], model: raw?.model, usage: raw?.usage, raw };
  }

  const normalized = {
    content,
    display: content,
    toolCalls,
    model: raw?.model,
    usage: raw?.usage,
    raw
  };

  // Inline fallback parsing if no native tool_calls
  if ((!Array.isArray(normalized.toolCalls) || normalized.toolCalls.length === 0)) {
    const parseResult = parseInlineToolCall(normalized.content);
    if (parseResult && parseResult.name) {
      normalized.toolCalls = [{
        id: `fallback_${Date.now()}`,
        function: { name: parseResult.name, arguments: JSON.stringify(parseResult.arguments || {}) }
      }];
      normalized.content = parseResult.cleanedText;
      normalized.display = parseResult.cleanedText;
    } else if (parseResult && parseResult.parseError) {
      const errorMessage = [
        game.i18n.format('SIMULACRUM.Errors.JSONParsingError', { error: parseResult.parseError }),
        '',
        game.i18n.localize('SIMULACRUM.Errors.JSONParsingInstructions'),
        game.i18n.localize('SIMULACRUM.Errors.JSONFormatExample'),
        '',
        game.i18n.format('SIMULACRUM.Errors.ProblematicContent', { content: parseResult.content })
      ].join('\n');
      normalized.content = errorMessage;
      normalized.display = errorMessage;
      normalized._parseError = true;
    }
  }

  try {
    if (isDiagnosticsEnabled()) {
      const diag = createLogger('AIDiagnostics');
      const names = Array.isArray(normalized.toolCalls) ? normalized.toolCalls.map(c => c?.function?.name || c?.name).filter(Boolean) : [];
      diag.info('tool_calls', { count: names.length, names });
    }
  } catch {}

  return normalized;
}

/**
 * Parse a tool_call from a fenced JSON block in the assistant's content.
 * Strict parser ported from SimulacrumCore._parseInlineToolCall.
 */
export function parseInlineToolCall(text) {
  if (!text || typeof text !== 'string') return null;

  const cleanText = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  if (!cleanText || !cleanText.trim()) return null;

  try {
    if (isDiagnosticsEnabled() && text !== cleanText) {
      createLogger('AIDiagnostics').info('think_tag_filtered', {
        originalLength: text.length,
        cleanedLength: cleanText.length,
        hadThinkTags: text.includes('<think>')
      });
    }
  } catch {}

  const tryParse = (s) => {
    try { return JSON.parse(s); } catch (e) {
      try {
        const fixed = s
          .replace(/\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g, '["$1","$2"]')
          .replace(/:\s*'([^']*)'(?=\s*[,\}])/g, ': "$1"')
          .replace(/,(\s*[}\]])/g, '$1')
          .replace(/("(?:[^"\\]|\\.)*?)"((?:[^"\\]|\\.)*)"(?:[^"\\]|\\.)*?"/g, function(match) {
            const quoteCount = (match.match(/"/g) || []).length;
            if (quoteCount % 2 !== 0 && quoteCount > 2) {
              try { JSON.parse('{'+match+'}'); return match; } catch (e) {
                return match.replace(/^"(.*)"$/, function(inner) {
                  return '"' + inner.slice(1, -1).replace(/([^\\])"/g, '$1\\"') + '"';
                });
              }
            }
            return match;
          })
          // D&D 5e specific patterns and other heuristics are preserved in core; keep minimal here
        ;
        return JSON.parse(fixed);
      } catch (e2) {
        return null;
      }
    }
  };

  const fenced = /```json([\s\S]*?)```/i;
  const match = cleanText.match(fenced);
  if (!match) return null;
  const block = match[1] || '';
  const obj = tryParse(block.trim());
  if (!obj) {
    try {
      if (isDiagnosticsEnabled()) createLogger('AIDiagnostics').warn('fallback.parse.json_error', { content: block });
    } catch {}
    return { parseError: 'Invalid JSON', content: block };
  }

  // Accept either { tool_call: { name, arguments } } or { name, arguments }
  const toolCall = obj.tool_call || obj;
  const name = toolCall?.name;
  let args = toolCall?.arguments ?? {};
  if (!name) {
    try {
      if (isDiagnosticsEnabled()) {
        createLogger('AIDiagnostics').warn('fallback.parse.missing_name', {
          keys: Object.keys(obj)
        });
      }
    } catch {}
    return null;
  }

  if (typeof args === 'string') {
    const parsedArgs = tryParse(args);
    args = parsedArgs || {};
  }

  try {
    const info = toolRegistry.getToolInfo(name);
    if (!info) {
      try { if (isDiagnosticsEnabled()) createLogger('AIDiagnostics').warn('fallback.parse.invalid_tool', { name }); } catch {}
      return null;
    }
  } catch (e) { return null; }

  const cleanedText = cleanText.replace(match[0], '').trim();

  try {
    if (isDiagnosticsEnabled()) {
      createLogger('AIDiagnostics').info('fallback.parse.success', {
        name,
        argsKeys: Object.keys(args)
      });
    }
  } catch {}

  return { name, arguments: args, cleanedText };
}

