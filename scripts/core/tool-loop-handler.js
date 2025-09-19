/**
 * Simplified tool execution handler - pure tool execution logic
 * No conversation management - that's handled by ChatHandler
 */

import { createLogger, isDebugEnabled } from '../utils/logger.js';
import { toolRegistry } from './tool-registry.js';
import { performPostToolVerification } from './tool-verification.js';
import { SimulacrumCore } from './simulacrum-core.js';
import { sanitizeMessagesForFallback } from '../utils/ai-normalization.js';
import { appendEmptyContentCorrection } from './correction.js';

/**
 * Sanitize messages for fallback when tool calling is not supported
 * Filters out tool roles and ensures only valid roles are sent
 */
const logger = createLogger('ToolLoop');

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
    Hooks.call('simulacrum:processStatus', {
      state: 'start',
      callId,
      label: 'Thinking...',
      toolName: 'agentic-loop'
    });

    let currentResponse = initialResponse;
    const REPEAT_LIMIT = 5;
    let repeatCount = 0;
    let iterationCount = 0;
    
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
          content: currentResponse.content,
          display: true // Signal to the UI that this content should be displayed
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
        const raw = currentToolSupport !== true
          ? await aiClient.chat(sanitizeMessagesForFallback([{ role: 'system', content: getSystemPrompt() }, ...conversationMessages]), toolsToSend, { signal })
          : await aiClient.chatWithSystem(conversationMessages, getSystemPrompt, toolsToSend, { signal });
        currentResponse = SimulacrumCore._normalizeAIResponse(raw);
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
        content: currentResponse.content,
        display: true
      });
    }
    return currentResponse;
  } finally {
    // Ensure the process status is always marked as ended
    Hooks.call('simulacrum:processStatus', { state: 'end', callId });
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
      
      // Add tool result to conversation based on tool support mode
      if (currentToolSupport === true) {
        // Native mode: use tool role messages
        conversationManager.addMessage('tool', JSON.stringify(result), null, toolCall.id);
      }
      
      // Notify about tool result
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
  
  const raw = currentToolSupport !== true 
    ? await aiClient.chat(sanitizeMessagesForFallback([{ role: 'system', content: getSystemPrompt() }, ...messagesToSend]), toolsToSend, { signal })
    : await aiClient.chatWithSystem(messagesToSend, getSystemPrompt, toolsToSend, { signal });
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