/* eslint-disable complexity, max-len, no-console */
// TODO: Refactor into modular helpers to resolve deep complexity debt (Tracked in #147)
/* eslint-disable max-lines */
/**
 * Simplified tool execution handler - pure tool execution logic
 * No conversation management - that's handled by ChatHandler
 */

import { createLogger, isDebugEnabled } from '../utils/logger.js';
import { toolRegistry } from './tool-registry.js';
import { COMPACTION_STATUS, MAX_COMPACTION_ROUNDS } from './conversation.js';
import {
  sanitizeMessagesForFallback,
  normalizeAIResponse,
  parseInlineToolCall,
  repairToolCallArguments,
} from '../utils/ai-normalization.js';
import { appendEmptyContentCorrection, appendToolFailureCorrection } from './correction.js';
import {
  isToolCallFailure,
  buildRetryLabel,
  getRetryDelayMs,
  delayWithSignal,
} from '../utils/retry-helpers.js';
import { emitProcessStatus, emitRetryStatus, SimulacrumHooks } from './hook-manager.js';
import { interactionLogger } from './interaction-logger.js';
import { executeToolCalls, storeToolJustification } from './tool-execution.js';
// Re-export for existing importers (chat-handler); the store lives in tool-execution.js.
export { retrieveToolJustification } from './tool-execution.js';

const logger = createLogger('ToolLoop');
const MAX_TOOL_FAILURE_ATTEMPTS = 3;
const TOOL_RETRY_STATUS_PREFIX = 'tool-retry';

/**
 * Execute tools from an AI response and continue autonomous loop
 */
export async function processToolCallLoop(options) {
  const callId = `tool-loop-${foundry.utils.randomID()}`;
  const loopId = callId;
  const context = { ...options, loopId };

  let terminalReason = 'unknown';

  try {
    emitProcessStatus('start', callId, { label: 'Thinking...', toolName: 'agentic-loop' });
    interactionLogger.logLoopEvent(loopId, 'loop_started', {
      initialToolCalls: options.initialResponse?.toolCalls?.length ?? 0,
    });

    const result = await _runLoopIteration(context);

    // Audit: every loop exit must carry an explicit terminal reason (#178).
    if (result?._terminalReason) {
      terminalReason = result._terminalReason;
    } else {
      logger.error('Loop exited without terminal reason', { loopId });
      terminalReason = 'unknown';
      if (result) result._terminalReason = 'unknown';
    }

    return result;
  } catch (error) {
    terminalReason = _classifyLoopError(error);
    throw error;
  } finally {
    interactionLogger.logLoopEvent(loopId, 'loop_ended', { reason: terminalReason });
    emitProcessStatus('end', callId, { reason: terminalReason });
  }
}

/**
 * Classify a loop error into a terminal reason string for timeline correlation.
 * @param {Error} error - The error thrown by the loop
 * @returns {string} 'cancelled' or 'error:<ErrorName>'
 */
function _classifyLoopError(error) {
  if (error?.name === 'AbortError' || /cancel/i.test(error?.message || '')) {
    return 'cancelled';
  }
  return `error:${error?.name || 'Error'}`;
}

// --- Internal Loop Logic ---

// eslint-disable-next-line max-lines-per-function -- Refactor tracked in #147
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
  let terminalReason = 'unknown';

  while (repeatCount < REPEAT_LIMIT) {
    interactionLogger.logLoopEvent(context.loopId, 'loop_iteration_advanced', {
      repeatCount,
    });

    if (context.signal?.aborted) throw new Error('Process was cancelled');

    // Circuit breaker check: detect if AI is generating same text-only response repeatedly
    const currentContent = currentResponse.content?.trim() || '';
    const hasToolCalls =
      Array.isArray(currentResponse.toolCalls) && currentResponse.toolCalls.length > 0;

    if (!hasToolCalls && currentContent.length > 0) {
      if (currentContent === lastResponseContent) {
        consecutiveRepeats++;
        logger.warn(
          `Circuit breaker: identical text-only response detected (${consecutiveRepeats}/${CIRCUIT_BREAKER_THRESHOLD})`
        );

        if (consecutiveRepeats >= CIRCUIT_BREAKER_THRESHOLD) {
          logger.error(
            `Circuit breaker triggered: AI repeated same response ${consecutiveRepeats} times without tool call`
          );

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
            _terminalReason: 'circuit_breaker',
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
    // We must ensure an assistant message bubble exists even if content is empty (pure tool call)
    // otherwise the pending tool card will attach to the *previous* assistant message (floating bug).
    const hasContent = currentResponse.content && currentResponse.content.trim().length > 0;
    const hasTools =
      Array.isArray(currentResponse.toolCalls) && currentResponse.toolCalls.length > 0;

    if (hasContent || hasTools) {
      await _notifyAssistantMessage(currentResponse, context);
    }

    // Emit pending tool state for each tool call AFTER assistant message exists
    // (UI appends pending cards to last assistant message)
    if (Array.isArray(currentResponse.toolCalls) && currentResponse.toolCalls.length > 0) {
      for (const toolCall of currentResponse.toolCalls) {
        const toolName = toolCall.function?.name || toolCall.name || 'Unknown Tool';
        const toolCallId =
          toolCall.id || `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

        // Emit pending tool state via callback (Closed Loop)
        if (context.onToolPending) {
          context.onToolPending({
            toolCallId,
            toolName,
            justification,
          });
        }

        // Emit hook for UI to render pending tool card (Backwards Compatibility / Observability)
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
    if (cycleResult.action === 'return') {
      cycleResult.value._terminalReason = cycleResult.reason || 'unknown';
      return cycleResult.value;
    }
    if (cycleResult.action === 'break') {
      terminalReason = cycleResult.reason || 'unknown';
      break;
    }

    // Update state for next iteration
    currentResponse = cycleResult.response;
    repeatCount = cycleResult.repeatCount;
    toolFailureAttempts = cycleResult.toolFailureAttempts;
  }

  // Handle Repeat Limit if loop finished naturally without break
  if (repeatCount >= REPEAT_LIMIT) {
    const value = _handleRepeatLimit(context, currentResponse, repeatCount, REPEAT_LIMIT);
    value._terminalReason = 'repeat_limit';
    return value;
  }

  // NOTE: We do NOT need to call _notifyAssistantMessage here.
  // The content was already notified at the start of the final iteration (Line 50)
  // or will be handled by the caller. Invoking it here causes duplicates.

  currentResponse._terminalReason = terminalReason;
  return currentResponse;
}

// eslint-disable-next-line max-lines-per-function -- Refactor tracked in #147
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
      const value = await _runToolFailureFallback(context);
      return { action: 'return', value, reason: 'tool_failure_fallback' };
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
      return { action: 'break', reason: 'repeat_limit' };
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
    interactionLogger.logLoopEvent(context.loopId, 'continuation_requested', {
      reason: 'text_only_correction',
    });
    const response = await _getNextAIResponse([], context);
    return { action: 'continue', response, repeatCount, toolFailureAttempts };
  }

  // 3.5 FIX: Add assistant message with tool_calls to conversation BEFORE executing tools
  // This ensures the tool result messages have a matching parent assistant message with IDs
  // Required by Mistral and other strict APIs for tool_call_id validation
  const addedToolCallsToConversation =
    context.currentToolSupport === true && currentResponse.toolCalls.length > 0;
  if (addedToolCallsToConversation) {
    const content = currentResponse.content || null;
    const metadata = currentResponse.provider_metadata || null;
    // Strip transient UI-only fields (justification, response) from stored tool_calls
    // to reduce token accumulation in conversation history. These fields are already
    // consumed for display before this point (justification for pending cards, response
    // for message content). Original toolCalls are preserved for executeToolCalls below.
    const sanitizedToolCalls = _sanitizeToolCallsForHistory(currentResponse.toolCalls);
    context.conversationManager.addMessage(
      'assistant',
      content,
      sanitizedToolCalls,
      null,
      metadata
    );
    await context.conversationManager.save();
  }

  // 4. Execute Tools - wrapped in try/catch to handle abort and maintain message parity
  let toolResults;
  try {
    toolResults = await executeToolCalls(currentResponse.toolCalls, context);
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
        const messages =
          context.conversationManager.getMessages?.() ?? context.conversationManager.messages ?? [];
        const hasResponse = messages.some(m => m.role === 'tool' && m.tool_call_id === toolCall.id);
        if (!hasResponse) {
          context.conversationManager.addMessage(
            'tool',
            JSON.stringify(cancelledResult),
            null,
            toolCall.id
          );
        }
      }
      await context.conversationManager.save();
    }
    // Re-throw to be handled by caller
    throw execError;
  }

  interactionLogger.logLoopEvent(context.loopId, 'tool_results_committed', {
    committed: toolResults.length,
    successful: toolResults.filter(r => r.success).length,
    toolNames: toolResults.map(r => r.toolName),
  });

  // 5. Handle Execution Failures
  if (toolResults.some(r => !r.success)) {
    repeatCount++;
    _logToolFailures(toolResults, repeatCount, REPEAT_LIMIT);
  }

  // 5.5 Check for end_loop tool - terminate the loop
  const endLoopResult = toolResults.find(
    r => r.result?._endLoop === true || r.result?.data?._endLoop === true
  );
  if (endLoopResult) {
    if (isDebugEnabled()) logger.debug('end_loop tool detected; terminating loop');

    // Auto-close task tracker if manage_task has an active task
    const manageTaskTool = toolRegistry.getTool('manage_task');
    if (manageTaskTool?.currentTask) {
      if (isDebugEnabled()) logger.debug('end_loop: closing orphaned task tracker');
      Hooks.callAll(SimulacrumHooks.TASK_FINISHED);
      manageTaskTool.currentTask = null;
    }

    return { action: 'break', reason: 'end_loop' };
  }

  // 6. Legacy Mode Notification
  if (context.currentToolSupport !== true && toolResults.length > 0) {
    _notifyLegacyToolResults(toolResults, context);
  }

  // 7. Get Next Response (with retry on transient API errors)
  interactionLogger.logLoopEvent(context.loopId, 'continuation_requested', {
    reason: 'after_tool_results',
    toolResults: toolResults.length,
  });
  for (let apiAttempt = 0; apiAttempt < MAX_TOOL_FAILURE_ATTEMPTS; apiAttempt++) {
    try {
      const response = await _getNextAIResponse(toolResults, context);
      return { action: 'continue', response, repeatCount, toolFailureAttempts };
    } catch (error) {
      logger.error(
        `API Error during loop cycle (attempt ${apiAttempt + 1}/${MAX_TOOL_FAILURE_ATTEMPTS}):`,
        error
      );
      // Cancellation is not transient — propagate immediately without retry sleep.
      if (_classifyLoopError(error) === 'cancelled') {
        throw error;
      }
      if (apiAttempt + 1 >= MAX_TOOL_FAILURE_ATTEMPTS) {
        const value = await _runToolFailureFallback(context);
        return { action: 'return', value, reason: 'tool_failure_fallback' };
      }
      const delayMs = getRetryDelayMs(apiAttempt);
      await delayWithSignal(delayMs, context.signal);
    }
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

// eslint-disable-next-line no-unused-vars
async function _getNextAIResponse(toolResults, context) {
  const { getSystemPrompt, conversationManager, aiClient } = context;

  let systemPrompt = await getSystemPrompt();

  // Context Compaction: account for system prompt overhead and loop until within budget
  if (conversationManager && aiClient) {
    try {
      let rounds = 0;
      let promptOverhead = conversationManager.estimatePromptOverhead(systemPrompt);

      while (rounds < MAX_COMPACTION_ROUNDS) {
        const compactionStatus = await conversationManager.compactHistory(aiClient, promptOverhead);
        rounds++;
        if (compactionStatus === COMPACTION_STATUS.WITHIN_BUDGET) break;
        if (compactionStatus === COMPACTION_STATUS.FAILED) break;

        if (isDebugEnabled()) logger.debug('Conversation history compacted during tool loop');
        systemPrompt = await getSystemPrompt();
        promptOverhead = conversationManager.estimatePromptOverhead(systemPrompt);
      }
    } catch (err) {
      logger.warn('Compaction failed during tool loop:', err);
    }
  }

  const messages = _getConversationMessages(context);
  return _chatWithAI(messages, systemPrompt, context);
}

// --- Utilities ---

/**
 * Strip transient fields from tool_calls before storing in conversation history.
 * justification and response are consumed for UI display before storage and
 * don't need to persist in context sent to the API on subsequent calls.
 * @param {Array} toolCalls - Original tool calls array
 * @returns {Array} New array with transient fields removed from arguments
 */
function _sanitizeToolCallsForHistory(toolCalls) {
  const TRANSIENT_FIELDS = ['response'];

  return toolCalls.map(tc => {
    // Access arguments from either location (standard or legacy)
    const argsRaw = tc.function?.arguments ?? tc.arguments;

    // Ensure stored history always has valid-JSON arguments. If the model
    // emitted a malformed string that slipped through normalization, replace
    // it with a sentinel payload so replaying the conversation does not
    // trigger provider-side parse 500s.
    const outcome = repairToolCallArguments(argsRaw);
    let parsed;
    if (outcome.ok) {
      parsed = outcome.argsObject;
    } else {
      parsed = {
        __simulacrumParseError: true,
        parseError: outcome.parseError,
        rawFragment:
          typeof argsRaw === 'string' ? argsRaw.slice(0, 500) : String(argsRaw).slice(0, 500),
      };
    }

    // Treat non-string args as a change to force re-serialization (ensures string storage)
    let changed = !outcome.ok || outcome.repaired || typeof argsRaw !== 'string';

    // Strip transient fields if result is an object.
    // Create a shallow copy if it is an object to avoid mutating the original tool call.
    if (parsed && typeof parsed === 'object') {
      let workingParsed = parsed;
      let hasTransientField = false;
      for (const field of TRANSIENT_FIELDS) {
        if (field in parsed) {
          hasTransientField = true;
          break;
        }
      }

      if (hasTransientField) {
        workingParsed = { ...parsed };
        for (const field of TRANSIENT_FIELDS) {
          delete workingParsed[field];
        }
        changed = true;
      }
      parsed = workingParsed;
    }

    if (!changed) return tc;

    const cleanArgs = JSON.stringify(parsed);

    if (tc.function) {
      return { ...tc, function: { ...tc.function, arguments: cleanArgs } };
    }
    return { ...tc, arguments: cleanArgs };
  });
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

  interactionLogger.logLoopEvent(context.loopId, 'api_request_started', {
    mode: currentToolSupport === true ? 'native' : 'fallback',
  });
  const startedAt = Date.now();

  let raw;
  try {
    raw =
      currentToolSupport !== true
        ? await aiClient.chat(fallbackMsgs, toolsToSend, { signal })
        : await aiClient.chatWithSystem(messages, () => systemPrompt, toolsToSend, { signal });
  } catch (error) {
    if (_classifyLoopError(error) === 'cancelled') {
      interactionLogger.logLoopEvent(context.loopId, 'api_request_aborted');
    } else {
      interactionLogger.logLoopEvent(context.loopId, 'api_request_failed', {
        error: error.message,
      });
    }
    throw error;
  }

  interactionLogger.logLoopEvent(context.loopId, 'api_request_finished', {
    ms: Date.now() - startedAt,
  });

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
    const content = response.content?.trim() || ''; // Use empty string if undefined

    // We emit if content is new OR if it's the first emission (even if empty) to serve as tool anchor
    if (content !== context.lastEmittedContent || !response._emitted) {
      // Pass content (even if empty) to UI. SidebarEventHandlers/ChatHandler must handle empty accordingly.
      await context.onToolResult({
        role: 'assistant',
        content: response.content || undefined,
        _fromToolLoop: true,
      });
      interactionLogger.logLoopEvent(context.loopId, 'assistant_emitted', {
        hasContent: Boolean(content),
      });
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
  interactionLogger.logLoopEvent(context.loopId, 'api_request_started', {
    mode: 'tool_failure_fallback',
  });
  const startedAt = Date.now();
  let raw;
  try {
    raw = await context.aiClient.chatWithSystem(msgs, () => systemPrompt, null, {
      signal: context.signal,
    });
  } catch (error) {
    if (_classifyLoopError(error) === 'cancelled') {
      interactionLogger.logLoopEvent(context.loopId, 'api_request_aborted');
    } else {
      interactionLogger.logLoopEvent(context.loopId, 'api_request_failed', {
        error: error.message,
      });
    }
    throw error;
  }
  interactionLogger.logLoopEvent(context.loopId, 'api_request_finished', {
    ms: Date.now() - startedAt,
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
