// scripts/test/integration.test.js
import { SimulacrumToolScheduler } from '../core/tool-scheduler.js';
import { ToolCallParser } from '../core/tool-call-parser.js';
import { createMockTool } from './utils.js';
import { assert } from './utils.js';

export async function runTest() {
  // Mock registry with multiple tools
  const registry = {
    getTool: (name) => {
      if (name === 'echo') return createMockTool('echo', async (args) => ({ success: true, result: args.message }));
      if (name === 'sum') return createMockTool('sum', async (args) => ({ success: true, result: args.a + args.b }));
      return null;
    }
  };

  const scheduler = new SimulacrumToolScheduler({
    toolRegistry: registry,
    config: { getApprovalMode: () => 'YOLO' }
  });

  const parser = new ToolCallParser(registry);

  // Simulate AI response with two calls
  const aiResp = { functionCalls: [
    { name: 'echo', args: { message: 'first' } },
    { name: 'sum', args: { a: 2, b: 3 } }
  ] };

  const calls = parser.parseResponse(aiResp);
  await scheduler.schedule(calls.map(c => ({ name: c.name, args: c.args })), null);

  const successes = scheduler.toolCalls.filter(c => c.status === 'success');
  assert(successes.length === 2, 'Both integration calls should succeed');
}