#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLAYWRIGHT = join(ROOT, 'node_modules', '.bin', 'playwright');
const RESULTS_DIR = process.env.ADP_TEST_OUTCOME_FILE
  ? join(dirname(dirname(process.env.ADP_TEST_OUTCOME_FILE)), 'tier-results')
  : join(ROOT, 'artifacts', 'test-results');
const ARTIFACT_DIR = process.env.ADP_ARTIFACT_DIR
  ? resolve(process.env.ADP_ARTIFACT_DIR)
  : join(ROOT, 'tests/e2e/test-results');
const PLAYWRIGHT_RESULTS = join(ARTIFACT_DIR, 'reports', 'results.json');

const matrix = matrixSelectors();

function matrixSelectors() {
  const raw = process.env.AGENTIC_DELIVERY_MATRIX_JSON;
  if (!raw) return {};
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('AGENTIC_DELIVERY_MATRIX_JSON must be valid JSON');
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('AGENTIC_DELIVERY_MATRIX_JSON must be a JSON object');
  }
  return value;
}

const tier = process.argv[2];
const definitions = {
  policy: [{ command: process.execPath, args: ['tools/test-policy-check.mjs'] }],
  static: [{ command: process.execPath, args: ['tools/eslint-baseline-check.mjs'] }],
  unit: [{ nodeTests: 'tests/unit' }],
  regression: [
    { command: process.execPath, args: ['tests/utils/test-compaction-budget.mjs'] },
    { nodeTests: 'tests/regression' },
  ],
  integration: [{ nodeTests: 'tests/integration/local' }],
  component: [{ nodeTests: 'tests/component' }],
  security: [{ nodeTests: 'tests/security' }],
  package: [{ nodeTests: 'tests/package' }],
  ui: [playwrightStep('@ui')],
  accessibility: [playwrightStep('@accessibility')],
  'foundry-smoke': [playwrightStep('@smoke')],
  foundry: [playwrightStep(null)],
};

if (!Object.hasOwn(definitions, tier)) {
  console.error(
    `Unknown test tier "${tier}". Expected one of: ${Object.keys(definitions).join(', ')}`
  );
  process.exit(2);
}

const startedAt = new Date();
const steps = [];
const capturedOutputs = [];
let exitCode = 0;

for (const definition of definitions[tier]) {
  const step = await normalizeStep(definition);
  const result = await run(step.command, step.args, step.env);
  capturedOutputs.push(result.output);
  delete result.output;
  steps.push(result);
  if (result.exit_code !== 0) {
    exitCode = result.exit_code;
    break;
  }
}

const completedAt = new Date();
const report = {
  schema_version: 1,
  tier,
  status: exitCode === 0 ? 'pass' : 'fail',
  started_at: startedAt.toISOString(),
  completed_at: completedAt.toISOString(),
  duration_ms: completedAt.getTime() - startedAt.getTime(),
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  git_sha: process.env.GIT_COMMIT || process.env.GITHUB_SHA || null,
  steps,
};

await mkdir(RESULTS_DIR, { recursive: true });
await writeFile(join(RESULTS_DIR, `${tier}.json`), `${JSON.stringify(report, null, 2)}\n`);
await writeAgenticDeliveryOutcome(exitCode, steps, capturedOutputs);
console.log(
  `[test-tier] ${tier}: ${report.status}; evidence=${relative(ROOT, RESULTS_DIR)}/${tier}.json`
);
process.exit(exitCode);

function playwrightStep(grep) {
  const args = ['test', '--config=tests/e2e/playwright.config.mjs'];
  if (grep) args.push('--grep', grep);
  return {
    command: PLAYWRIGHT,
    args,
    env: {
      ADP_ARTIFACT_DIR: ARTIFACT_DIR,
      TEST_FOUNDRY_VERSIONS:
        process.env.ADP_FOUNDRY_VERSION ||
        matrix.foundry_version ||
        process.env.TEST_FOUNDRY_VERSIONS ||
        process.env.TEST_FOUNDRY_VERSION ||
        '13.351,14.364',
      TEST_SYSTEM_IDS:
        process.env.ADP_GAME_SYSTEM ||
        matrix.game_system ||
        process.env.TEST_SYSTEM_IDS ||
        process.env.TEST_SYSTEM_ID ||
        'dnd5e',
      TEST_TMPFS_PATH: process.env.TEST_TMPFS_PATH || '/dev/shm',
    },
  };
}

async function normalizeStep(definition) {
  if (!definition.nodeTests) return definition;
  const files = await findTests(join(ROOT, definition.nodeTests));
  if (files.length === 0) {
    throw new Error(`No test files found for required tier ${tier} in ${definition.nodeTests}`);
  }
  return {
    command: process.execPath,
    args: ['--test', ...files.map(file => relative(ROOT, file))],
  };
}

async function findTests(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await findTests(path)));
    if (entry.isFile() && /\.test\.mjs$/u.test(entry.name)) files.push(path);
  }
  return files.sort();
}

function run(command, args, extraEnv = {}) {
  const commandStartedAt = new Date();
  console.log(`[test-tier] ${relativeCommand(command)} ${args.join(' ')}`);

  return new Promise(resolvePromise => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = [];
    child.stdout.on('data', chunk => {
      process.stdout.write(chunk);
      output.push(chunk);
    });
    child.stderr.on('data', chunk => {
      process.stderr.write(chunk);
      output.push(chunk);
    });

    child.once('error', error => {
      const finishedAt = new Date();
      resolvePromise({
        command: relativeCommand(command),
        args,
        started_at: commandStartedAt.toISOString(),
        completed_at: finishedAt.toISOString(),
        duration_ms: finishedAt.getTime() - commandStartedAt.getTime(),
        exit_code: 127,
        error: error.message,
        output: Buffer.concat(output).toString('utf8'),
      });
    });

    child.once('exit', (code, signal) => {
      const finishedAt = new Date();
      resolvePromise({
        command: relativeCommand(command),
        args,
        started_at: commandStartedAt.toISOString(),
        completed_at: finishedAt.toISOString(),
        duration_ms: finishedAt.getTime() - commandStartedAt.getTime(),
        exit_code: code ?? 1,
        signal,
        output: Buffer.concat(output).toString('utf8'),
      });
    });
  });
}

async function writeAgenticDeliveryOutcome(commandExitCode, completedSteps, outputs) {
  const outcomePath = process.env.ADP_TEST_OUTCOME_FILE;
  if (!outcomePath) return;
  if (!isAbsolute(outcomePath) || process.env.ADP_TEST_OUTCOME_SCHEMA_VERSION !== '1') {
    throw new Error('Agentic Delivery test-outcome destination is invalid');
  }

  const filename = basename(outcomePath);
  if (!/^[a-z][a-z0-9_]*\.json$/u.test(filename)) {
    throw new Error('Agentic Delivery test-outcome filename is invalid');
  }

  const counts = isPlaywrightTier() ? await playwrightCounts(commandExitCode) : textCounts(
    commandExitCode,
    completedSteps,
    outputs
  );
  const status = commandExitCode === 0 && counts.failed === 0 ? 'passed' : 'failed';
  const outcome = {
    schema_version: 1,
    command_key: filename.slice(0, -'.json'.length),
    framework: frameworkName(),
    discovered: counts.discovered,
    passed: counts.passed,
    failed: counts.failed,
    skipped: counts.skipped,
    quarantined: 0,
    focused: 0,
    expected_failures: 0,
    retry_count: counts.retry_count,
    status,
  };

  await mkdir(dirname(outcomePath), { recursive: true });
  await writeFile(outcomePath, `${JSON.stringify(outcome, null, 2)}\n`);
}

function textCounts(commandExitCode, completedSteps, outputs) {
  let discovered = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const [index, output] of outputs.entries()) {
    const summary = parseNodeSummary(output);
    if (summary) {
      discovered += summary.discovered;
      passed += summary.passed;
      failed += summary.failed;
      skipped += summary.skipped;
    } else if (!completedSteps[index].args.includes('--test')) {
      discovered += 1;
      if (completedSteps[index].exit_code === 0) passed += 1;
      else failed += 1;
    }
  }

  if (discovered === 0) discovered = 1;
  if (commandExitCode !== 0 && failed === 0) failed = 1;
  passed = Math.min(passed, Math.max(0, discovered - failed - skipped));
  return { discovered, passed, failed, skipped, retry_count: 0 };
}

function parseNodeSummary(output) {
  const values = {};
  for (const key of ['tests', 'pass', 'fail', 'skipped']) {
    const matches = [...output.matchAll(new RegExp(`(?:^|\\n)[#ℹ]\\s*${key}\\s+(\\d+)`, 'gu'))];
    if (matches.length > 0) values[key] = Number(matches.at(-1)[1]);
  }
  if (values.tests === undefined) return null;
  return {
    discovered: values.tests,
    passed: values.pass || 0,
    failed: values.fail || 0,
    skipped: values.skipped || 0,
  };
}

async function playwrightCounts(commandExitCode) {
  const value = JSON.parse(await readFile(PLAYWRIGHT_RESULTS, 'utf8'));
  const tests = [];
  collectPlaywrightTests(value, tests);

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let retryCount = 0;
  for (const testResult of tests) {
    const results = testResult.results || [];
    retryCount += Math.max(0, results.length - 1);
    const final = results.at(-1)?.status;
    if (final === 'passed') passed += 1;
    else if (final === 'skipped') skipped += 1;
    else failed += 1;
  }
  if (commandExitCode !== 0 && failed === 0) failed = 1;
  return {
    discovered: Math.max(1, tests.length),
    passed,
    failed,
    skipped,
    retry_count: retryCount,
  };
}

function collectPlaywrightTests(suite, target) {
  for (const child of suite.suites || []) collectPlaywrightTests(child, target);
  for (const spec of suite.specs || []) target.push(...(spec.tests || []));
}

function isPlaywrightTier() {
  return ['ui', 'accessibility', 'foundry-smoke', 'foundry'].includes(tier);
}

function frameworkName() {
  if (isPlaywrightTier()) return 'playwright';
  if (tier === 'static') return 'eslint-baseline';
  if (tier === 'policy') return 'simulacrum-policy';
  return 'node-test';
}

function relativeCommand(command) {
  return command.startsWith(ROOT) ? relative(ROOT, command) : command;
}
