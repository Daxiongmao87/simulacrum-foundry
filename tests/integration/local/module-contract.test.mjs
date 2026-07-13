import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '../../..');

test('module manifest points to existing local entry points and assets', async () => {
  const manifest = JSON.parse(await readFile(resolve(ROOT, 'module.json'), 'utf8'));

  assert.equal(manifest.id, 'simulacrum');
  assert.equal(manifest.socket, false);
  assert.ok(manifest.compatibility.minimum <= 13);
  assert.ok(Number.parseFloat(String(manifest.compatibility.verified)) >= 14);
  if (manifest.compatibility.maximum != null) {
    assert.ok(Number.parseFloat(String(manifest.compatibility.maximum)) >= 14);
  }

  for (const path of [
    ...manifest.esmodules,
    ...manifest.styles,
    ...manifest.languages.map(x => x.path),
  ]) {
    await access(resolve(ROOT, path));
  }
});

test('all Handlebars partial paths referenced by the module exist', async () => {
  const entry = await readFile(resolve(ROOT, 'scripts/simulacrum.js'), 'utf8');
  const paths = [...entry.matchAll(/['"](templates\/[^'"]+\.hbs)['"]/gu)].map(match => match[1]);

  for (const path of paths) await access(resolve(ROOT, path));
});
