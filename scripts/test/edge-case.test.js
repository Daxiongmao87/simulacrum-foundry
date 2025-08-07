// scripts/test/edge-case.test.js
import { SimulacrumToolScheduler } from '../core/tool-scheduler.js';
import { ToolCallParser } from '../core/tool-call-parser.js';
import { createMockTool } from './utils.js';
import { assert } from './utils.js';

export async function runTest() {
  const registry = {
    getTool: (name) => {
      if (name === 'echo') return createMockTool('echo', async (args) => ({ success: true, result: args.message }));
      return null;
    }
  };

  const scheduler = new SimulacrumToolScheduler({
    toolRegistry: registry,
    config: { getApprovalMode: () => 'YOLO' }
  });

  const parser = new ToolCallParser(registry);

  // Edge case: duplicate tool calls
  const aiResp = { functionCalls: [
    { name: 'echo', args: { message: 'dup1' } },
    { name: 'echo', args: { message: 'dup2' } }
  ] };
  const calls = parser.parseResponse(aiResp);
  await scheduler.schedule(calls.map(c => ({ name: c.name, args: c.args })), null);

  const successes = scheduler.toolCalls.filter(c => c.status === 'success');
  assert(successes.length === 2, 'Duplicate calls should both succeed');
}