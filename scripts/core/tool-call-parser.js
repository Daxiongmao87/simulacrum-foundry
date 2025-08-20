// scripts/core/tool-call-parser.js
// ToolCallParser converts raw AI responses into structured ToolCallRequestInfo objects
// for the SimulacrumToolScheduler.

// import { ToolRegistry } from '../tools/tool-registry.js'; // Available for future use

/**
 * @typedef {Object} ToolCallRequestInfo
 * @property {string} callId
 * @property {string} name
 * @property {Record<string, unknown>} args
 * @property {boolean} isClientInitiated
 * @property {string} prompt_id
 */

export class ToolCallParser {
  /**
   * @param {ToolRegistry} toolRegistry
   */
  constructor(toolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  /**
   * Parse an AI response into an array of ToolCallRequestInfo.
   * Supports multiple formats:
   * 1. Gemini functionCalls array (object with functionCalls property)
   * 2. JSON blocks embedded in text
   * 3. Mixed content (text + JSON blocks)
   * @param {string|Object} aiResponse
   * @returns {ToolCallRequestInfo[]}
   */
  parseResponse(aiResponse) {
    const calls = [];
    // If aiResponse is already an object with functionCalls
    if (
      typeof aiResponse === 'object' &&
      aiResponse !== null &&
      Array.isArray(aiResponse.functionCalls)
    ) {
      aiResponse.functionCalls.forEach((fn) => {
        const args = fn.args || {};
        calls.push(this.createToolCallRequest(fn.name, args, false));
      });
      return calls;
    }

    // If aiResponse is a string, attempt to parse JSON blocks
    const text = typeof aiResponse === 'string' ? aiResponse : '';
    const jsonBlocks = this._extractJsonBlocks(text);
    jsonBlocks.forEach((block) => {
      try {
        const parsed = JSON.parse(block);
        if (
          parsed &&
          typeof parsed === 'object' &&
          parsed.name &&
          parsed.args
        ) {
          calls.push(
            this.createToolCallRequest(parsed.name, parsed.args, false)
          );
        }
      } catch {
        // ignore malformed JSON
      }
    });

    return calls;
  }

  /**
   * Validate tool name and arguments against the registry.
   * @param {string} toolName
   * @param {Record<string, unknown>} args
   * @returns {boolean}
   */
  validateToolCall(toolName, args) {
    try {
      const tool = this.toolRegistry.getTool(toolName);
      if (!tool) {
        return false;
      }
      // Basic validation: args must be an object
      if (typeof args !== 'object' || args === null) {
        return false;
      }
      // If tool has a parameterSchema, perform a simple property check
      const schema = tool.parameterSchema || {};
      if (schema.properties) {
        const required = schema.required || [];
        for (const key of required) {
          if (!(key in args)) {
            return false;
          }
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a ToolCallRequestInfo structure.
   * @param {string} toolName
   * @param {Record<string, unknown>} args
   * @param {boolean} isClientInitiated
   * @returns {ToolCallRequestInfo}
   */
  createToolCallRequest(toolName, args, isClientInitiated) {
    const callId = `${toolName}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return {
      callId,
      name: toolName,
      args,
      isClientInitiated,
      prompt_id: '',
    };
  }

  /**
   * Extract JSON blocks from a string. Supports ```json ... ``` and raw JSON.
   * @param {string} text
   * @returns {string[]}
   */
  _extractJsonBlocks(text) {
    const blocks = [];
    // Triple‑backtick json blocks
    const tripleBacktick = /```json\s*([\s\S]*?)\s*```/g;
    let match;
    while ((match = tripleBacktick.exec(text))) {
      blocks.push(match[1]);
    }
    // Raw JSON objects (non‑triple‑backtick)
    const rawJson = /\{[^}]*\}/g;
    let rawMatch;
    while ((rawMatch = rawJson.exec(text))) {
      blocks.push(rawMatch[0]);
    }
    return blocks;
  }
}
