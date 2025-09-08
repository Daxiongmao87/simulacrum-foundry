// SPDX-License-Identifier: MIT

import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Localization JSON (lang/en.json)', () => {
  const jsonPath = resolve(process.cwd(), 'lang/en.json');

  it('is valid JSON (no comments or invalid tokens)', () => {
    const raw = readFileSync(jsonPath, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('starts with a JSON object (no leading comments)', () => {
    const raw = readFileSync(jsonPath, 'utf8');
    const beforeBrace = raw.slice(0, raw.indexOf('{')).trim();
    expect(beforeBrace).toBe('');
  });
});

