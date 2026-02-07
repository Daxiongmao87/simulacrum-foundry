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
            'Signal that you are done using tools and return control to the user. Call this when the task is complete, when you need clarification from the user, or when an unrecoverable error occurs. Include a `response` if your preceding output was a tool call with no accompanying text.',
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
                    description: 'Why the loop is ending: "task_complete" for successful completion, "need_clarification" when user input is required, "error" for unrecoverable failures, "question" when asking the user a question. Used for logging only.',
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
