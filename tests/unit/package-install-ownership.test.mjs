import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  cacheInstalledSystemPackage,
  installSystemPackage,
} from '../e2e/fixtures/package-install.mjs';

const MANIFEST = {
  id: 'dnd5e',
  version: '5.1.0',
  compatibility: { minimum: '13', maximum: '14' },
};

test('system installation preserves a pre-existing target and fails before network access', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-package-existing-'));
  const target = join(root, 'dnd5e');
  await mkdir(target);
  await writeFile(join(target, 'sentinel.txt'), 'user-owned');
  let fetched = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetched = true;
    throw new Error('network must not be reached');
  };

  try {
    await assert.rejects(
      installSystemPackage('dnd5e', root, { manifestUrl: 'https://unused.invalid/system.json' }),
      /Refusing to replace pre-existing system package directory/u
    );
    assert.equal(fetched, false);
    assert.equal(await readFile(join(target, 'sentinel.txt'), 'utf8'), 'user-owned');
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true });
  }
});

test('cache publication preserves a pre-existing invalid cache byte-for-byte', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-cache-invalid-'));
  const installed = join(root, 'installed');
  const cache = join(root, 'cache');
  const target = join(cache, 'dnd5e');
  await mkdir(installed);
  await mkdir(target, { recursive: true });
  await writeFile(join(installed, 'system.json'), JSON.stringify(MANIFEST));
  await writeFile(join(installed, 'new.txt'), 'new package');
  await writeFile(join(target, 'system.json'), '{"id":"not-dnd5e"}');
  await writeFile(join(target, 'sentinel.txt'), 'pre-existing cache');
  const beforeEntries = await readdir(target);

  try {
    const result = cacheInstalledSystemPackage(installed, cache, 'dnd5e', '13.351');
    assert.equal(result.status, 'preserved-invalid');
    assert.deepEqual(await readdir(target), beforeEntries);
    assert.equal(await readFile(join(target, 'system.json'), 'utf8'), '{"id":"not-dnd5e"}');
    assert.equal(await readFile(join(target, 'sentinel.txt'), 'utf8'), 'pre-existing cache');
  } finally {
    await rm(root, { recursive: true });
  }
});

test('cache publication reuses a valid existing cache without modifying it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-cache-valid-'));
  const installed = join(root, 'installed');
  const cache = join(root, 'cache');
  const target = join(cache, 'dnd5e');
  await mkdir(installed);
  await mkdir(target, { recursive: true });
  await writeFile(join(installed, 'system.json'), JSON.stringify(MANIFEST));
  await writeFile(join(target, 'system.json'), JSON.stringify(MANIFEST));
  await writeFile(join(target, 'sentinel.txt'), 'valid pre-existing cache');

  try {
    const result = cacheInstalledSystemPackage(installed, cache, 'dnd5e', '14.364');
    assert.equal(result.status, 'reused');
    assert.equal(await readFile(join(target, 'sentinel.txt'), 'utf8'), 'valid pre-existing cache');
  } finally {
    await rm(root, { recursive: true });
  }
});

test('failed download cleans only its exact operation root and preserves similar paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simulacrum-package-operation-'));
  const preExisting = join(root, '.simulacrum-package-dnd5e-preexisting');
  await mkdir(preExisting);
  await writeFile(join(preExisting, 'sentinel.txt'), 'preserve me');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).endsWith('/system.json')) {
      return {
        ok: true,
        async json() {
          return {
            ...MANIFEST,
            download: 'https://example.invalid/package.zip',
          };
        },
      };
    }
    return { ok: false, status: 503 };
  };

  try {
    await assert.rejects(
      installSystemPackage('dnd5e', root, {
        manifestUrl: 'https://example.invalid/system.json',
        foundryVersion: '13.351',
      }),
      /HTTP 503/u
    );
    assert.deepEqual(await readdir(root), ['.simulacrum-package-dnd5e-preexisting']);
    assert.equal(await readFile(join(preExisting, 'sentinel.txt'), 'utf8'), 'preserve me');
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true });
  }
});
