/* eslint-disable complexity, max-len */
/**
 * Tool execution for the autonomous tool loop.
 * Executes the tool calls in an AI response: argument parsing and repair,
 * permission checks and confirmation prompts, tool execution, output
 * compaction and truncation, and result logging. Extracted from
 * tool-loop-handler.js to keep the handler under the 1000-line cap (#147).
 */

import { createLogger, isDebugEnabled } from '../utils/logger.js';
import { toolRegistry } from './tool-registry.js';
import { performPostToolVerification } from './tool-verification.js';
import { repairToolCallArguments } from '../utils/ai-normalization.js';
import { throwIfAborted } from '../utils/retry-helpers.js';
import { toolPermissionManager, PermissionState } from './tool-permission-manager.js';
import { interactionLogger } from './interaction-logger.js';

const logger = createLogger('ToolLoop');

// Store justifications keyed by toolCallId for retrieval when result is ready
const toolJustifications = new Map();

/**
 * Store justification for a tool call (for later retrieval when result is ready)
 * @param {string} toolCallId - The tool call ID
 * @param {string} justification - The justification text
 */
export function storeToolJustification(toolCallId, justification) {
  if (toolCallId && justification) {
    toolJustifications.set(toolCallId, justification);
  }
}

/**
 * Retrieve and remove justification for a tool call
 * @param {string} toolCallId - The tool call ID
 * @returns {string} The justification or empty string
 */
export function retrieveToolJustification(toolCallId) {
  const justification = toolJustifications.get(toolCallId) || '';
  toolJustifications.delete(toolCallId);
  return justification;
}

/**
 * Execute all tool calls from an AI response, applying permission checks,
 * confirmation prompts, and output compaction. Emits results via context
 * callbacks and the conversation manager.
 * @param {Array} toolCalls - Normalized tool calls from the AI response
 * @param {object} context - Loop context (conversationManager, onToolResult, signal, currentToolSupport)
 * @returns {Promise<Array>} One result object per tool call
 */
/* eslint-disable max-depth */ // Refactor tracked in #147
// eslint-disable-next-line complexity, max-lines-per-function, max-statements -- Refactor tracked in #147
export async function executeToolCalls(toolCalls, context) {
  const { onToolResult, signal, currentToolSupport, conversationManager } = context;
  const results = [];

  for (const toolCall of toolCalls) {
    throwIfAborted(signal);

    const toolName = toolCall?.function?.name || toolCall?.name;
    const toolArgs = toolCall?.function?.arguments ?? toolCall?.arguments;
    let result = null;
    let isSuccess = false;
    let error = null;
    let executionStart = 0;

    try {
      const parseOutcome = _parseToolCallArguments(toolArgs, toolName);
      if (parseOutcome.error) {
        await _recordInvalidArgsResult({
          toolCall,
          toolName,
          toolArgs,
          parseError: parseOutcome.error,
          currentToolSupport,
          conversationManager,
          onToolResult,
          results,
        });
        continue;
      }
      const parsedArgs = parseOutcome.parsedArgs;

      executionStart = Date.now();

      // Log tool call before execution (must happen before any early-exit so rejections appear in logs)
      interactionLogger.logToolCall(toolName, parsedArgs, toolCall.id);

      // Warn if justification is missing — the AI-facing schema marks it required, but
      // models (especially smaller ones) may skip it. Log a warning but still execute.
      if (
        !parsedArgs.justification ||
        typeof parsedArgs.justification !== 'string' ||
        !parsedArgs.justification.trim()
      ) {
        logger.warn(`Tool call "${toolName}" missing justification parameter`);
      }

      // Permission check for destructive tools
      if (toolPermissionManager.isDestructive(toolName)) {
        const permission = toolPermissionManager.getPermission(toolName);

        if (permission === PermissionState.DENY) {
          // Tool is blacklisted - deny without prompting
          result = {
            error:
              game.i18n?.localize('SIMULACRUM.ToolConfirmation.Blacklisted') ||
              'Tool is blacklisted and cannot be executed',
            denied: true,
            toolName,
          };
          isSuccess = false;

          if (currentToolSupport === true) {
            conversationManager.addMessage('tool', JSON.stringify(result), null, toolCall.id);
            await conversationManager.save();
          }

          const resultObj = { toolCall, toolName, result, success: isSuccess, error: null };
          results.push(resultObj);
          if (onToolResult) {
            await onToolResult({
              role: 'tool',
              content: JSON.stringify(result),
              toolCallId: toolCall.id,
              toolName,
            });
          }
          continue;
        }

        if (permission === PermissionState.ASK) {
          // Need to prompt user for confirmation
          const confirmResult = await _promptToolConfirmation(
            toolName,
            parsedArgs,
            toolCall.id,
            context
          );

          if (confirmResult === 'deny') {
            result = {
              error:
                game.i18n?.localize('SIMULACRUM.ToolConfirmation.Denied') ||
                'Tool execution denied by user',
              denied: true,
              toolName,
            };
            isSuccess = false;

            if (currentToolSupport === true) {
              conversationManager.addMessage('tool', JSON.stringify(result), null, toolCall.id);
              await conversationManager.save();
            }

            const resultObj = { toolCall, toolName, result, success: isSuccess, error: null };
            results.push(resultObj);
            if (onToolResult) {
              await onToolResult({
                role: 'tool',
                content: JSON.stringify(result),
                toolCallId: toolCall.id,
                toolName,
              });
            }
            continue;
          }

          if (confirmResult === 'blacklist') {
            await toolPermissionManager.setPermission(toolName, PermissionState.DENY);
            result = {
              error:
                game.i18n?.localize('SIMULACRUM.ToolConfirmation.Blacklisted') ||
                'Tool is blacklisted and cannot be executed',
              denied: true,
              toolName,
            };
            isSuccess = false;

            if (currentToolSupport === true) {
              conversationManager.addMessage('tool', JSON.stringify(result), null, toolCall.id);
              await conversationManager.save();
            }

            const resultObj = { toolCall, toolName, result, success: isSuccess, error: null };
            results.push(resultObj);
            if (onToolResult) {
              await onToolResult({
                role: 'tool',
                content: JSON.stringify(result),
                toolCallId: toolCall.id,
                toolName,
              });
            }
            continue;
          }

          if (confirmResult === 'always') {
            await toolPermissionManager.setPermission(toolName, PermissionState.ALLOW);
            // Continue to execute below
          }
          // confirmResult === 'allow' -> Continue to execute normally
        }
        // permission === ALLOW -> Continue to execute normally
      }

      // Execute the tool
      const execution = await toolRegistry.executeTool(toolName, parsedArgs);
      result = execution.result;

      isSuccess = !result.error;

      // Context Compaction: Store large outputs in buffer, inject reference
      // IMPORTANT: Store BEFORE truncation so read_tool_output can access full content
      let resultForConversation = result;
      const resultStr = JSON.stringify(result);
      const TOKEN_THRESHOLD = 1000; // ~4000 chars
      const estimatedTokens = Math.ceil(resultStr.length / 4);

      if (
        toolName !== 'read_tool_output' &&
        estimatedTokens > TOKEN_THRESHOLD &&
        conversationManager.toolOutputBuffer
      ) {
        // Store the FULL content before truncation (preserves newlines for pagination)
        const contentToStore = typeof result.content === 'string' ? result.content : resultStr;
        conversationManager.toolOutputBuffer.set(toolCall.id, contentToStore);

        // Create compact reference
        const lines = contentToStore.split('\n');
        const preview = lines.slice(0, 5).join('\n');

        resultForConversation = {
          _compacted: true,
          display: result.display || null, // Preserve display for formatted rendering on refresh
          total_lines: lines.length,
          total_chars: resultStr.length,
          preview: preview.substring(0, 500),
          access: `Use read_tool_output(tool_call_id="${toolCall.id}", start_line, end_line) to read full content`,
        };
      } else {
        // For smaller outputs AND read_tool_output results, truncate for conversation context
        _truncateInitialResult(result, toolName);
      }

      if (currentToolSupport === true) {
        conversationManager.addMessage(
          'tool',
          JSON.stringify(resultForConversation),
          null,
          toolCall.id
        );
        await conversationManager.save();
      }

      if (isSuccess) {
        try {
          await performPostToolVerification(toolName, parsedArgs, result, onToolResult);
        } catch (e) {
          logger.warn(`Post-verification failed: ${toolName}`, e);
        }
      }
    } catch (err) {
      if (isDebugEnabled()) logger.debug(`Tool execution error caught: ${err.message}`);
      error = err;
      logger.error(`Tool execution failed for ${toolName}:`, err);
      result = { error: err.message, toolName, arguments: toolArgs };
      if (currentToolSupport === true) {
        conversationManager.addMessage('tool', JSON.stringify(result), null, toolCall.id);
        await conversationManager.save();
      }
    }

    const resultObj = { toolCall, toolName, result, success: isSuccess, error };
    results.push(resultObj);

    // Log tool result with execution duration
    const durationMs = executionStart > 0 ? Date.now() - executionStart : 0;
    interactionLogger.logToolResult(toolCall.id, result, isSuccess, durationMs);

    if (onToolResult) {
      await onToolResult({
        role: 'tool',
        content: JSON.stringify(result),
        toolCallId: toolCall.id,
        toolName,
      });
    }
  }
  return results;
}
/* eslint-enable max-depth */

function _parseToolCallArguments(toolArgs, toolName) {
  if (typeof toolArgs !== 'string') {
    if (toolArgs && toolArgs.__simulacrumParseError === true) {
      return { parsedArgs: null, error: toolArgs.parseError || 'malformed tool call arguments' };
    }
    // Already parsed object - validate it is a true object (not null/array)
    if (toolArgs === null || Array.isArray(toolArgs) || typeof toolArgs !== 'object') {
      return { parsedArgs: null, error: 'Arguments must be a JSON object' };
    }
    return { parsedArgs: toolArgs, error: null };
  }
  const outcome = repairToolCallArguments(toolArgs);
  if (!outcome.ok) return { parsedArgs: null, error: outcome.parseError };
  if (outcome.repaired) {
    logger.warn(
      `Tool call "${toolName}" had malformed JSON arguments; recovered via narrow repair.`
    );
  }
  const parsed = outcome.argsObject;
  if (parsed && parsed.__simulacrumParseError === true) {
    return { parsedArgs: null, error: parsed.parseError || 'malformed tool call arguments' };
  }

  // Validate parsed result is an object (not null, array, or other literal)
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    return { parsedArgs: null, error: 'Arguments must be a JSON object' };
  }

  return { parsedArgs: parsed, error: null };
}

async function _recordInvalidArgsResult(opts) {
  const {
    toolCall,
    toolName,
    toolArgs,
    parseError,
    currentToolSupport,
    conversationManager,
    onToolResult,
    results,
  } = opts;
  const errMsg = `Tool call arguments for "${toolName}" must be a single JSON object but could not be recovered (${parseError}). Retry with a single complete JSON object containing all required arguments; do not truncate the output.`;
  logger.warn(errMsg);
  interactionLogger.logToolCall(
    toolName,
    { __simulacrumParseError: true, parseError },
    toolCall.id
  );
  const result = {
    error: errMsg,
    toolName,
    invalidArgs: true,
    arguments: typeof toolArgs === 'string' ? toolArgs.slice(0, 500) : toolArgs,
  };
  if (currentToolSupport === true) {
    conversationManager.addMessage('tool', JSON.stringify(result), null, toolCall.id);
    await conversationManager.save();
  }
  results.push({ toolCall, toolName, result, success: false, error: null });
  interactionLogger.logToolResult(toolCall.id, result, false, 0);
  if (onToolResult) {
    await onToolResult({
      role: 'tool',
      content: JSON.stringify(result),
      toolCallId: toolCall.id,
      toolName,
    });
  }
}

/**
 * Prompt user for tool execution confirmation via inline UI
 * @param {string} toolName - Name of the tool
 * @param {object} parsedArgs - Tool arguments
 * @param {string} toolCallId - Tool call ID
 * @param {object} context - Execution context
 * @returns {Promise<'allow'|'deny'|'always'|'blacklist'>}
 */
async function _promptToolConfirmation(toolName, parsedArgs, toolCallId, context) {
  const meta = toolPermissionManager.getDestructiveToolMeta(toolName);

  // Emit a hook that the UI can listen to
  return new Promise(resolve => {
    const hookId = Hooks.on('simulacrumToolConfirmationResponse', (responseToolCallId, action) => {
      if (responseToolCallId === toolCallId) {
        Hooks.off('simulacrumToolConfirmationResponse', hookId);
        resolve(action);
      }
    });

    // Emit request for confirmation UI
    Hooks.callAll('simulacrumToolConfirmationRequest', {
      toolName,
      toolCallId,
      displayName: meta?.displayName || toolName,
      explainerText: meta?.explainer || 'This tool can modify your game data.',
      justification: parsedArgs.justification,
      toolArgs: JSON.stringify(parsedArgs, null, 2),
    });

    // Handle cancellation via signal
    if (context.signal) {
      context.signal.addEventListener(
        'abort',
        () => {
          Hooks.off('simulacrumToolConfirmationResponse', hookId);
          resolve('deny');
        },
        { once: true }
      );
    }
  });
}

function _truncateInitialResult(result, toolName) {
  const MAX_OUTPUT_CHARS = 10000;
  if (typeof result.content === 'string' && result.content.length > MAX_OUTPUT_CHARS) {
    const truncatedContent = result.content.substring(0, MAX_OUTPUT_CHARS);
    const lineCount = truncatedContent.split('\n').length;

    // Add pagination hint for read_document tool
    const paginationHint =
      toolName === 'read_document'
        ? ` Use startLine/endLine parameters to read specific sections (e.g., if search found match at line 500, use startLine: 480, endLine: 520).`
        : '';

    result.content =
      truncatedContent +
      `\n... [Output truncated at ${MAX_OUTPUT_CHARS} characters, showing ~${lineCount} lines.${paginationHint}]`;
  }
}
