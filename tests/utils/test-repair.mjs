// Mock Foundry globals
globalThis.FormApplication = class {};
globalThis.Hooks = { on: () => {}, callAll: () => {} };
globalThis.game = { i18n: { localize: (s) => s } };

const { repairToolCallArguments, normalizeToolCallArguments } = await import('../../scripts/utils/ai-normalization.js');

let passed = 0;
let failed = 0;

function test(label, input, expectedOk, expectedRepaired) {
  const outcome = repairToolCallArguments(input);
  const ok = outcome.ok === expectedOk;
  const repaired = outcome.repaired === expectedRepaired;
  const pass = ok && repaired;
  console.log(`${label}: ${pass ? 'PASS' : 'FAIL'} (ok=${outcome.ok} repaired=${outcome.repaired})`);
  if (pass) passed++; else failed++;
  return pass;
}

console.log('--- Testing repairToolCallArguments ---');
test('Issue #145 Truncated', '{"justification":"test","tool_call_id":"123","start_line":1', true, true);
test('Empty String', '', false, false);
test('Whitespace Only', '   ', false, false);
test('Null Literal', 'null', true, false);
test('Number Literal', '42', true, false);

console.log('\n--- Testing normalizeToolCallArguments ---');
const tc = { function: { name: 'test', arguments: '{"a":1' } };
const normalized = normalizeToolCallArguments(tc);
const repairPass = normalized.function.arguments === '{"a":1}';
console.log('Repaired JSON:', repairPass ? 'PASS' : 'FAIL');
if (repairPass) passed++; else failed++;

const tcEmpty = { function: { name: 'test', arguments: '' } };
const normalizedEmpty = normalizeToolCallArguments(tcEmpty);
const parsedEmpty = JSON.parse(normalizedEmpty.function.arguments);
const sentinelPass = parsedEmpty.__simulacrumParseError === true;
console.log('Empty String Sentinel:', sentinelPass ? 'PASS' : 'FAIL');
if (sentinelPass) passed++; else failed++;

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
