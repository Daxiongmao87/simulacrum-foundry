// SPDX-License-Identifier: MIT

import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Localization JSON (lang/en.json)', () => {
  const jsonPath = resolve(process.cwd(), 'lang/en.json');
  let localization;

  beforeAll(() => {
    const raw = readFileSync(jsonPath, 'utf8');
    localization = JSON.parse(raw);
  });

  it('is valid JSON (no comments or invalid tokens)', () => {
    const raw = readFileSync(jsonPath, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('starts with a JSON object (no leading comments)', () => {
    const raw = readFileSync(jsonPath, 'utf8');
    const beforeBrace = raw.slice(0, raw.indexOf('{')).trim();
    expect(beforeBrace).toBe('');
  });

  describe('ThinkingWords (Task-16)', () => {
    it('should contain ThinkingWords array', () => {
      expect(localization.SIMULACRUM?.ThinkingWords).toBeDefined();
      expect(Array.isArray(localization.SIMULACRUM.ThinkingWords)).toBe(true);
    });

    it('should have at least 4 thematic thinking words', () => {
      expect(localization.SIMULACRUM.ThinkingWords.length).toBeGreaterThanOrEqual(4);
    });

    it('all words should end with ellipsis', () => {
      const words = localization.SIMULACRUM.ThinkingWords;
      words.forEach(word => {
        expect(word).toMatch(/\.\.\.$/);
      });
    });
  });
});

