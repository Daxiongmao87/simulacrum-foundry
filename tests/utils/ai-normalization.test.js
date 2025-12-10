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
