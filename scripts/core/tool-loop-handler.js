/**
 * Simplified tool execution handler - pure tool execution logic
 * No conversation management - that's handled by ChatHandler
 */

import { toolRegistry } from './tool-registry.js';
import { performPostToolVerification } from './tool-verification.js';
import { SimulacrumCore } from './simulacrum-core.js';

/**
 * Sanitize messages for fallback when tool calling is not supported
 * Filters out tool roles and ensures only valid roles are sent
 */
function _sanitizeMessagesForFallback(messages) {
  try {
    return (messages || []).filter(m => {
      const r = m && m.role;
      if (r !== 'system' && r !== 'user' && r !== 'assistant') return false;
      const c = typeof m.content === 'string' ? m.content.trim() : '';
      return c.length > 0;
    }).map(m => ({ role: m.role, content: String(m.content) }));
  } catch {
    return [];
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
  let currentResponse = initialResponse;
  const REPEAT_LIMIT = 5;
  let repeatCount = 0;
  
  while (repeatCount < REPEAT_LIMIT) {
    console.log(`[ToolLoop] --- Start of loop iteration ${repeatCount + 1} (Retry Count: ${repeatCount}) ---`);
    
    // Check for cancellation
    if (signal?.aborted) {
      console.log('[ToolLoop] Process cancelled.');
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
      console.log('[ToolLoop] AI response had a parse error, getting correction. Incrementing retry count.');
      repeatCount++; // Increment retry count for parse errors
      currentResponse = await getAICorrectionForError(currentResponse, conversationManager, aiClient, getSystemPrompt, currentToolSupport, tools, signal);
      continue;
    }
    
    // If no tool calls, terminate the loop - this is the intended behavior
    if (!Array.isArray(currentResponse.toolCalls) || currentResponse.toolCalls.length === 0) {
      console.log('[ToolLoop] No tool calls in current AI response. Terminating loop as intended.');
      break; // Exit the loop - this is how the loop should terminate
    }
    
    // Execute all tool calls
    console.log(`[ToolLoop] Executing ${currentResponse.toolCalls.length} tool calls.`);
    const toolResults = await executeToolCalls(currentResponse.toolCalls, conversationManager, currentToolSupport, onToolResult, signal);
    
    
    // --- Check for tool execution failures and increment retry count ---
    const hasFailedTool = toolResults.some(result => !result.success);
    if (hasFailedTool) {
      console.log('[ToolLoop] One or more tool calls failed. Incrementing retry count.');
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
    console.log('[ToolLoop] Getting next AI response after tool execution.');
    currentResponse = await getNextAIResponse(toolResults, conversationManager, aiClient, getSystemPrompt, currentToolSupport, tools, signal);
  }
  
  // If we hit the repeat limit, return the last response
  if (repeatCount >= REPEAT_LIMIT) {
    console.log('[ToolLoop] Repeat limit reached. Terminating loop.');
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
      
      results.push({
        toolCall,
        toolName,
        result,
        success: true
      });
      
      // Post-tool verification if needed
      try {
        await performPostToolVerification(toolName, parsedArgs, result, onToolResult);
      } catch (verificationError) {
        console.warn(`Post-tool verification failed for ${toolName}:`, verificationError);
      }
      
    } catch (error) {
      console.error(`Tool execution failed for ${toolName}:`, error);
      
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

/**
 * Get AI correction for parse errors
 */
async function getAICorrectionForError(errorResponse, conversationManager, aiClient, getSystemPrompt, currentToolSupport, tools, signal) {
  // Add error message to conversation for AI to see
  conversationManager.updateSystemMessage(errorResponse.content);
  
  // Get corrected response from AI
  const conversationMessages = conversationManager.getMessages?.() ?? conversationManager.messages ?? [];
  const messages = [
    { role: 'system', content: getSystemPrompt() },
    ...conversationMessages
  ];
  
  // Sanitize messages for legacy mode or use as-is for native mode
  const finalMessages = currentToolSupport !== true 
    ? _sanitizeMessagesForFallback(messages) 
    : messages;
  const toolsToSend = currentToolSupport === true ? tools : null;
  
  const raw = await aiClient.chat(finalMessages, toolsToSend, { signal });
  return normalizeAIResponse(raw);
}

/**
 * Handle autonomous continuation when no tools are called
 */
async function handleAutonomousContinuation(response, conversationManager, aiClient, getSystemPrompt, signal, onToolResult) {
  // For simple responses with no tools, just return
  // In future, this could check for autonomous continuation logic
  return response;
}

/**
 * Get next AI response after tool execution
 */
async function getNextAIResponse(toolResults, conversationManager, aiClient, getSystemPrompt, currentToolSupport, tools, signal) {
  // Build context with tool results
  const conversationMessages = conversationManager.getMessages?.() ?? conversationManager.messages ?? [];
  const messages = [
    { role: 'system', content: getSystemPrompt() },
    ...conversationMessages
  ];
  
  // Add tool results to conversation context for native mode only
  if (currentToolSupport === true) {
    for (const toolResult of toolResults) {
      messages.push({
        role: 'tool',
        content: JSON.stringify(toolResult.result),
        tool_call_id: toolResult.toolCall.id
      });
    }
  }
  
  // Sanitize messages for legacy mode or use as-is for native mode
  const finalMessages = currentToolSupport !== true 
    ? _sanitizeMessagesForFallback(messages) 
    : messages;
  const toolsToSend = currentToolSupport === true ? tools : null;
  
  const raw = await aiClient.chat(finalMessages, toolsToSend, { signal });
  const normalized = normalizeAIResponse(raw);
  
  // Handle fallback tool calls if no native tool_calls found and in legacy mode
  if ((!Array.isArray(normalized.toolCalls) || normalized.toolCalls.length === 0) && currentToolSupport !== true) {
    console.log('[ToolLoop] No native tool calls found, attempting fallback parsing');
    try {
      // Import the method dynamically to avoid circular dependency
      const SimulacrumCore = await import('./simulacrum-core.js');
      const parsed = SimulacrumCore.SimulacrumCore._parseInlineToolCall?.(normalized.content);
      console.log('[ToolLoop] Fallback parsing result:', parsed);
      
      if (parsed && parsed.name) {
        console.log(`[ToolLoop] Creating fallback tool call for '${parsed.name}'`);
        normalized.toolCalls = [{
          id: 'fallback_' + Date.now(),
          function: {
            name: parsed.name,
            arguments: JSON.stringify(parsed.arguments || {})
          }
        }];
      }
    } catch (error) {
      console.warn('[ToolLoop] Fallback tool parsing failed:', error);
    }
  }
  
  return normalized;
}

/**
 * Normalize AI response (simplified version)
 */
function normalizeAIResponse(raw) {
  if (typeof raw?.content === 'string') {
    return {
      content: raw.content,
      display: raw.display ?? raw.content,
      toolCalls: raw.toolCalls ?? raw.tool_calls ?? [],
      model: raw.model,
      usage: raw.usage,
      raw
    };
  }
  
  const choice = raw?.choices?.[0];
  const msg = choice?.message ?? {};
  const content = typeof msg.content === 'string' ? msg.content : '';
  
  // Handle empty responses
  if (!content || content.trim().length === 0) {
    return {
      content: 'Empty response not allowed - please provide a meaningful response to the user or make another tool call.',
      display: null, // Set display to null when it's a parse error for AI correction
      toolCalls: [],
      model: raw?.model,
      usage: raw?.usage,
      raw,
      _parseError: true
    };
  }
  
  let toolCalls = msg.tool_calls || [];
  if ((!toolCalls || toolCalls.length === 0) && msg.function_call && msg.function_call.name) {
    toolCalls = [{ id: msg.function_call.id, function: { name: msg.function_call.name, arguments: msg.function_call.arguments } }];
  }

  let finalContent = content;
  let finalDisplay = content;

  // Check for inline tool calls if no native toolCalls were found
  if ((!toolCalls || toolCalls.length === 0) && content) {
    const parseResult = SimulacrumCore._parseInlineToolCall(content);
    if (parseResult && parseResult.name) {
      // Add the parsed inline tool call to the toolCalls array
      toolCalls.push({
        id: `inline_${Date.now()}`,
        function: {
          name: parseResult.name,
          arguments: JSON.stringify(parseResult.arguments || {})
        }
      });

      // Format the tool call for display
      const formattedToolCall = `\
\
{\"tool_call\":{\"name\":\"${parseResult.name}\",\"arguments\":${JSON.stringify(parseResult.arguments || {})}}}\
\
`;

      // Combine cleaned text and formatted tool call for display
      finalContent = parseResult.cleanedText;
      finalDisplay = `${parseResult.cleanedText.trim()}\n\n${formattedToolCall}`;
    }
  }
  
  return {
    content: finalContent,
    display: finalDisplay,
    toolCalls,
    model: raw?.model,
    usage: raw?.usage,
    raw
  };
}