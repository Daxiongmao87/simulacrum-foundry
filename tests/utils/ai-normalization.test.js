// SPDX-License-Identifier: MIT

import { normalizeAIResponse } from '../../scripts/utils/ai-normalization.js';

describe('normalizeAIResponse - Gemini candidates', () => {
  beforeAll(() => {
    global.game = global.game || {};
    global.game.i18n = global.game.i18n || {
      format: () => '',
      localize: () => ''
    };
  });

  it('extracts text and function calls from Gemini response', () => {
    const raw = {
      model: 'models/gemini-pro',
      candidates: [
        {
          content: {
            parts: [
              { text: 'Gemini reply' },
              { functionCall: { name: 'lookup', args: { query: 'value' } } }
            ]
          }
        }
      ]
    };

    const normalized = normalizeAIResponse(raw);
    expect(normalized.content).toBe('Gemini reply');
    expect(normalized.toolCalls).toHaveLength(1);
    expect(normalized.toolCalls[0].function.name).toBe('lookup');
    expect(JSON.parse(normalized.toolCalls[0].function.arguments)).toEqual({ query: 'value' });
    expect(normalized.model).toBe('models/gemini-pro');
  });

  it('handles responses with no candidates', () => {
    const raw = { model: 'test', candidates: [] };
    const normalized = normalizeAIResponse(raw);
    expect(normalized).toHaveProperty('content');
  });

  it('handles null response', () => {
    const normalized = normalizeAIResponse(null);
    expect(normalized).toHaveProperty('content');
  });

  it('handles undefined response', () => {
    const normalized = normalizeAIResponse(undefined);
    expect(normalized).toHaveProperty('content');
  });

  it('handles OpenAI format response', () => {
    const raw = {
      choices: [
        {
          message: {
            content: 'OpenAI reply',
            tool_calls: [
              { type: 'function', function: { name: 'test', arguments: '{}' } }
            ]
          }
        }
      ]
    };
    const normalized = normalizeAIResponse(raw);
    expect(normalized.content).toBe('OpenAI reply');
  });

  it('handles response with think tags', () => {
    const raw = {
      model: 'test',
      candidates: [
        {
          content: {
            parts: [
              { text: '<think>reasoning here</think>Visible reply' }
            ]
          }
        }
      ]
    };
    const normalized = normalizeAIResponse(raw);
    expect(normalized.content).toContain('Visible reply');
  });

  it('handles response with JSON code block fallback', () => {
    const raw = {
      model: 'test',
      candidates: [
        {
          content: {
            parts: [
              { text: 'Here is the tool call:\n```json\n{"name":"testTool","arguments":{}}\n```' }
            ]
          }
        }
      ]
    };
    const normalized = normalizeAIResponse(raw);
    expect(normalized).toHaveProperty('content');
  });
});

describe('normalizeAIResponse - Already normalized', () => {
  beforeAll(() => {
    global.game = global.game || {};
    global.game.i18n = { format: () => '', localize: () => '' };
  });

  it('handles already normalized response with content', () => {
    const raw = {
      content: 'Pre-normalized content',
      toolCalls: [],
      model: 'test-model'
    };
    const normalized = normalizeAIResponse(raw);
    expect(normalized.content).toBe('Pre-normalized content');
  });

  it('handles already normalized with tool_calls property', () => {
    const raw = {
      content: 'Content',
      tool_calls: [{ function: { name: 'test', arguments: '{}' } }],
      model: 'test'
    };
    const normalized = normalizeAIResponse(raw);
    expect(normalized.toolCalls).toBeDefined();
  });

  it('handles already normalized with empty content', () => {
    const raw = { content: '', toolCalls: [] };
    const normalized = normalizeAIResponse(raw);
    // Should return error response for empty content
    expect(normalized).toHaveProperty('content');
  });

  it('handles already normalized with display property', () => {
    const raw = {
      content: 'Content',
      display: 'Custom display',
      toolCalls: []
    };
    const normalized = normalizeAIResponse(raw);
    expect(normalized.display).toBe('Custom display');
  });
});

describe('normalizeAIResponse - OpenAI edge cases', () => {
  beforeAll(() => {
    global.game = global.game || {};
    global.game.i18n = { format: () => '', localize: () => '' };
  });

  it('handles OpenAI response with only tool calls', () => {
    const raw = {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { type: 'function', id: 'call_123', function: { name: 'testTool', arguments: '{"arg":"value"}' } }
            ]
          }
        }
      ]
    };
    const normalized = normalizeAIResponse(raw);
    expect(normalized.toolCalls).toBeDefined();
    expect(normalized.toolCalls.length).toBeGreaterThan(0);
  });

  it('handles OpenAI response with empty choices', () => {
    const raw = { choices: [] };
    const normalized = normalizeAIResponse(raw);
    expect(normalized).toHaveProperty('content');
  });

  it('handles OpenAI response with empty content and no tools', () => {
    const raw = {
      choices: [{ message: { content: '', tool_calls: null } }]
    };
    const normalized = normalizeAIResponse(raw);
    expect(normalized).toHaveProperty('content');
  });
});

describe('normalizeAIResponse - Responses API format', () => {
  beforeAll(() => {
    global.game = global.game || {};
    global.game.i18n = { format: () => '', localize: () => '' };
  });

  it('handles Responses API format with output array', () => {
    const raw = {
      output: [
        {
          content: [
            { text: 'Part 1' },
            { text: 'Part 2' }
          ]
        }
      ],
      model: 'responses-model'
    };
    const normalized = normalizeAIResponse(raw);
    expect(normalized.content).toContain('Part 1');
    expect(normalized.content).toContain('Part 2');
  });

  it('handles Responses API format with empty content', () => {
    const raw = {
      output: [{ content: [] }]
    };
    const normalized = normalizeAIResponse(raw);
    expect(normalized.content).toBeDefined();
  });
});

describe('normalizeAIResponse - Error handling', () => {
  beforeAll(() => {
    global.game = global.game || {};
    global.game.i18n = { format: () => '', localize: () => '' };
  });

  it('handles response with errorCode', () => {
    const raw = {
      content: 'Error occurred',
      errorCode: 'RATE_LIMIT',
      errorMetadata: { retryAfter: 60 }
    };
    const normalized = normalizeAIResponse(raw);
    expect(normalized.errorCode).toBe('RATE_LIMIT');
  });

  it('handles response with _originalResponse', () => {
    const raw = {
      content: 'Test',
      _originalResponse: { original: 'data' }
    };
    const normalized = normalizeAIResponse(raw);
    expect(normalized._originalResponse).toBeDefined();
  });
});

import { sanitizeMessagesForFallback, parseInlineToolCall } from '../../scripts/utils/ai-normalization.js';

describe('sanitizeMessagesForFallback', () => {
  it('should filter out tool role messages', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'tool', content: 'Tool response' },
      { role: 'assistant', content: 'Reply' }
    ];
    const sanitized = sanitizeMessagesForFallback(messages);
    expect(sanitized).toHaveLength(2);
    expect(sanitized.find(m => m.role === 'tool')).toBeUndefined();
  });

  it('should filter out messages with empty content', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: '' },
      { role: 'assistant', content: '   ' }
    ];
    const sanitized = sanitizeMessagesForFallback(messages);
    expect(sanitized).toHaveLength(1);
  });

  it('should handle null messages array', () => {
    const sanitized = sanitizeMessagesForFallback(null);
    expect(sanitized).toEqual([]);
  });

  it('should handle undefined messages array', () => {
    const sanitized = sanitizeMessagesForFallback(undefined);
    expect(sanitized).toEqual([]);
  });

  it('should keep system messages', () => {
    const messages = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Hello' }
    ];
    const sanitized = sanitizeMessagesForFallback(messages);
    expect(sanitized).toHaveLength(2);
  });

  it('should handle non-string content', () => {
    const messages = [
      { role: 'user', content: { text: 'object content' } }
    ];
    const sanitized = sanitizeMessagesForFallback(messages);
    expect(sanitized).toHaveLength(0);
  });
});

describe('parseInlineToolCall', () => {
  it('should return null for null input', () => {
    expect(parseInlineToolCall(null)).toBeNull();
  });

  it('should return null for undefined input', () => {
    expect(parseInlineToolCall(undefined)).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(parseInlineToolCall('')).toBeNull();
  });

  it('should return null for non-string input', () => {
    expect(parseInlineToolCall(123)).toBeNull();
    expect(parseInlineToolCall({})).toBeNull();
  });

  it('should return null for text without JSON block', () => {
    expect(parseInlineToolCall('Just some text without code blocks')).toBeNull();
  });

  it('should parse valid JSON tool call', () => {
    const text = 'Here is the tool call:\n```json\n{"name":"testTool","arguments":{"key":"value"}}\n```';
    const result = parseInlineToolCall(text);
    expect(result).not.toBeNull();
  });

  it('should handle invalid JSON in code block', () => {
    const text = '```json\n{invalid json}\n```';
    const result = parseInlineToolCall(text);
    expect(result?.parseError).toBeDefined();
  });

  it('should strip think tags before parsing', () => {
    const text = '<think>Reasoning here</think>```json\n{"name":"tool"}\n```';
    const result = parseInlineToolCall(text);
    expect(result).not.toBeNull();
  });

  it('should return null for only think tags content', () => {
    const text = '<think>Only thinking, no actual content</think>';
    const result = parseInlineToolCall(text);
    expect(result).toBeNull();
  });
});

