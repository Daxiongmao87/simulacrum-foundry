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
});
