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
            'Read a portion of a previously stored tool output by line range. When a tool produces output that exceeds the context window, it is compacted and stored with a reference ID. Use this tool with that reference ID to retrieve specific line ranges. Request 200 lines or fewer per call to avoid truncation.',
            null,
            false
        );
    }

    /**
     * Get parameter schema for the tool
     * @returns {Object} Parameter schema definition
     */
    getParameterSchema() {
        return this._addResponseParam({
            type: 'object',
            properties: {
                tool_call_id: {
                    type: 'string',
                    description: 'The ID of the tool call whose stored output to read. This ID is provided in the compacted reference when output exceeds the context window.',
                },
                start_line: {
                    type: 'integer',
                    description: 'The starting line number to read from (1-indexed). Use 1 for the first chunk.',
                },
                end_line: {
                    type: 'integer',
                    description: 'The ending line number to read to (1-indexed, inclusive). For a 200-line chunk starting at line 1, use 200.',
                },
            },
            required: ['tool_call_id', 'start_line', 'end_line'],
        });
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
            return this.handleError('tool_call_id is required and must be a string', 'ValidationError');
        }

        if (!Number.isInteger(start_line) || start_line < 1) {
            return this.handleError('start_line must be a positive integer', 'ValidationError');
        }

        if (!Number.isInteger(end_line) || end_line < start_line) {
            return this.handleError('end_line must be >= start_line', 'ValidationError');
        }

        // Access the tool output buffer from ConversationManager
        const buffer = SimulacrumCore.conversationManager?.toolOutputBuffer;

        if (!buffer) {
            return this.handleError('Tool output buffer not available', 'Error');
        }

        if (!buffer.has(tool_call_id)) {
            return this.handleError(
                `No stored output for tool call: ${tool_call_id}. The output may have expired or the ID is incorrect.`,
                'NotFoundError'
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
