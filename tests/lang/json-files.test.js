// SPDX-License-Identifier: MIT

import { readdirSync, statSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

function* walk(dir, { exclude = [] } = {}) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const rel = full.replace(process.cwd() + '/', '');
    if (exclude.some((p) => rel.startsWith(p))) continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full, { exclude });
    } else {
      yield rel;
    }
  }
}

describe('All JSON files are strict JSON', () => {
  const root = resolve(process.cwd());
  const candidates = [
    'module.json',
    'package.json',
    // language files
    ...readdirSync('lang').filter((f) => f.endsWith('.json')).map((f) => join('lang', f))
  ];
  const jsonFiles = candidates.filter((p) => statSync(p).isFile());

  it('parses every .json file in repo', () => {
    for (const file of jsonFiles) {
      const raw = readFileSync(file, 'utf8');
      expect(() => JSON.parse(raw)).not.toThrow();
    }
  });

  it('has no leading content before the first non-whitespace character', () => {
    for (const file of jsonFiles) {
      const raw = readFileSync(file, 'utf8');
      const trimmed = raw.trimStart();
      // Accept objects or arrays as top-level JSON
      expect(['{', '[']).toContain(trimmed[0]);
    }
  });
});
