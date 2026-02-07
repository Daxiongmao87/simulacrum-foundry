/**
 * End Loop Tool - Silent tool to terminate the autonomous tool loop
 * The AI's natural text content is displayed via _notifyAssistantMessage,
 * so this tool only serves as a control signal - no message field needed.
 */

import { BaseTool } from './base-tool.js';

/**
 * Tool to terminate the tool loop and return control to the user.
 * This is a silent tool - it produces no visible output in the chat.
 */
export class EndLoopTool extends BaseTool {
    constructor() {
        super(
            'end_loop',
            'Exit the tool loop and return control to the user. Include a response if your last output was a tool call (i.e. no accompanying text message).',
            null,
            false, // Does not require confirmation
            false  // Response is optional
        );
    }

    /** @override */
    getParameterSchema() {
        return this._addResponseParam({
            type: 'object',
            properties: {
                reason: {
                    type: 'string',
                    enum: ['task_complete', 'need_clarification', 'error', 'question'],
                    description: 'Why the loop is ending. Used for logging only.',
                },
            },
            required: [],
        });
    }

    /**
     * Execute the end_loop tool
     * @param {Object} params - Tool parameters
     * @param {string} [params.reason] - Optional reason for ending the loop
     * @returns {Promise<Object>} Result with special _endLoop flag for loop handler
     */
    async execute(params) {
        const { reason = 'task_complete' } = params;

        // Return a special result that the loop handler will recognize
        // No display content - this is a silent control signal
        return {
            success: true,
            tool: this.name,
            display: null, // Silent - no visible output
            data: {
                reason,
                terminated: true,
            },
            // Special flag for the tool loop handler to recognize
            _endLoop: true,
            _silent: true, // Flag to suppress tool card rendering
        };
    }
}

// Export with old name for backwards compatibility with registry
export { EndLoopTool as NotifyUserTool };
