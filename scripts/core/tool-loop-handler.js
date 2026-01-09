/* eslint-disable complexity, max-len, no-console */
/**
 * Simplified tool execution handler - pure tool execution logic
 * No conversation management - that's handled by ChatHandler
 */

import { createLogger, isDebugEnabled } from '../utils/logger.js';
import { toolRegistry } from './tool-registry.js';
import { performPostToolVerification } from './tool-verification.js';
import { sanitizeMessagesForFallback, normalizeAIResponse, parseInlineToolCall } from '../utils/ai-normalization.js';
import { appendEmptyContentCorrection, appendToolFailureCorrection } from './correction.js';
import {
  isToolCallFailure,
  buildRetryLabel,
  getRetryDelayMs,
  delayWithSignal
} from '../utils/retry-helpers.js';
import { emitProcessStatus, emitRetryStatus } from './hook-manager.js';

const logger = createLogger('ToolLoop');
const MAX_TOOL_FAILURE_ATTEMPTS = 3;
const TOOL_RETRY_STATUS_PREFIX = 'tool-retry';

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
  const REPEAT_LIMIT = 5;
  let repeatCount = 0;
  let toolFailureAttempts = 0;

  while (repeatCount < REPEAT_LIMIT) {
    if (context.signal?.aborted) throw new Error('Process was cancelled');

    if (currentResponse.content && currentResponse.content.trim().length > 0) {
      _notifyAssistantMessage(currentResponse, context);
    }

    // Process a single cycle of the loop
    const cycleResult = await _processLoopCycle(
      currentResponse, context, { toolFailureAttempts, repeatCount, REPEAT_LIMIT }
    );

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

  // 3. Terminate if no tools
  if (!Array.isArray(currentResponse.toolCalls) || currentResponse.toolCalls.length === 0) {
    if (isDebugEnabled()) logger.debug('No tool calls in current AI response; terminating loop');
    return { action: 'break' };
  }

  // 3.5 FIX: Add assistant message with tool_calls to conversation BEFORE executing tools
  // This ensures the tool result messages have a matching parent assistant message with IDs
  // Required by Mistral and other strict APIs for tool_call_id validation
  if (context.currentToolSupport === true && currentResponse.toolCalls.length > 0) {
    const content = currentResponse.content || null;
    context.conversationManager.addMessage('assistant', content, currentResponse.toolCalls);
    await context.conversationManager.save();
  }

  // 4. Execute Tools
  const toolResults = await _executeToolCalls(currentResponse.toolCalls, context);

  // 5. Handle Execution Failures
  if (toolResults.some(r => !r.success)) {
    repeatCount++;
    _logToolFailures(toolResults, repeatCount, REPEAT_LIMIT);
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
    logger.info(`AI response parse error (retry ${repeatCount}/${limit})`, { content: response.content });
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

// eslint-disable-next-line complexity
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
      const execution = await toolRegistry.executeTool(toolName, parsedArgs);
      result = execution.result;

      _truncateInitialResult(result);

      isSuccess = !result.error;

      if (currentToolSupport === true) {
        conversationManager.addMessage('tool', JSON.stringify(result), null, toolCall.id);
        await conversationManager.save();
      }

      if (isSuccess) {
        try {
          await performPostToolVerification(toolName, parsedArgs, result, onToolResult);
        } catch (e) { logger.warn(`Post-verification failed: ${toolName}`, e); }
      }

    } catch (err) {
      console.log(`ToolLoopHandler caught error during tool execution: ${err.message}`);
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

    if (onToolResult) {
      onToolResult({
        role: 'tool',
        content: JSON.stringify(result),
        toolCallId: toolCall.id,
        toolName
      });
    }
  }
  return results;
}

// eslint-disable-next-line no-unused-vars
async function _getNextAIResponse(toolResults, context) {
  const { getSystemPrompt } = context;
  const messages = _getConversationMessages(context);
  const systemPrompt = await getSystemPrompt();
  return _chatWithAI(messages, systemPrompt, context);
}

// --- Utilities ---

function _truncateInitialResult(result) {
  const MAX_OUTPUT_CHARS = 10000;
  if (typeof result.content === 'string' && result.content.length > MAX_OUTPUT_CHARS) {
    result.content = result.content.substring(0, MAX_OUTPUT_CHARS) +
      `\n... [Output truncated at ${MAX_OUTPUT_CHARS} characters.]`;
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

  const raw = currentToolSupport !== true
    ? await aiClient.chat(fallbackMsgs, toolsToSend, { signal })
    : await aiClient.chatWithSystem(messages, () => systemPrompt, toolsToSend, { signal });

  const normalized = normalizeAIResponse(raw);

  // Legacy fallback tool parsing
  if (context.currentToolSupport !== true && (!normalized.toolCalls || !normalized.toolCalls.length)) {
    const parsed = parseInlineToolCall?.(normalized.content);
    if (parsed && parsed.name) {
      normalized.toolCalls = [{
        id: 'fallback_' + Date.now(),
        function: { name: parsed.name, arguments: JSON.stringify(parsed.arguments || {}) }
      }];
    }
  }
  return normalized;
}

function _notifyAssistantMessage(response, context) {
  if (context.onToolResult && !response._parseError) {
    context.onToolResult({ role: 'assistant', content: response.content });
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
      failedCount: toolResults.filter(r => !r.success).length
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
  const raw = await context.aiClient.chatWithSystem(msgs, () => systemPrompt, null, { signal: context.signal });
  const fallback = normalizeAIResponse(raw);
  const text = (fallback.content || '') + '\n\nNote: Tool functionality was temporarily unavailable.';
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
    endTask: true
  };
}
