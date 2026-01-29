/* eslint-disable no-console, camelcase */
/**
 * Read Tool Output - Provides indexed access to large tool outputs
 * Part of the Context Compaction feature
 */

import { BaseTool } from './base-tool.js';
import { SimulacrumCore } from '../core/simulacrum-core.js';

/**
 * Tool for reading portions of previously stored tool outputs
 * Enables the AI to access large outputs without bloating context
 */
export class ReadToolOutputTool extends BaseTool {
    constructor() {
        super(
            'read_tool_output',
            'Read a portion of a previously returned tool output by line range. Use this when a tool output was too large and was stored with a reference.',
            null,
            false
        );
    }

    /**
     * Get parameter schema for the tool
     * @returns {Object} Parameter schema definition
     */
    getParameterSchema() {
        return {
            type: 'object',
            properties: {
                tool_call_id: {
                    type: 'string',
                    description: 'The ID of the tool call whose output to read',
                },
                start_line: {
                    type: 'integer',
                    description: 'Starting line number (1-indexed)',
                },
                end_line: {
                    type: 'integer',
                    description: 'Ending line number (1-indexed, inclusive)',
                },
            },
            required: ['tool_call_id', 'start_line', 'end_line'],
        };
    }

    /**
     * Execute the tool
     * @param {Object} params - Tool parameters
     * @returns {Promise<Object>} Result of the tool execution
     */
    async execute(params) {
        const { tool_call_id, start_line, end_line } = params;

        // Validate parameters
        if (!tool_call_id || typeof tool_call_id !== 'string') {
            return this.handleError(new Error('tool_call_id is required and must be a string'));
        }

        if (!Number.isInteger(start_line) || start_line < 1) {
            return this.handleError(new Error('start_line must be a positive integer'));
        }

        if (!Number.isInteger(end_line) || end_line < start_line) {
            return this.handleError(new Error('end_line must be >= start_line'));
        }

        // Access the tool output buffer from ConversationManager
        const buffer = SimulacrumCore.conversationManager?.toolOutputBuffer;

        if (!buffer) {
            return this.handleError(new Error('Tool output buffer not available'));
        }

        if (!buffer.has(tool_call_id)) {
            return this.handleError(
                new Error(
                    `No stored output for tool call: ${tool_call_id}. The output may have expired or the ID is incorrect.`
                )
            );
        }

        const fullOutput = buffer.get(tool_call_id);
        const lines = fullOutput.split('\n');
        const totalLines = lines.length;

        // Clamp end_line to actual line count
        const effectiveEndLine = Math.min(end_line, totalLines);
        const slice = lines.slice(start_line - 1, effectiveEndLine);
        
        // Limit output size to prevent context overflow
        const MAX_OUTPUT_CHARS = 10000;
        let content = slice.join('\n');
        let wasTruncated = false;
        
        if (content.length > MAX_OUTPUT_CHARS) {
            content = content.substring(0, MAX_OUTPUT_CHARS);
            wasTruncated = true;
        }

        const displayText = `Reading lines ${start_line}-${effectiveEndLine} of ${totalLines}${wasTruncated ? ' (truncated)' : ''}`;

        return {
            success: true,
            content: content,
            display: displayText,
            total_lines: totalLines,
            showing: `${start_line}-${effectiveEndLine}`,
            has_more: effectiveEndLine < totalLines,
            truncated: wasTruncated ? `Output truncated at ${MAX_OUTPUT_CHARS} chars. Request smaller line ranges.` : undefined,
        };
    }
}
