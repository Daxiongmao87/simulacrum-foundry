/**
 * Simulacrum Core - Main module logic
 */
import { AIClient } from './ai-client.js';
import { ConversationManager } from './conversation.js';
import { toolRegistry } from './tool-registry.js';
import { DocumentCreateTool } from '../tools/document-create.js';
import { DocumentReadTool } from '../tools/document-read.js';
import { DocumentUpdateTool } from '../tools/document-update.js';
import { DocumentDeleteTool } from '../tools/document-delete.js';
import { DocumentListTool } from '../tools/document-list.js';
import { DocumentSearchTool } from '../tools/document-search.js';
import { DocumentSchemaTool } from '../tools/document-schema.js';
import { DocumentAPI } from './document-api.js';
import { createLogger } from '../utils/logger.js';
import { isDiagnosticsEnabled } from '../utils/dev.js';
import { mapFallbackArguments } from './argument-mapper.js';
import { performPostToolVerification } from './tool-verification.js';
import { processToolCallLoop } from './tool-loop-handler.js';
class SimulacrumCore {
  static logger = createLogger('Core');
  static toolCallingSupported = null; // null=unknown, true/false after probe

  static _sanitizeMessagesForFallback(messages) {
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
   * Initialize the Simulacrum Core
   */
  static init() {
    // Initialize AI client
    this.aiClient = null;
    
    // Initialize conversation manager
    this.conversationManager = null;
    
    // Register hooks
    this.registerHooks();
  }
  
  /**
   * Register FoundryVTT hooks
   */
  static registerHooks() {
    // Initialize when Foundry is ready
    Hooks.once('ready', () => {
      this.onReady();
    });
    
    // Persist state on shutdown if possible
    Hooks.once('shutdown', () => {
      try {
        this.saveConversationState();
      } catch (_e) {
        /* no-op */
      }
    });
    
    // Handle document changes
    Hooks.on('createDocument', (document, options, userId) => {
      this.notifyDocumentChange('create', document, userId);
    });
    
    Hooks.on('updateDocument', (document, changes, options, userId) => {
      this.notifyDocumentChange('update', document, userId, changes);
    });
    
    Hooks.on('deleteDocument', (document, options, userId) => {
      this.notifyDocumentChange('delete', document, userId);
    });
  }
  
  /**
   * Handle Foundry ready event
   */
  static async onReady() {
    // Initialize AI client
    await this.initializeAIClient();
    
    // Initialize conversation manager
    this.conversationManager = new ConversationManager(
      game.user.id,
      game.world.id
    );
    // Attempt to load any previously saved conversation state
    try {
      await this.loadConversationState();
    } catch (_e) {
      // Ignore load errors in MVP; start with empty state
    }
    
    // Register default tools so the model can call them
    this.registerDefaultTools();

    // Probe whether the current endpoint/model supports function calling
    try {
      await this.detectToolCallingSupport();
    } catch (_e) { /* ignore */ }
    
    this.logger.info('Module initialized');
  }
  
  /**
   * Initialize the AI client
   */
  static async initializeAIClient() {
    try {
      const apiKey = game.settings.get('simulacrum', 'apiKey');
      const baseURL = game.settings.get('simulacrum', 'baseURL');
      const model = game.settings.get('simulacrum', 'model');
      
      // Do not enforce API key at this layer. Some endpoints may not require it.
      
      // Create AI client (provider-agnostic)
      this.aiClient = new AIClient({
        apiKey,
        baseURL,
        model
      });
      
      // Validate connection
      // await this.aiClient.validateConnection();
      
      this.logger.info('AI client initialized');
    } catch (error) {
      this.logger.error('Failed to initialize AI client', error);
    }
  }
  
  /**
   * Process a user message
   * @param {string} message - User message
   * @param {Object} user - User who sent the message
   * @returns {Object} AI response
   */
  static async processMessage(message) {
    try {
      // Check if AI client is initialized
      if (!this.aiClient) {
        await this.initializeAIClient();
        if (!this.aiClient) {
          throw new Error('AI client not initialized');
        }
      }
      
      // Add user message to conversation
      this.conversationManager.addMessage('user', message);
      
      // Get available tools
      const tools = toolRegistry.getToolSchemas();
      // Diagnostics: log tool schemas sent (names only)
      try {
        if (isDiagnosticsEnabled()) {
          const diag = createLogger('AIDiagnostics');
          const toolNames = Array.isArray(tools) ? tools.map(t => t?.function?.name || t?.name).filter(Boolean) : [];
          diag.info('tools', { count: toolNames.length, names: toolNames });
        }
      } catch {}
      // Centralized system prompt (ephemeral; not persisted in conversation)
      const systemPrompt = this.getSystemPrompt();
      // Use a non-persistent system message to steer tool usage
      const messages = [
        { role: 'system', content: this.getSystemPrompt() },
        ...this.conversationManager.messages
      ];
      
      // Get AI response
      const sendTools = (this.toolCallingSupported === false) ? null : tools;
      const outbound = (this.toolCallingSupported === false) ? this._sanitizeMessagesForFallback(messages) : messages;
      const raw = await this.aiClient.chat(outbound, sendTools);
      if (raw == null) {
        throw new Error('Empty AI response');
      }
      // Normalize response into a consistent shape
      const normalized = (() => {
        // If already normalized
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
        // OpenAI-compatible: { choices: [ { message: { content, tool_calls } } ] }
        const __choices = raw && raw.choices;
        const choice = Array.isArray(__choices) ? __choices[0] : undefined;
        const msg = choice?.message ?? {};
        const content = typeof msg.content === 'string' ? msg.content : '';
        let toolCalls = msg.tool_calls || [];
        // Legacy providers may return a single function_call instead of tool_calls
        if ((!toolCalls || toolCalls.length === 0) && msg.function_call && msg.function_call.name) {
          toolCalls = [{ id: msg.function_call.id, function: { name: msg.function_call.name, arguments: msg.function_call.arguments } }];
        }
        // Some providers (Responses API style) wrap assistant messages differently; try to extract text
        if (!content && !toolCalls?.length && (Array.isArray(raw && raw.output) && (raw.output[0] && raw.output[0].content))) {
          const parts = raw.output[0].content;
          const text = parts.map?.(p => p?.text ?? '').filter(Boolean).join('\n');
          return { content: text || '', display: text || '', toolCalls: [], model: raw?.model, usage: raw?.usage, raw };
        }
        return {
          content,
          display: content,
          toolCalls,
          model: raw?.model,
          usage: raw?.usage,
          raw
        };
      })();
      // Diagnostics: log tool_calls returned (names only)
      try {
        if (isDiagnosticsEnabled()) {
          const diag = createLogger('AIDiagnostics');
          const names = Array.isArray(normalized.toolCalls) ? normalized.toolCalls.map(c => c?.function?.name || c?.name).filter(Boolean) : [];
          diag.info('tool_calls', { count: names.length, names });
        }
      } catch {}
      // If no native tool_calls, attempt to detect and strip a fenced JSON tool_call
      let parsedInline = null;
      if (!Array.isArray(normalized.toolCalls) || normalized.toolCalls.length === 0) {
        parsedInline = this._parseInlineToolCall(normalized.content);
      }

      // Add assistant response (with inline tool_call stripped from display)
      const assistantVisibleContent = parsedInline?.cleanedText ?? normalized.content;
      this.conversationManager.addMessage('assistant', assistantVisibleContent, normalized.toolCalls);

      // Fallback parse: if the assistant did not return tool_calls, attempt to
      // detect a fenced or inline JSON tool_call block regardless of provider probe.
      // This makes us resilient to routers/endpoints that claim tool support but
      // sometimes respond without tool_calls.
      if ((!Array.isArray(normalized.toolCalls) || normalized.toolCalls.length === 0)) {
        const parsed = parsedInline || this._parseInlineToolCall(normalized.content);
        if (parsed && parsed.name) {
          const name = parsed.name;
          const originalArgs = parsed.arguments || {};
          
          // Apply argument compatibility mapping for better fallback success
          const args = mapFallbackArguments(name, originalArgs);
          
          try {
            const exec = await toolRegistry.executeTool(name, args);
            const toolContent = exec?.result?.content ?? exec?.result?.display ?? JSON.stringify(exec?.result ?? exec);
            this.conversationManager.addMessage('tool', toolContent, null, undefined);
          } catch (err) {
            const toolContent = `Tool '${name}' failed: ${err.message}`;
            this.conversationManager.addMessage('tool', toolContent, null, undefined);
          }

          // Continue the agentic loop - let the model continue naturally after tool execution
          const continueMessages = [
            { role: 'system', content: this.getSystemPrompt() },
            ...this.conversationManager.messages
          ];
          
          const followRaw = await this.aiClient.chat(continueMessages, this.toolCallingSupported ? tools : null);
          const followNorm = (() => {
            if (typeof followRaw?.content === 'string') {
              return {
                content: followRaw.content,
                display: followRaw.display ?? followRaw.content,
                toolCalls: followRaw.toolCalls ?? followRaw.tool_calls ?? [],
                model: followRaw.model,
                usage: followRaw.usage,
                raw: followRaw
              };
            }
            const __choices = followRaw && followRaw.choices;
            const choice = Array.isArray(__choices) ? __choices[0] : undefined;
            const msg = choice?.message ?? {};
            const content = typeof msg.content === 'string' ? msg.content : '';
            let toolCalls = msg.tool_calls || [];
            if ((!toolCalls || toolCalls.length === 0) && msg.function_call && msg.function_call.name) {
              toolCalls = [{ id: msg.function_call.id, function: { name: msg.function_call.name, arguments: msg.function_call.arguments } }];
            }
            return { content, display: content, toolCalls, model: followRaw?.model, usage: followRaw?.usage, raw: followRaw };
          })();
          
          this.conversationManager.addMessage('assistant', followNorm.content, followNorm.toolCalls);
          
          // Continue the agentic loop if there are more tool calls
          if (Array.isArray(followNorm.toolCalls) && followNorm.toolCalls.length > 0) {
            // Recursively process the follow-up tool calls
            return await processToolCallLoop(
              followNorm, 
              tools, 
              this.conversationManager,
              this.aiClient,
              this.getSystemPrompt.bind(this)
            );
          }
          
          try { await this.saveConversationState(); } catch {}
          return followNorm;
        }
      }
      // Tool-calling loop: execute tools && iterate until model finishes
      let final = normalized;
      // Loop guard state (detect consecutive identical tool+args)
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
            if (sig === lastSig) repeatCount += 1; else { lastSig = sig; repeatCount = 1; }
            if (repeatCount >= REPEAT_LIMIT) {
              guardTriggered = true;
              const notice = `Loop guard: Detected ${repeatCount} consecutive calls to '${name}' with identical arguments. Adjust the plan or provide a final answer.`;
              // Emit UI status and add assistant notice
              try {
                if (typeof Hooks !== 'undefined' && Hooks?.callAll) {
                  Hooks.callAll('simulacrum:processStatus', {
                    state: 'guard',
                    label: 'Preventing loop: repeated tool call',
                    toolName: name,
                    callId: call?.id
                  });
                }
              } catch (_e) { /* no-op */ }
              this.conversationManager.addMessage('assistant', notice);
              // Prepare return payload and break out
              final = { content: notice, display: notice, toolCalls: [], model: normalized?.model, usage: normalized?.usage, raw: null };
              break;
            }
          } catch (_e) { /* ignore */ }
          if (guardTriggered) break;
          // Optional UX: process label provided by the AI within tool args
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
          // Execute the requested tool via registry
          let exec = null;
          let toolError = null;
          try {
            try { if (isDiagnosticsEnabled()) createLogger('AIDiagnostics').info('exec start', { name }); } catch {}
            exec = await toolRegistry.executeTool(name, args);
            const payload = {
              ok: true,
              tool: name,
              call_id: call?.id,
              args,
              result: exec?.result ?? null,
              meta: { executionId: exec?.executionId, duration: exec?.duration }
            };
            this.conversationManager.addMessage('tool', JSON.stringify(payload), null, call?.id);
            try { if (isDiagnosticsEnabled()) createLogger('AIDiagnostics').info('exec success', { name }); } catch {}
          } catch (err) {
            toolError = err;
            const payload = {
              ok: false,
              tool: name,
              call_id: call?.id,
              args,
              error: { message: err?.message, type: err?.constructor?.name || 'ToolError', details: err?.details }
            };
            this.conversationManager.addMessage('tool', JSON.stringify(payload), null, call?.id);
            try { if (isDiagnosticsEnabled()) createLogger('AIDiagnostics').warn('exec error', { name, error: err?.message }); } catch {}
          } finally {
            if (typeof Hooks !== 'undefined' && Hooks?.callAll) {
              Hooks.callAll('simulacrum:processStatus', { state: 'end', callId: call?.id, toolName: name });
              
              // Emit plan label after tool completion to show what's next
              if (planLabel) {
                Hooks.callAll('simulacrum:processStatus', {
                  state: 'plan',
                  label: planLabel,
                  toolName: name,
                  callId: call?.id
                });
              }
            }
            
            // Post-tool verification pattern (like qwen-code) - only for successful executions  
            if (exec && !toolError) {
              try {
                await performPostToolVerification(name, args, exec?.result, this.conversationManager);
              } catch (verifyErr) {
                // Don't fail the whole operation if verification fails
                try { if (isDiagnosticsEnabled()) createLogger('AIDiagnostics').warn('verification error', { name, error: verifyErr?.message }); } catch {}
              }
            }
          }
        }
        if (guardTriggered) break;
        // Ask the model again with updated messages (tool outputs included)
        const followRaw = await this.aiClient.chat([
          { role: 'system', content: this.getSystemPrompt() },
          ...this.conversationManager.messages
        ], tools);
        final = (() => {
          if (typeof followRaw?.content === 'string') {
            return {
              content: followRaw.content,
              display: followRaw.display ?? followRaw.content,
              toolCalls: followRaw.toolCalls ?? followRaw.tool_calls ?? [],
              model: followRaw.model,
              usage: followRaw.usage,
              raw: followRaw
            };
          }
          const __fchoices = followRaw && followRaw.choices;
          const choice = Array.isArray(__fchoices) ? __fchoices[0] : undefined;
          const msg = choice?.message ?? {};
          const content = typeof msg.content === 'string' ? msg.content : '';
          let toolCalls = msg.tool_calls || [];
          if ((!toolCalls || toolCalls.length === 0) && msg.function_call && msg.function_call.name) {
            toolCalls = [{ id: msg.function_call.id, function: { name: msg.function_call.name, arguments: msg.function_call.arguments } }];
          }
          if (!content && !toolCalls?.length && (Array.isArray(followRaw && followRaw.output) && (followRaw.output[0] && followRaw.output[0].content))) {
            const parts = followRaw.output[0].content;
            const text = parts.map?.(p => p?.text ?? '').filter(Boolean).join('\n');
            return { content: text || '', display: text || '', toolCalls: [], model: followRaw?.model, usage: followRaw?.usage, raw: followRaw };
          }
          return { content, display: content, toolCalls, model: followRaw?.model, usage: followRaw?.usage, raw: followRaw };
        })();
        // Diagnostics: log tool_calls for follow-up
        try {
          if (isDiagnosticsEnabled()) {
            const diag = createLogger('AIDiagnostics');
            const names = Array.isArray(final.toolCalls) ? final.toolCalls.map(c => c?.function?.name || c?.name).filter(Boolean) : [];
            diag.info('tool_calls', { count: names.length, names });
          }
        } catch {}
        this.conversationManager.addMessage('assistant', final.content, final.toolCalls);
      }
      // Persist updated conversation state after processing completes
      try {
        await this.saveConversationState();
      } catch (_e) {
        /* ignore persistence failures */
      }
      return final;
    } catch (error) {
      this.logger.error('Error processing message', error);
      return {
        content: `Error: ${error.message}`,
        display: `❌ ${error.message}`
      };
    }
  }
  
  /**
   * Build a unique settings key for conversation persistence
   */

  /**
   * Clear the persisted and in-memory conversation history used for API calls.
   * Keeps the UI free to manage its own display, but ensures outbound payloads
   * only include messages visible after a clear.
   */
  static async clearConversation() {
    try {
      if (this.conversationManager) {
        this.conversationManager.clear();
      }
      try { await this.saveConversationState(); } catch { /* ignore */ }
      return true;
    } catch (_e) {
      return false;
    }
  }

  static getPersistenceKey() {
    const uid = game?.user?.id || 'unknown-user';
    const wid = game?.world?.id || 'unknown-world';
    return `conversationState:${uid}:${wid}`;
  }
  /**
   * Load conversation state from user flag or settings
   */
  static async loadConversationState() {
    const key = this.getPersistenceKey();
    let state = null;
    // Prefer user flag storage when available (per-user scope)
    try {
      if (game?.user && typeof game.user.getFlag === 'function') {
        state = await game.user.getFlag('simulacrum', game.world.id);
      }
    } catch (_e) {
      // fall back below
    }
    // Fallback to module settings if defined
    if (!state) {
      try {
        if (game?.settings && typeof game.settings.get === 'function') {
          state = game.settings.get('simulacrum', key);
        }
      } catch (_e) {
        // ignore
      }
    }
    if (!state) return false;
    // Validate and apply
    const msgs = Array.isArray(state.messages) ? state.messages : [];
    const tokens = Number.isFinite(state.sessionTokens) ? state.sessionTokens : 0;
    this.conversationManager.messages = msgs;
    this.conversationManager.sessionTokens = tokens;
    return true;
  }
  /**
   * Save conversation state to user flag or settings
   */
  static async saveConversationState() {
    if (!this.conversationManager) return false;
    const key = this.getPersistenceKey();
    const state = {
      messages: this.conversationManager.messages,
      sessionTokens: this.conversationManager.sessionTokens,
      v: 1
    };
    // Prefer user flag when available
    try {
      if (game?.user && typeof game.user.setFlag === 'function') {
        await game.user.setFlag('simulacrum', game.world.id, state);
        return true;
      }
    } catch (_e) {
      // fall back below
    }
    // Fallback to module settings when set() exists
    try {
      if (game?.settings && typeof game.settings.set === 'function') {
        await game.settings.set('simulacrum', key, state);
        return true;
      }
    } catch (_e) {
      // ignore
    }
    return false;
  }
  /**
   * Notify of document changes
   * @param {string} operation - Operation type (create, update, delete)
   * @param {Object} document - Document that changed
   * @param {string} userId - User ID
   * @param {Object} changes - Changes (for update)
   */
  static notifyDocumentChange(operation, document, userId, changes = null) {
    // Notify AI about document changes
    // This could be used to update the AI's context
    this.logger.debug(`Document ${operation}d`, {
      document: document.toJSON(),
      userId,
      changes
    });
  }
  
  /**
   * Get available document types
   * @returns {Array} Available document types
   */
  static getAvailableDocumentTypes() {
    return DocumentAPI.getAllDocumentTypes();
  }
  
  /**
   * Get tool registry
   * @returns {Object} Tool registry
   */
  static getToolRegistry() {
    return toolRegistry;
  }
  /**
   * Register the built-in document tools
   */
  static registerDefaultTools() {
    try {
      const tools = [
        new DocumentCreateTool(),
        new DocumentReadTool(),
        new DocumentUpdateTool(),
        new DocumentDeleteTool(),
        new DocumentListTool(),
        new DocumentSearchTool(),
        new DocumentSchemaTool()
      ];
      for (const t of tools) {
        if (typeof t.setDocumentAPI === 'function') {
          t.setDocumentAPI(DocumentAPI);
        }
        // In some test/mocked contexts, toolRegistry may only expose getToolSchemas.
        // Guard method access and register defensively to avoid init-time errors.
        const hasGetInfo = typeof toolRegistry.getToolInfo === 'function';
        const hasRegister = typeof toolRegistry.registerTool === 'function';
        // If we cannot register in this environment, skip silently.
        if (!hasRegister) {
          continue;
        }
        // Prefer checking existing registration via getToolInfo when available.
        const already = hasGetInfo ? Boolean(toolRegistry.getToolInfo(t.name)) : false;
        if (already) continue;
        // Attempt registration; tolerate duplicates deterministically.
        try {
          toolRegistry.registerTool(t);
        } catch (e) {
          const msg = String(e?.message || '');
          if (!/already exists/i.test(msg)) {
            throw e;
          }
        }
      }
    } catch (err) {
      this.logger.error('Failed to register default tools', err);
    }
  }
  /**
   * Build the ephemeral system prompt guiding tool usage.
   * Not persisted into conversation history.
   */
  static async detectToolCallingSupport() {
    try {
      const tools = toolRegistry.getToolSchemas();
      if (!Array.isArray(tools) || tools.length === 0) {
        this.toolCallingSupported = null;
        return false;
      }
      const names = tools.map(t => t?.function?.name).filter(Boolean);
      const candidate = names.includes('list_documents') ? 'list_documents' : names[0];
      const prompt = `If tool calling is available, call ${candidate} with an empty object. Otherwise reply with: NO_TOOLS`;
      const res = await this.aiClient.chat([
        { role: 'system', content: 'Tool support probe.' },
        { role: 'user', content: prompt }
      ], tools);
      const choice = res?.choices?.[0];
      const msg = choice?.message ?? {};
      const hasTools = (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) || (msg.function_call && msg.function_call.name);
      this.toolCallingSupported = !!hasTools;
      try { if (isDiagnosticsEnabled()) createLogger('AIDiagnostics').info('tool_support', { supported: this.toolCallingSupported }); } catch {}
      return this.toolCallingSupported;
    } catch (_e) {
      this.toolCallingSupported = null;
      return false;
    }
  }



  /**
   * Parse inline tool_call JSON from assistant content.
   * Accepts raw JSON, fenced code blocks, or inline JSON containing "tool_call".
   */
    static _parseInlineToolCall(text) {
    if (!text || typeof text !== 'string') return null;
    const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
    // Normalize possible HTML entities and tags if a provider or UI layer leaked them in
    const decode = (s) => s
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/<br\s*\/?>/gi, '\n');
    const original = decode(String(text));
    let obj = null;
    let cleaned = original;

    // 1) Fenced code block first (prefer explicit block)
    const block = original.match(/```\s*json\s*([\s\S]*?)```/i) || original.match(/```\s*([\s\S]*?)```/i);
    if (block && block[1]) {
      obj = tryParse(block[1].trim());
      if (obj) cleaned = original.replace(block[0], '').trim();
    }
    // 2) Direct parse of whole text as JSON (rare)
    if (!obj) obj = tryParse(original.trim());
    // 3) Inline JSON containing tool_call
    if (!obj && original.includes('tool_call')) {
      const start = original.indexOf('{');
      const end = original.lastIndexOf('}');
      if (start >= 0 && end > start) {
        const slice = original.slice(start, end + 1);
        obj = tryParse(slice);
        if (obj) cleaned = (original.slice(0, start) + original.slice(end + 1)).trim();
      }
    }
    if (!obj) {
      try { if (isDiagnosticsEnabled()) createLogger('AIDiagnostics').info('fallback.parse.none'); } catch {}
      return null;
    }
    const tc = obj.tool_call || obj.toolCall || obj.function_call || obj.functionCall || obj;
    const name = tc?.name || tc?.function?.name;
    const args = tc?.arguments || tc?.function?.arguments || {};
    if (!name) return null;
    let parsedArgs = args;
    if (typeof parsedArgs === 'string') {
      const p = tryParse(parsedArgs);
      parsedArgs = p || {};
    }
    // Validate tool name against registry
    try {
      const info = typeof toolRegistry.getToolInfo === 'function' ? toolRegistry.getToolInfo(name) : null;
      if (!info) return null;
    } catch (_e) {
      return null;
    }
    try { if (isDiagnosticsEnabled()) createLogger('AIDiagnostics').info('fallback.parse.found', { name }); } catch {}
    return { name, arguments: parsedArgs, cleanedText: cleaned };
  }


static getSystemPrompt() {
    if (this.toolCallingSupported === false) {
      let toolNames = [];
      try {
        const schemas = toolRegistry.getToolSchemas();
        toolNames = Array.isArray(schemas) ? schemas.map(s => s?.function?.name).filter(Boolean) : [];
      } catch (_e) {}
      const nameList = toolNames.length ? ` Valid tool names: ${toolNames.join(', ')}.` : '';
      return [
        'You are Simulacrum inside FoundryVTT.',
        'This endpoint does NOT support native tool calling. When an operation is needed,',
        'respond naturally AND include exactly one fenced JSON block with the tool call:',
        '```json {"tool_call":{"name":"<tool_name>","arguments":{...},"process_label":"<post-execution action>","plan_label":"<next iteration action>"}} ```',
        'Use valid JSON inside the block. Do not include any other JSON structures.',
        'Include both process_label (what happens after this tool finishes, e.g. "Verifying creation") and plan_label (next loop iteration, e.g. "Showing document details").',
        'Prefer taking action with reasonable defaults rather than asking for more details.',
        'When reasonable, propose a short plan and then call tools proactively to complete it.',
        'After calling a tool, continue the conversation naturally. You can call multiple tools sequentially.',
        'I will automatically verify document creation and updates by reading them back - expect to see verification results.',
        nameList
      ].join(' ');
    }
    return [
      'You are Simulacrum, an AI assistant operating inside FoundryVTT.',
      'You can manipulate campaign documents (create/read/update/delete/list/search) via tools.',
      'Prefer acting autonomously with reasonable defaults; avoid unnecessary clarification questions.',
      'When a user asks for an action, propose a brief plan and call suitable tools to complete it.',
      'You can call multiple tools in sequence to accomplish complex tasks.',
      'When calling a tool, include both process_label (what happens after tool finishes, e.g. "Verifying creation") and plan_label (next iteration action, e.g. "Showing document details") in the arguments.',
      'I will automatically verify document creation and updates by reading them back - expect to see verification results in the conversation.',
      'Continue the conversation naturally after tool execution - explain what you accomplished and offer next steps or ask clarifying questions for additional work.'
    ].join(' ');
  }
}
// Export the SimulacrumCore class
export { SimulacrumCore };
