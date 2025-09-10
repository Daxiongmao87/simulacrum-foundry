/**
 * Tool calling loop handler for agentic behavior
 * Handles sequential tool execution and conversation flow
 */

import { toolRegistry } from './tool-registry.js';
import { performPostToolVerification } from './tool-verification.js';

// Track recent tool execution results for system prompt updates
let recentToolResults = [];

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
 * Generate system prompt with recent tool execution results
 * @param {Function} getSystemPrompt - Function to get base system prompt
 * @returns {string} System prompt with tool results
 */
function getSystemPromptWithToolResults(getSystemPrompt) {
  const basePrompt = getSystemPrompt();
  
  if (recentToolResults && recentToolResults.length > 0) {
    const latestResult = recentToolResults[recentToolResults.length - 1];
    const toolStatus = latestResult.success 
      ? `Recent tool execution: Tool "${latestResult.tool}" executed successfully. Result: ${JSON.stringify(latestResult.result)}`
      : `Recent tool execution: Tool "${latestResult.tool}" failed with error: ${latestResult.error}`;
      
    return `${basePrompt}

${toolStatus}`;
  }
  
  return basePrompt;
}

/**
 * Process tool call loop for continuation after fallback tool execution
 */
export async function processToolCallLoop(
  normalized, 
  tools, 
  conversationManager,
  aiClient,
  getSystemPrompt,
  toolCallingSupported = true,
  onAssistantMessage = null
) {
  let final = normalized;
  let lastSig = null;
  let repeatCount = 0;
  const REPEAT_LIMIT = 5;
  let guardTriggered = false;
  const currentToolSupport = toolCallingSupported; // Track current tool support state
  
  // Track correction attempts for failures
  let correctionAttempts = 0;
  const MAX_CORRECTION_ATTEMPTS = 3;
  const failureHistory = [];
  
  // Track autonomous task completion
  let endTaskSignaled = false;
  
  // Clear previous tool results for new loop
  recentToolResults = [];
  
  while (!endTaskSignaled) {
    // If no tool calls and no parse error, continue with empty iteration
    if ((!Array.isArray(final.toolCalls) || final.toolCalls.length === 0) && !final._parseError) {
      // AI provided a response but no tools - continue autonomous loop
      conversationManager.addMessage('assistant', final.content, final.toolCalls);
      
      // Call the callback if provided
      if (onAssistantMessage && typeof onAssistantMessage === 'function') {
        try {
          if (final.content) {
            onAssistantMessage({ content: final.content, display: final.display });
          }
        } catch (e) {
          // Ignore callback errors
        }
      }
      
      // Continue to next AI response
      const systemPrompt = getSystemPrompt();
      const conversationMessages = conversationManager.getMessages();
      const messagesWithSystemPrompt = [
        { role: 'system', content: systemPrompt },
        ...conversationMessages
      ];
      
      const followMessages = (currentToolSupport !== true) ? 
        _sanitizeMessagesForFallback(messagesWithSystemPrompt) : messagesWithSystemPrompt;
      const toolsToSend = (currentToolSupport === true) ? tools : null;
      
      let followRaw;
      try {
        followRaw = await aiClient.chat(followMessages, toolsToSend);
      } catch (err) {
        console.error('[Simulacrum:ToolLoop] AI chat request failed after retries:', err);
        const errorMessage = `I'm having trouble connecting to the AI service. Please try again later. (Error: ${err.message})`;
        conversationManager.addMessage('assistant', errorMessage);
        final = {
          content: errorMessage,
          display: errorMessage,
          toolCalls: [],
          model: normalized?.model,
          usage: {},
          raw: null
        };
        break;
      }
      
      final = normalizeAIResponse(followRaw);
      continue; // Go back to start of while loop
    }
    
    for (const call of final.toolCalls) {
      const name = call?.function?.name || call?.name;
      
      // Check if this is the end_task tool
      if (name === 'end_task') {
        console.log('[Simulacrum:ToolLoop] AI signaled task completion with end_task tool');
        endTaskSignaled = true;
        break;
      }
      
      let args = {};
      try {
        const rawArgs = call?.function?.arguments ?? call?.arguments ?? '{}';
        args = typeof rawArgs === 'string' ? JSON.parse(rawArgs ?? '{}') : (rawArgs ?? {});
      } catch (e) {
        args = {};
      }
      
      // Loop guard: check for repeated identical calls
      try {
        const sig = `${name}:${JSON.stringify(args)}`;
        if (sig === lastSig) {
          repeatCount += 1;
        } else {
          lastSig = sig;
          repeatCount = 1;
        }
        if (repeatCount >= REPEAT_LIMIT) {
          guardTriggered = true;
          const notice = `Loop guard: Detected ${repeatCount} consecutive calls to '${name}' with identical arguments. Adjust the plan or provide a final answer.`;
          conversationManager.addMessage('assistant', notice);
          final = {
            content: notice,
            display: notice,
            toolCalls: [],
            model: normalized?.model,
            usage: normalized?.usage,
            raw: null
          };
          break;
        }
      } catch (_e) { /* ignore */ }
      
      if (guardTriggered) break;
      
      // Optional UX: process and plan labels for recursive tool calls
      let planLabel = null;
      try {
        const processLabel = args.process_label ?? args.processLabel ?? args._process_label;
        planLabel = args.plan_label ?? args.planLabel ?? args._plan_label;
        
        if (processLabel && typeof Hooks !== 'undefined' && Hooks?.callAll) {
          Hooks.callAll('simulacrum:processStatus', {
            state: 'start',
            label: processLabel,
            toolName: name,
            callId: call?.id
          });
        }
      } catch (_e) {
        /* no-op */
      }
      
      // Execute the tool call
      try {
        const exec = await toolRegistry.executeTool(name, args);
        const payload = {
          ok: true,
          tool: name,
          call_id: call?.id,
          args,
          result: exec?.result ?? null,
          meta: { executionId: exec?.executionId, duration: exec?.duration }
        };
        
        // Reset correction attempts on successful tool execution
        correctionAttempts = 0;
        failureHistory.length = 0;
        
        // Track successful tool execution result
        recentToolResults.push({
          tool: name,
          success: true,
          result: exec?.result ?? null,
          timestamp: Date.now()
        });
        
        // Tool success will be handled via tool message response - don't pollute system prompt
        
        // Emit plan label after successful tool execution
        if (planLabel && typeof Hooks !== 'undefined' && Hooks?.callAll) {
          Hooks.callAll('simulacrum:processStatus', {
            state: 'plan',
            label: planLabel,
            toolName: name,
            callId: call?.id
          });
        }
        
        // Post-tool verification pattern (like qwen-code)
        await performPostToolVerification(name, args, exec?.result, conversationManager);

        // Add the tool's result to the conversation - use tool role for tool-compatible endpoints
        if (currentToolSupport === true) {
          conversationManager.addMessage('tool', JSON.stringify(exec?.result ?? null), null, call?.id);
        }
      } catch (err) {
        // Track this failure for correction attempts
        correctionAttempts++;
        failureHistory.push({
          attempt: correctionAttempts,
          tool: name,
          error: err?.message || 'Unknown error',
          type: err?.constructor?.name || 'ToolError',
          args: args,
          timestamp: Date.now()
        });
        
        // Check if we've exceeded max correction attempts
        if (correctionAttempts >= MAX_CORRECTION_ATTEMPTS) {
          console.error(`[Simulacrum:AgenticCorrection] AI failed to self-correct after ${MAX_CORRECTION_ATTEMPTS} attempts:`);
          failureHistory.forEach((failure, index) => {
            console.error(`  Attempt ${failure.attempt}: Tool '${failure.tool}' failed with: ${failure.error} (${failure.type})`);
            console.error(`    Args: ${JSON.stringify(failure.args)}`);
          });
          
          // Exit the loop to prevent further attempts
          guardTriggered = true;
          const notice = `Maximum correction attempts (${MAX_CORRECTION_ATTEMPTS}) exceeded. AI unable to self-correct from errors.`;
          conversationManager.addMessage('assistant', notice);
          final = {
            content: notice,
            display: notice,
            toolCalls: [],
            model: normalized?.model,
            usage: normalized?.usage,
            raw: null
          };
          break;
        }
        
        const payload = {
          ok: false,
          tool: name,
          call_id: call?.id,
          args,
          error: { message: err?.message, type: err?.constructor?.name || 'ToolError', details: err?.details }
        };
        
        // Track failed tool execution result
        recentToolResults.push({
          tool: name,
          success: false,
          error: err?.message || 'Unknown error',
          timestamp: Date.now()
        });
        
        // Add the error result to the conversation - use tool role for tool-compatible endpoints
        if (currentToolSupport === true) {
          const errorResult = { error: err?.message || 'Unknown error' };
          conversationManager.addMessage('tool', JSON.stringify(errorResult), null, call?.id);
        }
      }
    }
    
    if (guardTriggered) break;
    
    // Handle parse errors (including empty responses) for correction tracking
    if (final._parseError) {
      // Check if this is an empty response error vs JSON parse error
      if (final.content && final.content.includes('Empty response not allowed')) {
        correctionAttempts++;
        failureHistory.push({
          attempt: correctionAttempts,
          tool: 'AI_RESPONSE',
          error: 'Empty response not allowed - please provide a meaningful response to the user',
          type: 'EmptyResponseError',
          args: { response: 'empty' },
          timestamp: Date.now()
        });
        
        // Check if we've exceeded max correction attempts
        if (correctionAttempts >= MAX_CORRECTION_ATTEMPTS) {
          console.error(`[Simulacrum:AgenticCorrection] AI failed to self-correct after ${MAX_CORRECTION_ATTEMPTS} attempts:`);
          failureHistory.forEach((failure, index) => {
            console.error(`  Attempt ${failure.attempt}: ${failure.tool} failed with: ${failure.error} (${failure.type})`);
            console.error(`    Args: ${JSON.stringify(failure.args)}`);
          });
          
          guardTriggered = true;
          const notice = `Maximum correction attempts (${MAX_CORRECTION_ATTEMPTS}) exceeded. AI unable to provide meaningful responses.`;
          conversationManager.addMessage('assistant', notice);
          final = {
            content: notice,
            display: notice,
            toolCalls: [],
            model: normalized?.model,
            usage: normalized?.usage,
            raw: null
          };
          break;
        }
      }
      
      final._parseError = false;
    }
    
    // For legacy/fallback mode, add tool results as system message so AI notices them
    // Tool-compatible endpoints already have tool messages above
    if (currentToolSupport !== true && recentToolResults && recentToolResults.length > 0) {
      const latestResult = recentToolResults[recentToolResults.length - 1];
      const toolStatusMessage = latestResult.success 
        ? `Tool execution completed: ${latestResult.tool} executed successfully. Result: ${JSON.stringify(latestResult.result)}`
        : `Tool execution failed: ${latestResult.tool} failed with error: ${latestResult.error}`;
      
      // Add as newest system message so AI notices the tool results in legacy mode
      conversationManager.addMessage('system', toolStatusMessage);
    }
    
    // Build followup messages with fresh system prompt (like main processMessage does)
    const systemPrompt = getSystemPrompt();
    const conversationMessages = conversationManager.getMessages();
    const messagesWithSystemPrompt = [
      { role: 'system', content: systemPrompt },
      ...conversationMessages
    ];
    
    const followMessages = (currentToolSupport !== true) ? 
      _sanitizeMessagesForFallback(messagesWithSystemPrompt) : messagesWithSystemPrompt;
    const toolsToSend = (currentToolSupport === true) ? tools : null;
    
    let followRaw;
    try {
      followRaw = await aiClient.chat(followMessages, toolsToSend);
    } catch (err) {
      console.error('[Simulacrum:ToolLoop] AI chat request failed after retries:', err);
      const errorMessage = `I'm having trouble connecting to the AI service. Please try again later. (Error: ${err.message})`;
      conversationManager.addMessage('assistant', errorMessage);
      final = {
        content: errorMessage,
        display: errorMessage,
        toolCalls: [],
        model: normalized?.model,
        usage: {},
        raw: null
      };
      // Call the onAssistantMessage callback with the error message
      if (onAssistantMessage && typeof onAssistantMessage === 'function') {
        try {
          onAssistantMessage(final);
        } catch (e) {
          // Ignore callback errors
        }
      }
      break; // Exit the loop gracefully
    }
    
    final = normalizeAIResponse(followRaw);
    
    // Handle fallback tool calls if no native tool_calls found
    if ((!Array.isArray(final.toolCalls) || final.toolCalls.length === 0) && currentToolSupport !== true) {
      console.log('[Simulacrum:ToolLoop] No native tool calls found, attempting fallback parsing');
      try {
        // Import the method dynamically to avoid circular dependency
        const SimulacrumCore = await import('./simulacrum-core.js');
        const parsed = SimulacrumCore.SimulacrumCore._parseInlineToolCall(final.content);
        console.log('[Simulacrum:ToolLoop] Fallback parsing result:', parsed);
        
        if (parsed && parsed.name) {
          console.log(`[Simulacrum:ToolLoop] Creating fallback tool call for '${parsed.name}'`);
          final.toolCalls = [{
            id: `fallback_${Date.now()}`,
            function: {
              name: parsed.name,
              arguments: JSON.stringify(parsed.arguments || {})
            }
          }];
          final.content = parsed.cleanedText;
          final.display = parsed.cleanedText;
        } else if (parsed && parsed.parseError) {
          // Handle JSON parsing errors by creating error feedback for the AI
          correctionAttempts++;
          failureHistory.push({
            attempt: correctionAttempts,
            tool: 'JSON_PARSER',
            error: `JSON Parsing Error: ${parsed.parseError}`,
            type: 'ParseError',
            args: { content: parsed.content },
            timestamp: Date.now()
          });
          
          // Check if we've exceeded max correction attempts
          if (correctionAttempts >= MAX_CORRECTION_ATTEMPTS) {
            console.error(`[Simulacrum:AgenticCorrection] AI failed to self-correct after ${MAX_CORRECTION_ATTEMPTS} attempts:`);
            failureHistory.forEach((failure, index) => {
              console.error(`  Attempt ${failure.attempt}: ${failure.tool} failed with: ${failure.error} (${failure.type})`);
              console.error(`    Args: ${JSON.stringify(failure.args)}`);
            });
            
            guardTriggered = true;
            const notice = `Maximum correction attempts (${MAX_CORRECTION_ATTEMPTS}) exceeded. AI unable to self-correct from parsing errors.`;
            conversationManager.addMessage('assistant', notice);
            final = {
              content: notice,
              display: notice,
              toolCalls: [],
              model: normalized?.model,
              usage: normalized?.usage,
              raw: null
            };
            break;
          }
          
          console.log('[Simulacrum:ToolLoop] JSON parsing error detected, providing feedback to AI');
          const errorMessage = `JSON Parsing Error: ${parsed.parseError}

The JSON in your previous response was malformed. Please provide a valid JSON tool call in the correct format:
\`\`\`json
{"tool_call": {"name": "tool_name", "arguments": {...}}}
\`\`\`

Problematic content: ${parsed.content}`;
          
          // Update system message with error feedback
          conversationManager.updateSystemMessage(errorMessage);
          
          // Continue the loop to re-prompt the AI by setting a special parse error flag
          final.toolCalls = [];
          final.content = errorMessage;
          final.display = errorMessage;
          final._parseError = true; // Flag to continue loop despite no tool calls
        } else {
          console.log('[Simulacrum:ToolLoop] No valid tool call found in fallback parsing');
        }
      } catch (e) {
        console.error('[Simulacrum:ToolLoop] Fallback parsing error:', e.message);
      }
    }
    
    conversationManager.addMessage('assistant', final.content, final.toolCalls);
    
    // Call the callback if provided
    if (onAssistantMessage && typeof onAssistantMessage === 'function') {
      try {
        // Do not pass the raw `final` object; it may contain tool calls.
        // Only send the text content to the UI at this stage.
        if (final.content) {
          onAssistantMessage({ content: final.content, display: final.display });
        }
      } catch (e) {
        // Ignore callback errors
      }
    }
  }
  
  // After the loop, the `final` object contains the last AI response.
  // This is the concluding message of the tool interaction sequence.
  return final;
}

/**
 * Normalize AI response to consistent format
 */
function normalizeAIResponse(rawResponse) {
  if (typeof rawResponse?.content === 'string') {
    return {
      content: rawResponse.content,
      display: rawResponse.display ?? rawResponse.content,
      toolCalls: rawResponse.toolCalls ?? rawResponse.tool_calls ?? [],
      model: rawResponse.model,
      usage: rawResponse.usage,
      raw: rawResponse
    };
  }
  
  const choices = rawResponse?.choices;
  const choice = Array.isArray(choices) ? choices[0] : undefined;
  const msg = choice?.message ?? {};
  const content = typeof msg.content === 'string' ? msg.content : '';
  
  // Handle empty AI responses as recoverable error for AI correction
  if (!content || content.trim().length === 0) {
    return {
      content: 'Empty response not allowed - please provide a meaningful response to the user.',
      display: 'Empty response not allowed - please provide a meaningful response to the user.',
      toolCalls: [],
      model: rawResponse?.model,
      usage: rawResponse?.usage,
      raw: rawResponse,
      _parseError: true // Flag to continue loop for AI correction
    };
  }
  
  let toolCalls = msg.tool_calls || [];
  
  if ((!toolCalls || toolCalls.length === 0) && msg.function_call?.name) {
    toolCalls = [{
      id: msg.function_call.id,
      function: {
        name: msg.function_call.name,
        arguments: msg.function_call.arguments
      }
    }];
  }
  
  return {
    content,
    display: content,
    toolCalls,
    model: rawResponse?.model,
    usage: rawResponse?.usage,
    raw: rawResponse
  };
}

