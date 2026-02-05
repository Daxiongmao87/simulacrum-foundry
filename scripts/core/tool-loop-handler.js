/* eslint-disable complexity, max-len, no-console */
/**
 * Simplified tool execution handler - pure tool execution logic
 * No conversation management - that's handled by ChatHandler
 */

import { createLogger, isDebugEnabled } from '../utils/logger.js';
import { toolRegistry } from './tool-registry.js';
import { performPostToolVerification } from './tool-verification.js';
import {
  sanitizeMessagesForFallback,
  normalizeAIResponse,
  parseInlineToolCall,
} from '../utils/ai-normalization.js';
import { appendEmptyContentCorrection, appendToolFailureCorrection } from './correction.js';
import {
  isToolCallFailure,
  buildRetryLabel,
  getRetryDelayMs,
  delayWithSignal,
} from '../utils/retry-helpers.js';
import { emitProcessStatus, emitRetryStatus } from './hook-manager.js';
import { toolPermissionManager, PermissionState } from './tool-permission-manager.js';
import { interactionLogger } from './interaction-logger.js';

const logger = createLogger('ToolLoop');
const MAX_TOOL_FAILURE_ATTEMPTS = 3;
const TOOL_RETRY_STATUS_PREFIX = 'tool-retry';

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
 * Execute tools from an AI response and continue autonomous loop
 */
export async function processToolCallLoop(options) {
  const callId = `tool-loop-${foundry.utils.randomID()}`;

  try {
    emitProcessStatus('start', callId, 'Thinking...', 'agentic-loop');
    return await _runLoopIteration(options);
  } finally {
    emitProcessStatus('end', callId);
  }
}

// --- Internal Loop Logic ---

async function _runLoopIteration(context) {
  let currentResponse = context.initialResponse;

  // Get limit from settings (default 100). -1 or 0 means infinite.
  const configuredLimit = game?.settings?.get('simulacrum', 'toolLoopLimit') ?? 100;
  const isInfinite = configuredLimit <= 0;
  const REPEAT_LIMIT = isInfinite ? Number.MAX_SAFE_INTEGER : configuredLimit;

  let repeatCount = 0;
  let toolFailureAttempts = 0;

  // Circuit breaker: detect repeated identical responses
  const CIRCUIT_BREAKER_THRESHOLD = 3;
  let lastResponseContent = null;
  let consecutiveRepeats = 0;

  while (repeatCount < REPEAT_LIMIT) {
    if (context.signal?.aborted) throw new Error('Process was cancelled');

    // Circuit breaker check: detect if AI is generating same text-only response repeatedly
    const currentContent = currentResponse.content?.trim() || '';
    const hasToolCalls = Array.isArray(currentResponse.toolCalls) && currentResponse.toolCalls.length > 0;

    if (!hasToolCalls && currentContent.length > 0) {
      if (currentContent === lastResponseContent) {
        consecutiveRepeats++;
        logger.warn(`Circuit breaker: identical text-only response detected (${consecutiveRepeats}/${CIRCUIT_BREAKER_THRESHOLD})`);

        if (consecutiveRepeats >= CIRCUIT_BREAKER_THRESHOLD) {
          logger.error(`Circuit breaker triggered: AI repeated same response ${consecutiveRepeats} times without tool call`);

          // Emit error to user via hook
          Hooks.callAll('simulacrumNotifyUser', {
            message: `<strong>Loop terminated:</strong> The AI model repeatedly failed to call the required <code>end_loop</code> tool to exit the conversation loop. This may indicate the model has limited tool-calling capabilities. Consider using a different model with better function calling support.`,
            endLoop: true,
            isError: true,
          });

          return {
            content: currentContent,
            display: currentContent,
            toolCalls: [],
            _circuitBreakerTriggered: true,
          };
        }
      } else {
        consecutiveRepeats = 1; // Reset counter for new content
      }
      lastResponseContent = currentContent;
    } else if (hasToolCalls) {
      // Reset circuit breaker when tool calls are present
      consecutiveRepeats = 0;
      lastResponseContent = null;
    }

    // Extract response from tool calls (primary) or use content (fallback)
    // The response parameter is the canonical way for AI to communicate with users
    const toolResponse = _extractToolResponse(currentResponse.toolCalls);
    if (toolResponse) {
      currentResponse.content = toolResponse;
    }

    // Notify UI of the message content FIRST so pending cards have a message to attach to
    if (currentResponse.content && currentResponse.content.trim().length > 0) {
      await _notifyAssistantMessage(currentResponse, context);
    }

    // Emit pending tool state for each tool call AFTER assistant message exists
    // (UI appends pending cards to last assistant message)
    if (Array.isArray(currentResponse.toolCalls) && currentResponse.toolCalls.length > 0) {
      for (const toolCall of currentResponse.toolCalls) {
        const toolName = toolCall.function?.name || toolCall.name || 'Unknown Tool';
        const toolCallId = toolCall.id || `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        let justification = '';

        try {
          const args = toolCall.function?.arguments || toolCall.arguments;
          const parsed = typeof args === 'string' ? JSON.parse(args) : args;
          if (parsed && parsed.justification) {
            justification = parsed.justification;
          }
        } catch (_e) {
          // Ignore parsing errors
        }

        // Store justification for retrieval when result is ready
        storeToolJustification(toolCallId, justification);

        // Emit hook for UI to render pending tool card
        Hooks.callAll('simulacrumToolPending', {
          toolCallId,
          toolName,
          justification,
        });
      }
    }

    // Process a single cycle of the loop
    const cycleResult = await _processLoopCycle(currentResponse, context, {
      toolFailureAttempts,
      repeatCount,
      REPEAT_LIMIT,
    });

    // Handle cycle outcome
    if (cycleResult.action === 'return') return cycleResult.value;
    if (cycleResult.action === 'break') break;

    // Update state for next iteration
    currentResponse = cycleResult.response;
    repeatCount = cycleResult.repeatCount;
    toolFailureAttempts = cycleResult.toolFailureAttempts;
  }

  // Handle Repeat Limit if loop finished naturally without break
  if (repeatCount >= REPEAT_LIMIT) {
    return _handleRepeatLimit(context, currentResponse, repeatCount, REPEAT_LIMIT);
  }

  // NOTE: We do NOT need to call _notifyAssistantMessage here.
  // The content was already notified at the start of the final iteration (Line 50)
  // or will be handled by the caller. Invoking it here causes duplicates.

  return currentResponse;
}

async function _processLoopCycle(currentResponse, context, state) {
  let { toolFailureAttempts, repeatCount } = state; // eslint-disable-line prefer-const
  const { REPEAT_LIMIT } = state;

  // 1. Handle Parse Errors
  if (currentResponse._parseError) {
    repeatCount++;
    const response = await _handleParseError(currentResponse, context, repeatCount, REPEAT_LIMIT);
    return { action: 'continue', response, repeatCount, toolFailureAttempts };
  }

  // 2. Handle Tool Call Failures
  if (isToolCallFailure(currentResponse)) {
    toolFailureAttempts++;
    if (toolFailureAttempts >= MAX_TOOL_FAILURE_ATTEMPTS) {
      return { action: 'return', value: await _runToolFailureFallback(context) };
    }
    const response = await _handleToolRefusal(currentResponse, context, toolFailureAttempts);
    return { action: 'continue', response, repeatCount, toolFailureAttempts };
  }

  // 3. Terminate if no tools - require end_loop to exit
  if (!Array.isArray(currentResponse.toolCalls) || currentResponse.toolCalls.length === 0) {
    if (isDebugEnabled()) logger.debug('No tool calls in current AI response; requesting end_loop');
    // Instead of breaking, ask AI to use end_loop tool
    repeatCount++;
    if (repeatCount >= REPEAT_LIMIT) {
      return { action: 'break' }; // Safety valve
    }

    // PERSIST FIX: Save the AI's text content as a visible message BEFORE adding correction.
    // This ensures the text is available on reload (live display already shows it via _notifyAssistantMessage).
    // Only save if there's actual text content (not just whitespace).
    if (currentResponse.content && currentResponse.content.trim().length > 0) {
      context.conversationManager.addMessage('assistant', currentResponse.content);
      await context.conversationManager.save();
    }

    // Send comprehensive correction message with loop context and exit options
    const correctionMessage = `LOOP CONTEXT: You are currently in an autonomous tool execution loop. Text-only responses are rejected - you MUST respond with a tool call.

To exit this loop, call the \`end_loop\` tool. Your text response is already displayed to the user - the end_loop tool just signals that you are done and control should return to the user.

You cannot respond without a tool call. Either continue with the next tool in your plan, or call end_loop to finish.`;
    await appendEmptyContentCorrection(context.conversationManager, correctionMessage);
    const response = await _getNextAIResponse([], context);
    return { action: 'continue', response, repeatCount, toolFailureAttempts };
  }

  // 3.5 FIX: Add assistant message with tool_calls to conversation BEFORE executing tools
  // This ensures the tool result messages have a matching parent assistant message with IDs
  // Required by Mistral and other strict APIs for tool_call_id validation
  const addedToolCallsToConversation = context.currentToolSupport === true && currentResponse.toolCalls.length > 0;
  if (addedToolCallsToConversation) {
    const content = currentResponse.content || null;
    const metadata = currentResponse.provider_metadata || null;
    context.conversationManager.addMessage('assistant', content, currentResponse.toolCalls, null, metadata);
    await context.conversationManager.save();
  }

  // 4. Execute Tools - wrapped in try/catch to handle abort and maintain message parity
  let toolResults;
  try {
    toolResults = await _executeToolCalls(currentResponse.toolCalls, context);
  } catch (execError) {
    // If execution was aborted/cancelled after we added the assistant message with tool_calls,
    // we MUST add stub tool responses for ALL tool calls to maintain message parity.
    // Otherwise Mistral (and other strict APIs) will error with:
    // "Not the same number of function calls and responses"
    if (addedToolCallsToConversation && execError.message?.includes('cancelled')) {
      logger.warn('Process cancelled mid-execution; adding cancellation responses for tool calls');
      const cancelledResult = {
        error: 'Process was cancelled by user',
        cancelled: true,
      };
      for (const toolCall of currentResponse.toolCalls) {
        // Check if a response was already added for this tool call
        const messages = context.conversationManager.getMessages?.() ?? context.conversationManager.messages ?? [];
        const hasResponse = messages.some(m => m.role === 'tool' && m.tool_call_id === toolCall.id);
        if (!hasResponse) {
          context.conversationManager.addMessage('tool', JSON.stringify(cancelledResult), null, toolCall.id);
        }
      }
      await context.conversationManager.save();
    }
    // Re-throw to be handled by caller
    throw execError;
  }

  // 5. Handle Execution Failures
  if (toolResults.some(r => !r.success)) {
    repeatCount++;
    _logToolFailures(toolResults, repeatCount, REPEAT_LIMIT);
  }

  // 5.5 Check for end_loop tool - terminate the loop
  const endLoopResult = toolResults.find(r => r.result?._endLoop === true || r.result?.data?._endLoop === true);
  if (endLoopResult) {
    if (isDebugEnabled()) logger.debug('end_loop tool detected; terminating loop');
    return { action: 'break' };
  }

  // 6. Legacy Mode Notification
  if (context.currentToolSupport !== true && toolResults.length > 0) {
    _notifyLegacyToolResults(toolResults, context);
  }

  // 7. Get Next Response
  try {
    const response = await _getNextAIResponse(toolResults, context);
    return { action: 'continue', response, repeatCount, toolFailureAttempts };
  } catch (error) {
    logger.error('API Error during loop cycle:', error);
    toolFailureAttempts++;
    if (toolFailureAttempts >= MAX_TOOL_FAILURE_ATTEMPTS) {
      return { action: 'return', value: await _runToolFailureFallback(context) };
    }
    // TODO: Ideally we should delay here before retrying or use specific API retry logic
    // For now, we treat it as a tool failure attempt to prevent infinite loops on broken APIs

    // Construct a temporary error response to trigger retry logic in next cycle or falling back
    // Since we can't get a valid response, we might need to manually trigger refusal handling logic
    // But _handleToolRefusal needs a response object.

    // Force a retry by returning a fake "failure" response that will be caught by isToolCallFailure next time?
    // Or just recurse?
    // Simpler: Return a "continue" with the SAME response (if we didn't update it) but increment failure count?
    // But we need NEW response.

    // If we return action 'continue' without response? loop breaks?
    // _runLoopIteration: currentResponse = cycleResult.response.

    // We must return a valid response structure to continue.
    // If we failed to get one, we are in trouble.
    // Fallback immediately if we can't get response?
    // OR try to return a dummy response that says "I failed"?

    return { action: 'return', value: await _runToolFailureFallback(context) };
  }
}

// --- Helper Functions ---

async function _handleParseError(response, context, repeatCount, limit) {
  if (isDebugEnabled()) {
    logger.info(`AI response parse error (retry ${repeatCount}/${limit})`, {
      content: response.content,
    });
  }
  appendEmptyContentCorrection(context.conversationManager, response);
  const messages = _getConversationMessages(context);
  const systemPrompt = await context.getSystemPrompt();
  return _chatWithAI(messages, systemPrompt, context);
}

async function _handleToolRefusal(response, context, attempts) {
  appendToolFailureCorrection(context.conversationManager, response);
  const nextAttempt = attempts + 1;
  const retryCallId = `${TOOL_RETRY_STATUS_PREFIX}-${Date.now()}-${nextAttempt}`;
  const label = buildRetryLabel(nextAttempt, MAX_TOOL_FAILURE_ATTEMPTS);
  const delayMs = getRetryDelayMs(attempts - 1);

  emitRetryStatus('start', retryCallId, label);
  try {
    if (delayMs) await delayWithSignal(delayMs, context.signal);
    const messages = _getConversationMessages(context);
    const systemPrompt = await context.getSystemPrompt();
    return await _chatWithAI(messages, systemPrompt, context);
  } finally {
    emitRetryStatus('end', retryCallId);
  }
}

// eslint-disable-next-line complexity, max-lines-per-function
async function _executeToolCalls(toolCalls, context) {
  const { onToolResult, signal, currentToolSupport, conversationManager } = context;
  const results = [];

  for (const toolCall of toolCalls) {
    if (signal?.aborted) throw new Error('Process was cancelled');

    const toolName = toolCall?.function?.name || toolCall?.name;
    const toolArgs = toolCall?.function?.arguments || toolCall?.arguments;
    let result = null;
    let isSuccess = false;
    let error = null;

    try {
      const parsedArgs = typeof toolArgs === 'string' ? JSON.parse(toolArgs) : toolArgs;
      const executionStart = Date.now();

      // Log tool call before execution
      interactionLogger.logToolCall(toolName, parsedArgs, toolCall.id);

      // Permission check for destructive tools
      // Permission check for destructive tools
      if (toolPermissionManager.isDestructive(toolName)) {
        const permission = toolPermissionManager.getPermission(toolName);

        if (permission === PermissionState.DENY) {
          // Tool is blacklisted - deny without prompting
          result = {
            error: game.i18n?.localize('SIMULACRUM.ToolConfirmation.Blacklisted') ||
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
            await onToolResult({ role: 'tool', content: JSON.stringify(result), toolCallId: toolCall.id, toolName });
          }
          continue;
        }

        if (permission === PermissionState.ASK) {
          // Need to prompt user for confirmation
          const confirmResult = await _promptToolConfirmation(toolName, parsedArgs, toolCall.id, context);

          if (confirmResult === 'deny') {
            result = {
              error: game.i18n?.localize('SIMULACRUM.ToolConfirmation.Denied') ||
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
              await onToolResult({ role: 'tool', content: JSON.stringify(result), toolCallId: toolCall.id, toolName });
            }
            continue;
          }

          if (confirmResult === 'blacklist') {
            await toolPermissionManager.setPermission(toolName, PermissionState.DENY);
            result = {
              error: game.i18n?.localize('SIMULACRUM.ToolConfirmation.Blacklisted') ||
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
              await onToolResult({ role: 'tool', content: JSON.stringify(result), toolCallId: toolCall.id, toolName });
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

      if (toolName !== 'read_tool_output' && estimatedTokens > TOKEN_THRESHOLD && conversationManager.toolOutputBuffer) {
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
        conversationManager.addMessage('tool', JSON.stringify(resultForConversation), null, toolCall.id);
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
    const durationMs = typeof executionStart !== 'undefined' ? Date.now() - executionStart : 0;
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
  return new Promise((resolve) => {
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
      context.signal.addEventListener('abort', () => {
        Hooks.off('simulacrumToolConfirmationResponse', hookId);
        resolve('deny');
      }, { once: true });
    }
  });
}


// eslint-disable-next-line no-unused-vars
async function _getNextAIResponse(toolResults, context) {
  const { getSystemPrompt, conversationManager, aiClient } = context;

  // Context Compaction: Trigger before next AI call
  if (conversationManager && aiClient) {
    try {
      const compacted = await conversationManager.compactHistory(aiClient);
      if (compacted && isDebugEnabled()) {
        logger.debug('Conversation history compacted during tool loop');
      }
    } catch (err) {
      logger.warn('Compaction failed during tool loop:', err);
    }
  }

  const messages = _getConversationMessages(context);
  const systemPrompt = await getSystemPrompt();
  return _chatWithAI(messages, systemPrompt, context);
}

// --- Utilities ---

function _truncateInitialResult(result, toolName) {
  const MAX_OUTPUT_CHARS = 10000;
  if (typeof result.content === 'string' && result.content.length > MAX_OUTPUT_CHARS) {
    const truncatedContent = result.content.substring(0, MAX_OUTPUT_CHARS);
    const lineCount = truncatedContent.split('\n').length;

    // Add pagination hint for read_document tool
    const paginationHint = toolName === 'read_document'
      ? ` Use startLine/endLine parameters to read specific sections (e.g., if search found match at line 500, use startLine: 480, endLine: 520).`
      : '';

    result.content =
      truncatedContent +
      `\n... [Output truncated at ${MAX_OUTPUT_CHARS} characters, showing ~${lineCount} lines.${paginationHint}]`;
  }
}

function _getConversationMessages(context) {
  return context.conversationManager.getMessages?.() ?? context.conversationManager.messages ?? [];
}

async function _chatWithAI(messages, systemPrompt, context) {
  const { aiClient, tools, currentToolSupport, signal } = context;
  const toolsToSend = currentToolSupport === true ? tools : null;

  // We already have messages.
  // But original `getNextAIResponse` constructed `messagesToSend` manually for native mode?
  // "For native mode, build messages without system (will be added by chatWithSystem)"
  // And "Add tool results to conversation context for native mode only".
  // Wait, didn't `conversationManager.addMessage('tool')` already do that?
  // Yes, line 325 in original code.
  // `getNextAIResponse` lines 415-425 duplicated that logic?
  // "Add tool results to conversation context for native mode only"
  // `const messagesToSend = [...conversationMessages];`
  // `messagesToSend.push({ ... })`.
  // If `conversationManager` already has them, this DOUBLES them!
  // UNLESS `conversationManager.addMessage` doesn't persist to `messages` array immediately?
  // `conversationManager` is usually stateful.
  // I suspect original code had a bug of duplication OR `conversationManager` is not stateful in that way?
  // Actually, `conversationManager.addMessage` pushes to `this.messages`.
  // So `conversationMessages` (got from `getMessages()`) HAS them.
  // So `getNextAIResponse` adding them AGAIN to `messagesToSend` is suspicious.
  // Ah, wait. `conversationManager` usage in `processToolCallLoop` vs `executeToolCalls`.
  // In `executeToolCalls`: `conversationManager.addMessage` is called.
  // In `getNextAIResponse`: `const conversationMessages = conversationManager.getMessages...`
  // So `conversationMessages` *includes* the tool outputs.
  // Then `getNextAIResponse` iterates `toolResults` and PUSHES THEM AGAIN?
  // Complexity 47 might hide bugs.

  // I will assume `conversationManager` handles state.
  // I will use `messages` from manager.

  // Sanitize for fallback
  const sysMsg = { role: 'system', content: systemPrompt };
  const fallbackMsgs = sanitizeMessagesForFallback([sysMsg, ...messages]);

  const raw =
    currentToolSupport !== true
      ? await aiClient.chat(fallbackMsgs, toolsToSend, { signal })
      : await aiClient.chatWithSystem(messages, () => systemPrompt, toolsToSend, { signal });

  const normalized = normalizeAIResponse(raw);

  // Legacy fallback tool parsing
  if (
    context.currentToolSupport !== true &&
    (!normalized.toolCalls || !normalized.toolCalls.length)
  ) {
    const parsed = parseInlineToolCall?.(normalized.content);
    if (parsed && parsed.name) {
      normalized.toolCalls = [
        {
          id: 'fallback_' + Date.now(),
          function: { name: parsed.name, arguments: JSON.stringify(parsed.arguments || {}) },
        },
      ];
    }
  }
  return normalized;
}

/**
 * Extract the response parameter from tool calls
 * The response parameter is the canonical way for AI to communicate with users
 * @param {Array} toolCalls - Array of tool calls from the AI response
 * @returns {string|null} The combined response text or null if none found
 */
function _extractToolResponse(toolCalls) {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return null;
  }

  // Collect responses from all tool calls that have them
  const responses = toolCalls
    .map(tc => {
      // Arguments may be a JSON string or already parsed object
      const args = tc.function?.arguments || tc.arguments;
      if (!args) return null;

      try {
        const parsed = typeof args === 'string' ? JSON.parse(args) : args;
        return parsed?.response;
      } catch (_e) {
        return null;
      }
    })
    .filter(r => r && typeof r === 'string' && r.trim().length > 0);

  if (responses.length === 0) {
    return null;
  }

  // Join multiple responses with newlines
  return responses.join('\n\n');
}

async function _notifyAssistantMessage(response, context) {
  if (context.onToolResult && !response._parseError) {
    // Deduplicate identical content within the same loop to prevent UI spam
    // (Common phenomenon where AI repeats "I will search for..." in every step)
    const content = response.content?.trim();
    if (content && content !== context.lastEmittedContent) {
      await context.onToolResult({ role: 'assistant', content: response.content, _fromToolLoop: true });
      context.lastEmittedContent = content;
    }
    // Flag as emitted to prevent duplication in ConversationEngine
    response._emitted = true;
  }
}

function _notifyLegacyToolResults(toolResults, context) {
  const latest = toolResults[toolResults.length - 1];
  const msg = latest.success
    ? `Tool execution completed: ${latest.toolName} executed successfully. Result: ${JSON.stringify(latest.result)}`
    : `Tool execution failed: ${latest.toolName} failed.`;
  context.conversationManager.addMessage('system', msg);
}

function _logToolFailures(toolResults, retryCount, limit) {
  if (isDebugEnabled()) {
    logger.info(`Tool execution failures (retry ${retryCount}/${limit})`, {
      failedCount: toolResults.filter(r => !r.success).length,
    });
  }
}

async function _runToolFailureFallback(context) {
  const instruction = 'Tool calls are temporarily disabled. Provide a plain language response.';
  const msgs = _getConversationMessages(context);
  const last = msgs[msgs.length - 1];
  if (last?.content !== instruction) {
    context.conversationManager.addMessage('system', instruction);
  }
  const systemPrompt = await context.getSystemPrompt();
  const raw = await context.aiClient.chatWithSystem(msgs, () => systemPrompt, null, {
    signal: context.signal,
  });
  const fallback = normalizeAIResponse(raw);
  const text =
    (fallback.content || '') + '\n\nNote: Tool functionality was temporarily unavailable.';
  return { ...fallback, content: text, display: text, toolCalls: [] };
}

function _handleRepeatLimit(context, response, count, limit) {
  // Log error (use logger not console)
  logger.error(`Repeat limit reached after ${limit} retries`, { count });

  const msg = 'Tool execution limit reached.';
  if (context.currentToolSupport === true) {
    context.conversationManager.addMessage('tool', msg, null, 'tool_limit_error');
  } else {
    context.conversationManager.addMessage('system', msg);
  }
  return {
    content: '',
    display: null,
    _toolLimitReachedError: true,
    toolCalls: [],
    endTask: true,
  };
}
