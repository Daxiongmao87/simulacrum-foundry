/**
 * Simplified tool execution handler - pure tool execution logic
 * No conversation management - that's handled by ChatHandler
 */

import { createLogger, isDebugEnabled } from '../utils/logger.js';
import { toolRegistry } from './tool-registry.js';
import { performPostToolVerification } from './tool-verification.js';
import { SimulacrumCore } from './simulacrum-core.js';
import { sanitizeMessagesForFallback } from '../utils/ai-normalization.js';
import { appendEmptyContentCorrection, appendToolFailureCorrection } from './correction.js';
import {
  isToolCallFailure,
  buildRetryLabel,
  getRetryDelayMs,
  delayWithSignal,
  buildGenericFailureMessage
} from '../utils/retry-helpers.js';
import { emitProcessStatus } from './hook-manager.js';

/**
 * Sanitize messages for fallback when tool calling is not supported
 * Filters out tool roles and ensures only valid roles are sent
 */
const logger = createLogger('ToolLoop');

const MAX_TOOL_FAILURE_ATTEMPTS = 3;
const TOOL_RETRY_DELAYS_MS = [1000, 2000];
const TOOL_RETRY_STATUS_PREFIX = 'tool-retry';


async function runToolFailureFallback(conversationManager, aiClient, getSystemPrompt, signal) {
  const fallbackInstruction = 'Tool calls are temporarily disabled. Provide a plain language response without using any tools.';
  const messages = conversationManager.getMessages?.() ?? conversationManager.messages ?? [];
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'system' || lastMessage.content !== fallbackInstruction) {
    conversationManager.addMessage('system', fallbackInstruction);
  }

  try {
    const systemPromptRef = await getSystemPrompt();
    const raw = await aiClient.chatWithSystem(messages, () => systemPromptRef, null, { signal });
    const fallbackResponse = SimulacrumCore._normalizeAIResponse(raw);

    if (!fallbackResponse || fallbackResponse._parseError || isToolCallFailure(fallbackResponse)) {
      return buildGenericFailureMessage();
    }

    const notice = 'Note: Tool functionality was temporarily unavailable for this response.';
    const content = fallbackResponse.content
      ? `${fallbackResponse.content}\n\n${notice}`
      : notice;
    const display = fallbackResponse.display
      ? `${fallbackResponse.display}\n\n${notice}`
      : content;

    return {
      ...fallbackResponse,
      content,
      display,
      toolCalls: []
    };
  } catch (_error) {
    return buildGenericFailureMessage();
  }
}

/**
 * Execute tools from an AI response and continue autonomous loop
 */
export async function processToolCallLoop(
  initialResponse,
  tools,
  conversationManager,
  aiClient,
  getSystemPrompt,
  currentToolSupport,
  signal = null,
  onToolResult = null
) {
  const callId = `tool-loop-${foundry.utils.randomID()}`;
  try {
    // Signal start of the entire tool loop process
    emitProcessStatus('start', callId, 'Thinking...', 'agentic-loop');

    let currentResponse = initialResponse;
    const REPEAT_LIMIT = 5;
    let repeatCount = 0;
    let iterationCount = 0;
    let toolFailureAttempts = 0;

    while (repeatCount < REPEAT_LIMIT) {
      iterationCount++;
      if (isDebugEnabled()) logger.debug(`Start of loop iteration ${iterationCount} (retries: ${repeatCount})`);

      // Check for cancellation
      if (signal?.aborted) {
        if (isDebugEnabled()) logger.info('Process cancelled');
        throw new Error('Process was cancelled');
      }

      // --- Display AI's natural language content if present and not a parse error ---
      // This ensures conversational output is shown to the user.
      if (currentResponse.content && currentResponse.content.trim().length > 0 && onToolResult && !currentResponse._parseError) {
        onToolResult({
          role: 'assistant',
          content: currentResponse.content
        });
      }

      // Handle parse errors by getting AI correction
      if (currentResponse._parseError) {
        if (isDebugEnabled()) {
          logger.info(`AI response parse error (retry ${repeatCount + 1}/${REPEAT_LIMIT}):`, {
            content: currentResponse.content || '(empty)',
            contentLength: (currentResponse.content || '').length,
            toolCallsCount: (currentResponse.toolCalls || []).length,
            rawResponsePreview: JSON.stringify(currentResponse.raw || {}).substring(0, 200) + '...',
            parseErrorReason: currentResponse._parseError === true ? 'Empty content detected' : currentResponse._parseError
          });
        }
        repeatCount++; // Increment retry count for parse errors
        // Shared correction routine
        appendEmptyContentCorrection(conversationManager, currentResponse);
        // Request corrected response
        const conversationMessages = conversationManager.getMessages?.() ?? conversationManager.messages ?? [];
        const toolsToSend = currentToolSupport === true ? tools : null;
        const systemPromptRef = await getSystemPrompt();
        const raw = currentToolSupport !== true
          ? await aiClient.chat(sanitizeMessagesForFallback([{ role: 'system', content: systemPromptRef }, ...conversationMessages]), toolsToSend, { signal })
          : await aiClient.chatWithSystem(conversationMessages, () => systemPromptRef, toolsToSend, { signal });
        currentResponse = SimulacrumCore._normalizeAIResponse(raw);
        continue;
      }

      // Handle provider-level tool call failures before attempting execution
      if (isToolCallFailure(currentResponse)) {
        toolFailureAttempts += 1;
        appendToolFailureCorrection(conversationManager, currentResponse);

        if (toolFailureAttempts >= MAX_TOOL_FAILURE_ATTEMPTS) {
          const fallback = await runToolFailureFallback(conversationManager, aiClient, getSystemPrompt, signal);
          return fallback;
        }

        const nextAttempt = toolFailureAttempts + 1;
        const delayMs = getRetryDelayMs(toolFailureAttempts - 1);
        const retryCallId = `${TOOL_RETRY_STATUS_PREFIX}-${Date.now()}-${nextAttempt}`;
        const label = buildRetryLabel(nextAttempt, MAX_TOOL_FAILURE_ATTEMPTS);

        emitRetryStatus('start', retryCallId, label);
        try {
          if (delayMs) {
            await delayWithSignal(delayMs, signal);
          }
          const conversationMessages = conversationManager.getMessages?.() ?? conversationManager.messages ?? [];
          const toolsToSend = currentToolSupport === true ? tools : null;
          const systemPromptRef = await getSystemPrompt();
          const raw = currentToolSupport !== true
            ? await aiClient.chat(sanitizeMessagesForFallback([{ role: 'system', content: systemPromptRef }, ...conversationMessages]), toolsToSend, { signal })
            : await aiClient.chatWithSystem(conversationMessages, () => systemPromptRef, toolsToSend, { signal });
          currentResponse = SimulacrumCore._normalizeAIResponse(raw);
        } finally {
          emitRetryStatus('end', retryCallId);
        }
        continue;
      }

      // If no tool calls, terminate the loop - this is the intended behavior
      if (!Array.isArray(currentResponse.toolCalls) || currentResponse.toolCalls.length === 0) {
        if (isDebugEnabled()) logger.debug('No tool calls in current AI response; terminating loop');
        break; // Exit the loop - this is how the loop should terminate
      }

      // Execute all tool calls
      if (isDebugEnabled()) logger.debug(`Executing ${currentResponse.toolCalls.length} tool calls.`);
      const toolResults = await executeToolCalls(currentResponse.toolCalls, conversationManager, currentToolSupport, onToolResult, signal);


      // --- Check for tool execution failures and increment retry count ---
      const hasFailedTool = toolResults.some(result => !result.success);
      if (hasFailedTool) {
        if (isDebugEnabled()) {
          const failedTools = toolResults.filter(result => !result.success);
          logger.info(`Tool execution failures (retry ${repeatCount + 1}/${REPEAT_LIMIT}):`, {
            failedToolCount: failedTools.length,
            totalToolCount: toolResults.length,
            failureDetails: failedTools.map(tool => ({
              toolName: tool.toolName,
              error: tool.error?.message || tool.result?.error || 'Unknown error',
              arguments: tool.toolCall?.function?.arguments || tool.toolCall?.arguments
            }))
          });
        }
        repeatCount++; // Increment retry count for tool failures
      }

      // For legacy mode, add tool results as system message so AI notices them
      if (currentToolSupport !== true && toolResults.length > 0) {
        const latestResult = toolResults[toolResults.length - 1];
        const toolStatusMessage = latestResult.success
          ? `Tool execution completed: ${latestResult.toolName} executed successfully. Result: ${JSON.stringify(latestResult.result)}`
          : `Tool execution failed: ${latestResult.toolName} failed with error: ${latestResult.result.error}`;

        conversationManager.addMessage('system', toolStatusMessage);
      }

      // Get next AI response based on tool results
      if (isDebugEnabled()) logger.debug('Getting next AI response after tool execution');
      currentResponse = await getNextAIResponse(toolResults, conversationManager, aiClient, getSystemPrompt, currentToolSupport, tools, signal);
    }

    // If we hit the repeat limit, return the last response
    if (repeatCount >= REPEAT_LIMIT) {
      {
        const conversationMessages = conversationManager.getMessages?.() ?? conversationManager.messages ?? [];
        console.error(`Repeat limit reached after ${REPEAT_LIMIT} retries:`, {
          totalIterations: iterationCount,
          retryCount: repeatCount,
          lastResponseContent: currentResponse.content || '(empty)',
          lastResponseToolCalls: (currentResponse.toolCalls || []).length,
          conversationLength: conversationMessages.length,
          recentConversation: conversationMessages.slice(-3).map(msg => ({
            role: msg.role,
            contentLength: (msg.content || '').length,
            hasToolCalls: !!(msg.tool_calls && msg.tool_calls.length > 0),
            toolCallId: msg.tool_call_id || null
          }))
        });
      }
      const finalErrorMessage = {
        content: '', // This content is for internal AI context, but should not be displayed to the user if the caller defaults to displaying returned content.
        display: null,
        _toolLimitReachedError: true,
        toolCalls: [],
        endTask: true
      };
      // Do NOT call onToolResult here; this is an internal error for the AI to process.
      // Add this internal error message to the conversation for the AI to process for its final summary.
      const aiInstructionContent = 'Tool execution limit reached. Please provide a final, summarizing response to the user, explaining that the task is ending due to excessive tool failures.';
      if (currentToolSupport === true) {
        conversationManager.addMessage('tool', aiInstructionContent, null, 'tool_limit_error');
      } else {
        conversationManager.addMessage('system', aiInstructionContent);
      }
      return finalErrorMessage;
    }

    // If the loop exits gracefully (e.g., endTaskSignaled is true, or a final conversational response)
    // Ensure the last AI response's content is displayed if it hasn't been already.
    if (currentResponse.content && currentResponse.content.trim().length > 0 && onToolResult && !currentResponse._parseError) {
      onToolResult({
        role: 'assistant',
        content: currentResponse.content
      });
    }
    return currentResponse;
  } finally {
    // Ensure the process status is always marked as ended
    emitProcessStatus('end', callId);
  }
}

/**
 * Execute all tool calls and return results
 */
async function executeToolCalls(toolCalls, conversationManager, currentToolSupport, onToolResult, signal) {
  const results = [];

  for (const toolCall of toolCalls) {
    if (signal?.aborted) {
      throw new Error('Process was cancelled');
    }

    const toolName = toolCall?.function?.name || toolCall?.name;
    const toolArgs = toolCall?.function?.arguments || toolCall?.arguments;

    try {
      // Parse arguments if they're a string
      const parsedArgs = typeof toolArgs === 'string' ? JSON.parse(toolArgs) : toolArgs;

      // Get tool instance
      const tool = toolRegistry.getTool(toolName);
      if (!tool) {
        throw new Error(`Unknown tool: ${toolName}`);
      }

      // Execute tool
      const result = await tool.execute(parsedArgs);

      // Enforce global output truncation limit (Task-21)
      const MAX_OUTPUT_CHARS = 10000;
      if (typeof result.content === 'string' && result.content.length > MAX_OUTPUT_CHARS) {
        result.content = result.content.substring(0, MAX_OUTPUT_CHARS) +
          `\n... [Output truncated at ${MAX_OUTPUT_CHARS} characters. Use specific tool parameters (like startLine/endLine) to view specific sections.]`;
      }

      // Add tool result to conversation based on tool support mode
      if (currentToolSupport === true) {
        // Native mode: use tool role messages
        conversationManager.addMessage('tool', JSON.stringify(result), null, toolCall.id);
      }

      // Notify about tool result - Check if we should suppress UI notification for macros to avoid duplicates
      // Macros already output to chat via simple-macro logic or system logic
      // But we DO want the "Tool Result" card. 
      // The issue is likely that BOTH `processToolCallLoop` calls `onToolResult` AND something else does?
      // Wait, `processToolCallLoop` calls `onToolResult` around line 171 for assistant content, and line 371 for tool results.
      // ChatHandler.processUserMessage calls `handleToolResult` in `onToolResult` callback.
      // `handleToolResult` adds UI message.

      if (onToolResult) {
        onToolResult({
          role: 'tool',
          content: JSON.stringify(result),
          toolCallId: toolCall.id,
          toolName
        });
      }

      // Check if the result indicates an error (even if no exception was thrown)
      const isSuccess = !result.error;

      results.push({
        toolCall,
        toolName,
        result,
        success: isSuccess
      });

      // Post-tool verification if needed
      try {
        await performPostToolVerification(toolName, parsedArgs, result, onToolResult);
      } catch (verificationError) {
        logger.warn(`Post-tool verification failed for ${toolName}:`, verificationError);
      }

    } catch (error) {
      logger.error(`Tool execution failed for ${toolName}:`, error);

      const errorResult = {
        error: error.message,
        toolName,
        arguments: toolArgs
      };

      // Add tool error to conversation based on tool support mode  
      if (currentToolSupport === true) {
        // Native mode: use tool role messages
        conversationManager.addMessage('tool', JSON.stringify(errorResult), null, toolCall.id);
      }

      // Notify about tool error
      if (onToolResult) {
        onToolResult({
          role: 'tool',
          content: JSON.stringify(errorResult),
          toolCallId: toolCall.id,
          toolName
        });
      }

      results.push({
        toolCall,
        toolName,
        result: errorResult,
        success: false,
        error
      });
    }
  }

  return results;
}

// Consolidated correction flow uses appendEmptyContentCorrection in-loop

// Note: removed unused handleAutonomousContinuation function

/**
 * Get next AI response after tool execution
 */
async function getNextAIResponse(toolResults, conversationManager, aiClient, getSystemPrompt, currentToolSupport, tools, signal) {
  // Build context with tool results
  const conversationMessages = conversationManager.getMessages?.() ?? conversationManager.messages ?? [];

  // For native mode, build messages without system (will be added by chatWithSystem)
  const messagesToSend = [...conversationMessages];

  // Add tool results to conversation context for native mode only
  if (currentToolSupport === true) {
    for (const toolResult of toolResults) {
      messagesToSend.push({
        role: 'tool',
        content: JSON.stringify(toolResult.result),
        tool_call_id: toolResult.toolCall.id
      });
    }
  }

  const toolsToSend = currentToolSupport === true ? tools : null;

  const systemPromptRef = await getSystemPrompt();
  const raw = currentToolSupport !== true
    ? await aiClient.chat(sanitizeMessagesForFallback([{ role: 'system', content: systemPromptRef }, ...messagesToSend]), toolsToSend, { signal })
    : await aiClient.chatWithSystem(messagesToSend, () => systemPromptRef, toolsToSend, { signal });
  const normalized = SimulacrumCore._normalizeAIResponse(raw);

  // Handle fallback tool calls if no native tool_calls found and in legacy mode
  if ((!Array.isArray(normalized.toolCalls) || normalized.toolCalls.length === 0) && currentToolSupport !== true) {
    if (isDebugEnabled()) logger.debug('No native tool calls found; attempting fallback parsing');
    try {
      const parsed = SimulacrumCore._parseInlineToolCall?.(normalized.content);
      if (isDebugEnabled()) logger.debug('Fallback parsing result:', parsed);

      if (parsed && parsed.name) {
        if (isDebugEnabled()) logger.debug(`Creating fallback tool call for '${parsed.name}'`);
        normalized.toolCalls = [{
          id: 'fallback_' + Date.now(),
          function: {
            name: parsed.name,
            arguments: JSON.stringify(parsed.arguments || {})
          }
        }];
      }
    } catch (error) {
      logger.warn('Fallback tool parsing failed:', error);
    }
  }

  return normalized;
}

/**
 * Normalize AI response (simplified version)
 */
// Removed local normalizeAIResponse; using SimulacrumCore._normalizeAIResponse instead
