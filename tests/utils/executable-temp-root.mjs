import { mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const RUNTIME_FIXTURE_ROOT = join(ROOT, 'artifacts', 'runtime-fixtures');

export async function makeExecutableTempRoot(prefix) {
  await mkdir(RUNTIME_FIXTURE_ROOT, { recursive: true });
  return mkdtemp(join(RUNTIME_FIXTURE_ROOT, prefix));
}
