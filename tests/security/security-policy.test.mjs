import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';

import { ValidationEngine } from '../../scripts/utils/validation.js';

const ROOT = resolve(import.meta.dirname, '../..');

test('HTML sanitizer removes script elements and inline event handlers', () => {
  const engine = new ValidationEngine();
  const sanitized = engine.sanitizeHTML(
    '<div onclick="steal()">ok</div><script>steal()</script><style>body{display:none}</style>'
  );

  assert.doesNotMatch(sanitized, /<script/iu);
  assert.doesNotMatch(sanitized, /<style/iu);
  assert.doesNotMatch(sanitized, /\sonclick\s*=/iu);
});

test('tracked source contains no obvious private keys or GitHub/OpenAI tokens', async () => {
  const findings = [];
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
    /\bgh[opsu]_[A-Za-z0-9_]{30,}\b/u,
    /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  ];

  for (const path of await walkSource(ROOT)) {
    const source = await readFile(path, 'utf8').catch(() => null);
    if (source === null) continue;
    for (const pattern of patterns) {
      if (pattern.test(source)) findings.push(`${relative(ROOT, path)} matched ${pattern}`);
    }
  }

  assert.deepEqual(findings, []);
});

async function walkSource(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      [
        '.git',
        '.foundry-cache',
        '.foundry-system-cache',
        'node_modules',
        'vendor',
        'dist',
      ].includes(entry.name) ||
      entry.name.startsWith('.foundry-data-') ||
      entry.name.startsWith('.foundry-test-')
    ) {
      continue;
    }

    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await walkSource(path)));
    if (entry.isFile() && /\.(?:js|mjs|cjs|json|md|hbs|css|yml|yaml)$/u.test(entry.name)) {
      paths.push(path);
    }
  }
  return paths;
}
