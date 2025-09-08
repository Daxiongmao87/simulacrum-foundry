/**
 * Tool calling loop handler for agentic behavior
 * Handles sequential tool execution and conversation flow
 */

import { toolRegistry } from './tool-registry.js';
import { isDiagnosticsEnabled, createLogger } from '../utils/dev.js';
import { performPostToolVerification } from './tool-verification.js';

/**
 * Process tool call loop for continuation after fallback tool execution
 */
export async function processToolCallLoop(
  normalized, 
  tools, 
  conversationManager,
  aiClient,
  getSystemPrompt
) {
  let final = normalized;
  let safeguard = 8; // backup guard to prevent runaway
  let lastSig = null;
  let repeatCount = 0;
  const REPEAT_LIMIT = 3;
  let guardTriggered = false;
  
  while (Array.isArray(final.toolCalls) && final.toolCalls.length && safeguard-- > 0) {
    for (const call of final.toolCalls) {
      const name = call?.function?.name || call?.name;
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
        conversationManager.addMessage('tool', JSON.stringify(payload), null, call?.id);
        
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
      } catch (err) {
        const payload = {
          ok: false,
          tool: name,
          call_id: call?.id,
          args,
          error: { message: err?.message, type: err?.constructor?.name || 'ToolError', details: err?.details }
        };
        conversationManager.addMessage('tool', JSON.stringify(payload), null, call?.id);
      }
    }
    
    if (guardTriggered) break;
    
    // Continue the agentic loop
    const followRaw = await aiClient.chat([
      { role: 'system', content: getSystemPrompt() },
      ...conversationManager.messages
    ], tools);
    
    final = normalizeAIResponse(followRaw);
    conversationManager.addMessage('assistant', final.content, final.toolCalls);
  }
  
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