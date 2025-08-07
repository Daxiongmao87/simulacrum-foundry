// scripts/test/performance.test.js
import { SimulacrumToolScheduler } from '../core/tool-scheduler.js';
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

  const batch = [];
  for (let i = 0; i < 100; i++) {
    batch.push({ name: 'echo', args: { message: `msg${i}` } });
  }

  const start = Date.now();
  await scheduler.schedule(batch, null);
  const duration = Date.now() - start;
  console.log(`Scheduled 100 calls in ${duration}ms`);
  const successes = scheduler.toolCalls.filter(c => c.status === 'success');
  assert(successes.length === 100, 'All 100 calls should succeed');
}