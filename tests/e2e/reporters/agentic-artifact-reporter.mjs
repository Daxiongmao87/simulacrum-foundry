import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveFoundryEnvironment } from '../fixtures/agentic-foundry-inputs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const TEST_ENV_PATH = join(ROOT, 'tests/e2e/.env.test');

const CATEGORY_BY_NAME = [
  [/screenshot/iu, 'screenshots'],
  [/video/iu, 'video'],
  [/trace/iu, 'trace'],
  [/console|page-errors|foundry-(?:stdout|stderr)/iu, 'console'],
  [/^dom-/iu, 'dom'],
  [/accessibility/iu, 'accessibility'],
];

export default class AgenticArtifactReporter {
  constructor() {
    const environment = resolveFoundryEnvironment({
      environment: process.env,
      localPath: TEST_ENV_PATH,
    });
    this.root = environment.ADP_ARTIFACT_DIR ? resolve(environment.ADP_ARTIFACT_DIR) : null;
  }

  async onTestEnd(test, result) {
    if (!this.root) return;

    const identity = safePart(`${test.parent.project()?.name || 'project'}-${test.id}`);
    for (const [index, attachment] of result.attachments.entries()) {
      const category = categoryFor(attachment.name);
      if (!category) continue;

      const extension = safeExtension(attachment.path, attachment.contentType);
      const destination = join(
        this.root,
        category,
        `${identity}-${String(index + 1).padStart(2, '0')}${extension}`
      );
      await mkdir(join(this.root, category), { recursive: true });
      if (attachment.path) await copyFile(attachment.path, destination);
      else if (attachment.body) await writeFile(destination, attachment.body);
    }
  }
}

function categoryFor(name) {
  return CATEGORY_BY_NAME.find(([pattern]) => pattern.test(name))?.[1] || null;
}

function safePart(value) {
  const safe = value.replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '');
  return (safe || 'test').slice(0, 100);
}

function safeExtension(path, contentType) {
  const extension = path ? extname(basename(path)) : '';
  if (/^\.[A-Za-z0-9]{1,8}$/u.test(extension)) return extension;
  if (contentType === 'application/json') return '.json';
  if (contentType === 'text/html') return '.html';
  if (contentType?.startsWith('text/')) return '.txt';
  return '.bin';
}
