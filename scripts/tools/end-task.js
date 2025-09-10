/**
 * End Task Tool - Signals completion of autonomous task
 */

import { BaseTool } from './base-tool.js';

class EndTaskTool extends BaseTool {
  /**
   * Create a new End Task Tool
   */
  constructor() {
    super('end_task', 'Signal that the current task has been completed and autonomous execution should stop.', {
      type: 'object',
      properties: {
        summary: { 
          type: 'string', 
          description: 'Brief summary of what was accomplished'
        },
        success: { 
          type: 'boolean', 
          default: true,
          description: 'Whether the task was completed successfully'
        }
      }
    });
  }

  /**
   * Execute the tool
   * @param {Object} params - Tool parameters
   * @returns {Object} Tool result
   */
  async execute(params) {
    const summary = params.summary || 'Task completed';
    const success = params.success !== false;
    
    return {
      content: `Task completion signaled: ${summary}`,
      display: success 
        ? `✅ **Task Completed**: ${summary}` 
        : `⚠️ **Task Ended**: ${summary}`
    };
  }
}

export { EndTaskTool };