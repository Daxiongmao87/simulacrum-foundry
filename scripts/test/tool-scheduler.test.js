// scripts/test/tool-scheduler.test.js
import { SimulacrumToolScheduler } from '../core/tool-scheduler.js';
import { createMockTool } from './utils.js';
import { assert } from './utils.js';

export async function runTest() {
  // Mock tool registry
  const tools = {
    getTool: (name) => {
      if (name === 'echo') return createMockTool('echo', async (args) => ({ success: true, result: args.message }));
      if (name === 'fail') return createMockTool('fail', async () => { throw new Error('Intentional failure'); });
      return null;
    },
    hasTool: (name) => ['echo', 'fail'].includes(name)
  };

  const scheduler = new SimulacrumToolScheduler({
    toolRegistry: tools,
    config: { getApprovalMode: () => 'YOLO' }
  });

  // Test single tool scheduling
  const result = await scheduler.scheduleToolExecution('echo', { message: 'hello' }, null);
  assert(result.success, 'Echo tool should succeed');

  // Test error handling
  try {
    await scheduler.scheduleToolExecution('fail', {}, null);
    assert(false, 'Fail tool should throw');
  } catch (e) {
    assert(e.message.includes('Intentional failure'), 'Error message should match');
  }

  // Test batch execution
  const batch = [
    { name: 'echo', args: { message: 'batch1' } },
    { name: 'echo', args: { message: 'batch2' } }
  ];
  await scheduler.schedule(batch, null);
  const completed = scheduler.toolCalls.filter(c => c.status === 'success');
  assert(completed.length === 2, 'Both batch calls should succeed');
}