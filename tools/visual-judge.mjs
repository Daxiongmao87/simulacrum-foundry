#!/usr/bin/env node
/**
 * visual-judge.mjs — Independent LLM judge for screenshot receipts.
 *
 * Implements the "proof of looking" half of the RULES.md screenshot-gate
 * (see "Frontend verification — Foundry e2e is mandatory"). An agent's
 * receipt (file path + SHA-256 + description + expected value) is only
 * credible if an independent model has compared the actual pixels against
 * the claimed description and the fix under test. This tool sends each
 * screenshot to a local vision LLM (OpenAI-compatible endpoint) with the
 * claimed description and expected value, and records the judge's
 * structured verdict.
 *
 * The output verdicts file is the auditable receipt: the SHA-256 pins the
 * exact file that was judged, so anyone can re-run the judge on the same
 * file and compare verdicts without trusting the original reporter.
 *
 * Usage:
 *   node tools/visual-judge.mjs <manifest.json> [verdicts.json]
 *
 * Manifest shape:
 *   { "fix": "<what the fix requires to be visible>",
 *     "entries": [{ "id", "path", "description", "expected" }] }
 *
 * Environment:
 *   VISUAL_JUDGE_URL      (required) chat-completions endpoint
 *   VISUAL_JUDGE_MODEL    (required) judge model id
 *   VISUAL_JUDGE_KEY_FILE (optional) bearer key file; omit when the endpoint
 *                           needs no key
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Resolve the judge endpoint configuration from env. The endpoint and model
 * are environment-specific and have no portable defaults, so they are
 * required; the key file is optional for keyless local endpoints.
 * @returns {{url: string, model: string, key: string}} Resolved config
 */
const resolveConfig = () => {
  const missing = ['VISUAL_JUDGE_URL', 'VISUAL_JUDGE_MODEL'].filter(name => !process.env[name]);
  if (missing.length) {
    throw new Error(
      `missing required env ${missing.join(', ')} — the judge endpoint is ` +
        'environment-specific; set it (and VISUAL_JUDGE_KEY_FILE if the ' +
        'endpoint needs a key)'
    );
  }
  const keyFile = process.env.VISUAL_JUDGE_KEY_FILE;
  return {
    url: process.env.VISUAL_JUDGE_URL,
    model: process.env.VISUAL_JUDGE_MODEL,
    key: keyFile && existsSync(keyFile) ? readFileSync(keyFile, 'utf-8').trim() : '',
  };
};

/**
 * Build the judge prompt. The judge must reply with JSON only; anything
 * else is recorded as an unparseable verdict rather than guessed at.
 * @param {object} entry  Manifest entry being judged
 * @param {string} fix    The fix under test (what the image must evidence)
 * @returns {string} The prompt text
 */
const buildPrompt = (entry, fix) =>
  `You are an independent visual-evidence judge. You are shown one screenshot. ` +
  `A previous agent claims the image shows the following, and that it evidences a fix.\n` +
  `CLAIMED DESCRIPTION: ${entry.description}\n` +
  `EXPECTED VALUE: ${entry.expected}\n` +
  `FIX UNDER TEST: ${fix}\n` +
  `Judge only from what is actually visible in the image. Do not assume what ` +
  `the image "should" show. Reply with JSON only, no prose outside the JSON: ` +
  `{"image_matches_description":"yes|no|partial","fix_evidenced":"yes|no|not-applicable","visible":"<what you actually see, specific>","reasoning":"<why>"}`;

/**
 * Extract the first JSON object from a model reply and parse it.
 * @param {string} text  Raw model reply
 * @returns {object|null} Parsed verdict or null when unparseable
 */
const parseVerdict = text => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
};

/**
 * Accumulate the content deltas of an OpenAI-compatible SSE stream.
 * @param {string} text Full SSE response body
 * @returns {string} Concatenated streamed content
 */
const readStreamedContent = text => {
  let raw = '';
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6).trim();
    if (data === '[DONE]') break;
    try {
      const chunk = JSON.parse(data);
      raw += chunk.choices?.[0]?.delta?.content ?? '';
    } catch {
      /* non-JSON keep-alive line */
    }
  }
  return raw;
};

/**
 * Ask the judge model for a verdict on one screenshot.
 * @param {object} entry    Manifest entry
 * @param {string} fix      The fix under test
 * @param {object} cfg      Resolved endpoint/model/key configuration
 * @returns {Promise<object>} Verdict record including raw reply
 */
const judgeEntry = async (entry, fix, cfg) => {
  const image = readFileSync(entry.path);
  const sha256 = createHash('sha256').update(image).digest('hex');
  const base64 = image.toString('base64');
  const mime = /\.(jpe?g)$/i.test(entry.path) ? 'image/jpeg' : 'image/png';

  const body = {
    model: cfg.model,
    stream: true,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildPrompt(entry, fix) },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
        ],
      },
    ],
  };

  const headers = { 'Content-Type': 'application/json' };
  if (cfg.key) headers.Authorization = `Bearer ${cfg.key}`;

  const response = await fetch(cfg.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `judge HTTP ${response.status} for ${entry.id}: ${(await response.text()).slice(0, 200)}`
    );
  }
  const text = await response.text();
  const raw = readStreamedContent(text);
  return {
    id: entry.id,
    path: entry.path,
    sha256,
    description: entry.description,
    expected: entry.expected,
    judge: {
      model: cfg.model,
      url: cfg.url,
      verdict: parseVerdict(raw),
      raw,
    },
  };
};

/**
 * Write the verdicts file and report the outcome.
 * @param {object} verdicts     Full verdicts record
 * @param {string} outPath      Output file path
 * @returns {void}
 */
const reportResults = (verdicts, outPath) => {
  writeFileSync(outPath, JSON.stringify(verdicts, null, 2) + '\n');
  const bad = verdicts.results.filter(r => r.judge.verdict?.fix_evidenced === 'no');
  console.log(`[visual-judge] wrote ${outPath} (${verdicts.results.length} entries)`);
  if (bad.length) {
    console.error(`[visual-judge] FAIL: fix NOT evidenced in: ${bad.map(b => b.id).join(', ')}`);
    process.exit(1);
  }
};

/**
 * Main: judge every manifest entry sequentially and write the verdicts file.
 * @returns {Promise<void>}
 */
const main = async () => {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('usage: node tools/visual-judge.mjs <manifest.json> [verdicts.json]');
    process.exit(2);
  }
  const manifestPath = resolve(args[0]);
  const outPath = resolve(args[1] ?? manifestPath.replace(/\.json$/, '.verdicts.json'));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const cfg = resolveConfig();

  const verdicts = {
    fix: manifest.fix ?? null,
    judgedAt: new Date().toISOString(),
    results: [],
  };
  for (const entry of manifest.entries ?? []) {
    console.log(`[visual-judge] ${entry.id} ...`);
    verdicts.results.push(await judgeEntry(entry, manifest.fix ?? '', cfg));
  }
  reportResults(verdicts, outPath);
};

main().catch(error => {
  console.error(`[visual-judge] ${error.message}`);
  process.exit(1);
});
