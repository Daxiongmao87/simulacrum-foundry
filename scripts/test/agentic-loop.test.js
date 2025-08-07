// scripts/test/agentic-loop.test.js
import { SimulacrumToolScheduler } from '../core/tool-scheduler.js';
import { createMockTool } from './utils.js';
import { assert } from './utils.js';

export async function runTest() {
  const registry = {
    getTool: (name) => {
      if (name === 'echo') return createMockTool('echo', async (args) => ({ success: true, result: args.message }));
      if (name === 'fail') return createMockTool('fail', async () => { throw new Error('Intentional failure'); });
      return null;
    }
  };

  const scheduler = new SimulacrumToolScheduler({
    toolRegistry: registry,
    config: { getApprovalMode: () => 'YOLO' }
  });

  // Simulate a simple agentic loop: AI -> tool -> AI
  const aiResponse = { functionCalls: [{ name: 'echo', args: { message: 'loop' } }] };
  const parser = new (await import('../core/tool-call-parser.js')).ToolCallParser(registry);
  const calls = parser.parseResponse(aiResponse);
  await scheduler.schedule(calls.map(c => ({ name: c.name, args: c.args })), null);

  const completed = scheduler.toolCalls.filter(c => c.status === 'success');
  assert(completed.length === 1, 'Agentic loop should complete one tool call');
}