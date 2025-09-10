/**
 * Simplified tool execution handler - pure tool execution logic
 * No conversation management - that's handled by ChatHandler
 */

import { toolRegistry } from './tool-registry.js';
import { performPostToolVerification } from './tool-verification.js';

/**
 * Execute tools from an AI response and continue autonomous loop
 */
export async function processToolCallLoop(
  initialResponse, 
  conversationManager,
  aiClient,
  getSystemPrompt,
  signal = null,
  onToolResult = null
) {
  let currentResponse = initialResponse;
  let endTaskSignaled = false;
  const REPEAT_LIMIT = 5;
  let repeatCount = 0;
  
  while (!endTaskSignaled && repeatCount < REPEAT_LIMIT) {
    repeatCount++;
    
    // Check for cancellation
    if (signal?.aborted) {
      throw new Error('Process was cancelled');
    }
    
    // Handle parse errors by getting AI correction
    if (currentResponse._parseError) {
      currentResponse = await getAICorrectionForError(currentResponse, conversationManager, aiClient, getSystemPrompt, signal);
      continue;
    }
    
    // If no tool calls, handle autonomous continuation
    if (!Array.isArray(currentResponse.toolCalls) || currentResponse.toolCalls.length === 0) {
      return await handleAutonomousContinuation(currentResponse, conversationManager, aiClient, getSystemPrompt, signal, onToolResult);
    }
    
    // Execute all tool calls
    const toolResults = await executeToolCalls(currentResponse.toolCalls, onToolResult, signal);
    
    // Check if end_task was called
    const endTaskResult = toolResults.find(result => result.toolName === 'end_task');
    if (endTaskResult) {
      endTaskSignaled = true;
      if (onToolResult) {
        onToolResult({
          role: 'assistant',
          content: endTaskResult.result.content,
          display: endTaskResult.result.display
        });
      }
      return {
        content: endTaskResult.result.content,
        display: endTaskResult.result.display,
        toolCalls: [],
        endTask: true
      };
    }
    
    // Get next AI response based on tool results
    currentResponse = await getNextAIResponse(toolResults, conversationManager, aiClient, getSystemPrompt, signal);
  }
  
  // If we hit the repeat limit, return the last response
  if (repeatCount >= REPEAT_LIMIT) {
    if (onToolResult) {
      onToolResult({
        role: 'assistant',
        content: 'Tool execution limit reached. Stopping autonomous loop.',
        display: '⚠️ Tool execution limit reached'
      });
    }
  }
  
  return currentResponse;
}

/**
 * Execute all tool calls and return results
 */
async function executeToolCalls(toolCalls, onToolResult, signal) {
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
async function getAICorrectionForError(errorResponse, conversationManager, aiClient, getSystemPrompt, signal) {
  // Add error message to conversation for AI to see
  conversationManager.updateSystemMessage(errorResponse.content);
  
  // Get corrected response from AI
  const messages = [
    { role: 'system', content: getSystemPrompt() },
    ...conversationManager.getMessages()
  ];
  
  const raw = await aiClient.chat(messages, null, { signal });
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
async function getNextAIResponse(toolResults, conversationManager, aiClient, getSystemPrompt, signal) {
  // Build context with tool results
  const messages = [
    { role: 'system', content: getSystemPrompt() },
    ...conversationManager.getMessages()
  ];
  
  // Add tool results to conversation context
  for (const toolResult of toolResults) {
    messages.push({
      role: 'tool',
      content: JSON.stringify(toolResult.result),
      tool_call_id: toolResult.toolCall.id
    });
  }
  
  // Get AI response
  const tools = toolRegistry.getToolSchemas();
  const raw = await aiClient.chat(messages, tools, { signal });
  return normalizeAIResponse(raw);
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
      content: 'Empty response not allowed - please provide a meaningful response to the user.',
      display: 'Empty response not allowed - please provide a meaningful response to the user.',
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
  
  return {
    content,
    display: content,
    toolCalls,
    model: raw?.model,
    usage: raw?.usage,
    raw
  };
}