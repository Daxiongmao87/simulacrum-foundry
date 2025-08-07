// scripts/core/agentic-context.js

/**
 * @typedef {'user' | 'ai' | 'tool_result' | 'error'}
 */

/**
 * @typedef {Object}
 * @property {ContextItemType} type - The type of the context item.
 * @property {string} content - The content of the context item.
 * @property {string} timestamp - ISO string of when the item was added.
 * @property {Object} [details] - Optional: Additional details for the item (e.g., tool name, error message).
 */

/**
 * @typedef {Object}
 * @property {string} message - The AI's natural language message.
 * @property {Object} continuation - Object indicating if the AI wants to continue the loop.
 * @property {boolean} continuation.in_progress - True if the AI wants to continue, false otherwise.
 * @property {string} [continuation.gerund] - Optional: A gerund describing the next action (e.g., "thinking", "creating document").
 * @property {Array<Object>} [tool_calls] - Optional: An array of tool call objects.
 */

/**
 * @typedef {Object}
 * @property {string} tool_name - The name of the tool that was executed.
 * @property {Object} [result] - The successful result of the tool execution.
 * @property {string} [error] - The error message if the tool execution failed.
 */

/**
 * Manages the conversation context for the agentic loop, including user messages,
 * AI responses, and tool execution results.
 */
export class AgenticContext {
    constructor() {
        /**
         * @type {ContextItem[]}
         * @private
         */
        this.history = [];
    }

    /**
     * Adds a user message to the context history.
     * @param {string} message - The user's message.
     */
    addUserMessage(message) {
        this.history.push({
            type: 'user',
            content: message,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Adds an AI response to the context history.
     * @param {AgentResponse} response - The parsed AI response object.
     */
    addAIResponse(response) {
        this.history.push({
            type: 'ai',
            content: response.message,
            timestamp: new Date().toISOString(),
            details: { continuation: response.continuation, tool_calls: response.tool_calls }
        });
    }

    /**
     * Adds tool execution results to the context history.
     * @param {ToolResult[]} results - An array of tool result objects.
     */
    addToolResults(results) {
        results.forEach(result => {
            this.history.push({
                type: 'tool_result',
                content: JSON.stringify(result.result || result.error),
                timestamp: new Date().toISOString(),
                details: { tool_name: result.tool_name, status: result.error ? 'error' : 'success' }
            });
        });
    }

    /**
     * Adds an error message to the context history.
     * @param {string} errorMessage - The error message.
     */
    addError(errorMessage) {
        this.history.push({
            type: 'error',
            content: errorMessage,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Formats the entire context history into a chat prompt suitable for the AI.
     * @returns {Promise<string>} A promise that resolves to the formatted chat prompt.
     */
    async toChatPrompt() {
        // This is a simplified example. A real implementation might need to:
        // - Summarize older messages to fit context window limits.
        // - Use specific formatting for different message types (e.g., markdown for user/AI, JSON for tool results).
        // - Include system prompts or persona definitions.

        let prompt = "";
        for (const item of this.history) {
            switch (item.type) {
                case 'user':
                    prompt += `User: ${item.content}\n`;
                    break;
                case 'ai':
                    prompt += `AI: ${item.content}\n`;
                    // Optionally include tool calls/continuation details for AI to see its own previous decisions
                    if (item.details?.tool_calls && item.details.tool_calls.length > 0) {
                        prompt += `(AI previously called tools: ${JSON.stringify(item.details.tool_calls)})
`;
                    }
                    break;
                case 'tool_result':
                    prompt += `Tool Result (${item.details?.tool_name || 'unknown'}): ${item.content}\n`;
                    break;
                case 'error':
                    prompt += `System Error: ${item.content}\n`;
                    break;
            }
        }
        return prompt;
    }

    /**
     * Generates a summary of the current workflow for progress tracking.
     * @returns {string} A summary of the workflow.
     */
    getWorkflowSummary() {
        const lastItem = this.history[this.history.length - 1];
        if (!lastItem) {
            return "No activity yet.";
        }

        let summary = `Last action: ${lastItem.type}.`;
        if (lastItem.type === 'ai' && lastItem.details?.continuation?.gerund) {
            summary += ` AI is currently ${lastItem.details.continuation.gerund}.`;
        } else if (lastItem.type === 'tool_result' && lastItem.details?.tool_name) {
            summary += ` Tool '${lastItem.details.tool_name}' executed.`;
        }
        return summary;
    }

    /**
     * Clears the entire context history.
     */
    clear() {
        this.history = [];
    }
}
