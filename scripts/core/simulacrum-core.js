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
    } catch (e) { 
      // If detection fails, assume NO tool support (safer default)
      this.toolCallingSupported = false;
      try {
        if (isDiagnosticsEnabled()) {
          createLogger('AIDiagnostics').warn('tool_detection_failed', { error: e.message });
        }
      } catch {}
    }
    
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
  static async processMessage(message, user, options = {}) {
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
      
      // Get context length setting and limit conversation history
      const contextLength = game?.settings?.get('simulacrum', 'contextLength') || 20;
      const conversationMessages = this.conversationManager?.messages || [];
      const limitedMessages = conversationMessages.length > contextLength 
        ? conversationMessages.slice(-contextLength)
        : conversationMessages;
      
      // Use a non-persistent system message to steer tool usage
      const messages = [
        { role: 'system', content: this.getSystemPrompt() },
        ...limitedMessages
      ];
      
      // Get AI response - check legacy mode setting instead of probe
      const legacyMode = game.settings.get('simulacrum', 'legacyMode');
      const useNativeTools = !legacyMode;
      const sendTools = useNativeTools ? tools : null;
      const outbound = useNativeTools ? messages : this._sanitizeMessagesForFallback(messages);
      
      console.log('[Simulacrum:ProcessMessage] Chat request configuration:', {
        toolCallingSupported: this.toolCallingSupported,
        useNativeTools,
        sendingTools: !!sendTools,
        fallbackMode: this.toolCallingSupported === false,
        toolCount: tools?.length || 0
      });
      
      // Debug logging
      try {
        if (isDiagnosticsEnabled()) {
          createLogger('AIDiagnostics').info('chat_request', { 
            toolCallingSupported: this.toolCallingSupported, 
            sendingTools: !!sendTools,
            fallbackMode: this.toolCallingSupported === false
          });
        }
      } catch {}
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
        
        // Handle empty AI responses as recoverable error for AI correction
        if (!content || content.trim().length === 0) {
          return {
            content: 'Empty response not allowed - please provide a meaningful response to the user.',
            display: 'Empty response not allowed - please provide a meaningful response to the user.',
            toolCalls: [],
            model: raw?.model,
            usage: raw?.usage,
            raw,
            _parseError: true // Flag to continue loop for AI correction
          };
        }
        
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
      if (options.onAssistantMessage) {
        const messageForUI = { ...normalized, content: assistantVisibleContent, display: assistantVisibleContent };
        options.onAssistantMessage(messageForUI);
      }

      // Handle fallback tool calls - if no native tool_calls, try to parse JSON blocks
      if ((!Array.isArray(normalized.toolCalls) || normalized.toolCalls.length === 0)) {
        const parseResult = parsedInline || this._parseInlineToolCall(normalized.content);
        if (parseResult && parseResult.name) {
          // Convert parsed fallback tool call to standard format for unified processing
          normalized.toolCalls = [{
            id: `fallback_${Date.now()}`,
            function: {
              name: parseResult.name,
              arguments: JSON.stringify(parseResult.arguments || {})
            }
          }];
          // Update display content to remove the JSON block
          normalized.content = parseResult.cleanedText;
          normalized.display = parseResult.cleanedText;
        } else if (parseResult && parseResult.parseError) {
          // Handle JSON parsing errors in main flow
          const errorMessage = [
            game.i18n.format('SIMULACRUM.Errors.JSONParsingError', { error: parseResult.parseError }),
            '',
            game.i18n.localize('SIMULACRUM.Errors.JSONParsingInstructions'),
            game.i18n.localize('SIMULACRUM.Errors.JSONFormatExample'),
            '',
            game.i18n.format('SIMULACRUM.Errors.ProblematicContent', { content: parseResult.content })
          ].join('\n');
          
          // Update system message with error feedback
          this.conversationManager.updateSystemMessage(errorMessage);
          
          // Set up to continue processing with error feedback
          normalized.content = errorMessage;
          normalized.display = errorMessage;
          normalized._parseError = true; // Flag to ensure tool loop processes this
        }
      }
      // Use unified tool calling loop for both native and fallback modes
      const final = await processToolCallLoop(
        normalized, 
        tools, 
        this.conversationManager,
        this.aiClient,
        this.getSystemPrompt.bind(this),
        useNativeTools,
        options.onAssistantMessage
      );
      // This is the final response after all tool calls are complete.
      // We need to update the UI with this final message.
      if (final && final.content && options.onAssistantMessage) {
        // Check if this final message is different from the last assistant message
        const lastMessage = this.conversationManager.messages[this.conversationManager.messages.length - 1];
        if (lastMessage.role !== 'assistant' || lastMessage.content !== final.content) {
          this.conversationManager.addMessage('assistant', final.content);
          options.onAssistantMessage(final);
        }
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
    console.log('[Simulacrum:Probe] Starting tool calling support detection');
    
    try {

      const tools = toolRegistry.getToolSchemas();
      if (!Array.isArray(tools) || tools.length === 0) {
        this.toolCallingSupported = false;
        return false;
      }
      const names = tools.map(t => t?.function?.name).filter(Boolean);
      const candidate = names.includes('list_documents') ? 'list_documents' : names[0];
      const prompt = `If tool calling is available, call ${candidate} with an empty object. Otherwise reply with: NO_TOOLS`;
      const res = await this.aiClient.chat([
        { role: 'system', content: 'Tool support probe.' },
        { role: 'user', content: prompt }
      ], tools);
      
      // Check for actual tool calls OR explicit "NO_TOOLS" response  
      const choice = res?.choices?.[0];
      const msg = choice?.message ?? {};
      const hasNativeTools = (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) || 
                             (msg.function_call && msg.function_call.name);
      const content = msg.content || '';
      const saidNoTools = content.includes('NO_TOOLS');
      
      // Tool calling is supported ONLY if we get actual native tool calls
      // Any other response (including attempts like "list_documents()") means no support
      this.toolCallingSupported = hasNativeTools && !saidNoTools;
      
      try { 
        if (isDiagnosticsEnabled()) {
          createLogger('AIDiagnostics').info('tool_support', { 
            supported: this.toolCallingSupported, 
            hasNativeTools, 
            saidNoTools, 
            content: content.substring(0, 100) 
          }); 
        } 
      } catch {}
      return this.toolCallingSupported;
    } catch (_e) {
      this.toolCallingSupported = false;
      return false;
    }
  }



  /**
   * Parse a tool_call from a fenced JSON block in the assistant's content.
   * This is a fallback for models that do not support native tool calling.
   * The parser is strict: it requires a ```json ... ``` block.
   */
  static _parseInlineToolCall(text) {
    if (!text || typeof text !== 'string') return null;

    // Remove <think> tags and their content before parsing - this is internal reasoning only
    let cleanText = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    if (!cleanText || !cleanText.trim()) return null;
    
    // Debug logging for think tag filtering
    try {
      if (isDiagnosticsEnabled() && text !== cleanText) {
        createLogger('AIDiagnostics').info('think_tag_filtered', { 
          originalLength: text.length,
          cleanedLength: cleanText.length,
          hadThinkTags: text.includes('<think>')
        });
      }
    } catch {}

    const tryParse = (s) => {
      try {
        return JSON.parse(s);
      } catch (e) {
        // Try to fix common AI JSON mistakes
        try {
          let fixed = s
            // Fix parentheses notation like (x,y) to [x,y]
            .replace(/\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g, '["$1","$2"]')
            // Fix single quotes to double quotes (be more careful about this)
            .replace(/:\s*'([^']*)'(?=\s*[,\}])/g, ': "$1"')
            // Fix trailing commas
            .replace(/,(\s*[}\]])/g, '$1')
            // Fix unescaped quotes within strings - this is a common issue
            .replace(/("(?:[^"\\]|\\.)*?)"((?:[^"\\]|\\.)*)"(?:[^"\\]|\\.)*?"/g, function(match) {
              // Count quotes to see if we have an odd number (unescaped)
              const quoteCount = (match.match(/"/g) || []).length;
              if (quoteCount % 2 !== 0 && quoteCount > 2) {
                // Try to fix by escaping internal quotes
                try {
                  // Try to parse as-is first
                  JSON.parse('{' + match + '}');
                  return match; // Already valid
                } catch (e) {
                  // Need to fix - escape internal quotes
                  return match.replace(/^"(.*)"$/, function(inner) {
                    // Replace internal unescaped quotes
                    return '"' + inner.slice(1, -1).replace(/([^\\])"/g, '$1\\"') + '"';
                  });
                }
              }
              return match;
            })
            // Fix D&D 5e specific damage.parts syntax issues - handle common patterns more carefully
            .replace(/"parts":\s*\[\s*(\[[^\]]*?\])\s*,\s*(\[[^\]]*?\])\s*\]/g, function(match, part1, part2) {
              try {
                // Try to parse the parts as-is first
                JSON.parse('{"parts": [' + part1 + ', ' + part2 + ']}');
                return match; // Already valid
              } catch (e) {
                // Need to fix - try to escape internal quotes in each part
                const fixPart = function(part) {
                  return part.replace(/"/g, function(quote, index) {
                    // Only escape quotes that are not at the beginning or end
                    if (index === 0 || index === part.length - 1) return quote;
                    // Check if already escaped
                    if (index > 0 && part[index - 1] === '\\') return quote;
                    return '\\"';
                  });
                };
                const fixedPart1 = fixPart(part1);
                const fixedPart2 = fixPart(part2);
                return '"parts": [' + fixedPart1 + ', ' + fixedPart2 + ']';
              }
            })
            // Fix properties array syntax
            .replace(/"properties":\s*$(.*?)$/g, function(match, content) {
              // Fix array syntax for properties
              let fixedContent = content.replace(/"([^"]+)"(?:\s*,\s*|\s*)/g, '"$1", ');
              // Remove trailing comma and spaces
              fixedContent = fixedContent.replace(/,\s*$/, '');
              return '"properties": [' + fixedContent + ']';
            });
          
          const result = JSON.parse(fixed);
          try {
            const diag = createLogger('AIDiagnostics');
            diag.info('fallback.parse.fixed', { original: s.substring(0, 100), fixed: fixed.substring(0, 100) });
          } catch {}
          return result;
        } catch (e2) {
          try {
            const diag = createLogger('AIDiagnostics');
            diag.warn('fallback.parse.error', { error: e.message, content: s.substring(0, 200) });
          } catch {}
          return { parseError: e.message, originalError: e2.message, content: s.substring(0, 200) };
        }
      }
    };

    // Multiple regex patterns to catch different JSON block formats
    const patterns = [
      /```json\s*([\s\S]+?)\s*```/i,    // Standard ```json format
      /```javascript\s*([\s\S]+?)\s*```/i, // Sometimes AIs use javascript instead of json
      /`{3,}\s*json\s*([\s\S]+?)\s*`{3,}/i, // Flexible backticks
    ];

    let blockMatch = null;
    let matchedPattern = null;
    
    for (const pattern of patterns) {
      blockMatch = cleanText.match(pattern);
      if (blockMatch && blockMatch[1]) {
        matchedPattern = pattern;
        break;
      }
    }

    if (!blockMatch || !blockMatch[1]) {
      try {
        if (isDiagnosticsEnabled()) {
          createLogger('AIDiagnostics').warn('fallback.parse.no_block', { 
            textLength: cleanText.length, 
            preview: cleanText.substring(0, 200),
            hasJsonKeyword: cleanText.includes('```json'),
            hasToolCall: cleanText.includes('tool_call')
          });
        }
      } catch {}
      return null;
    }

    const jsonContent = blockMatch[1].trim();
    
    // Validate that content looks like JSON and contains tool-like structure
    if (!jsonContent.startsWith('{') && !jsonContent.startsWith('[')) {
      try {
        if (isDiagnosticsEnabled()) {
          createLogger('AIDiagnostics').warn('fallback.parse.not_json', { 
            content: jsonContent.substring(0, 100)
          });
        }
      } catch {}
      return null;
    }
    
    // Additional check: must contain some variation of "tool" in the JSON structure
    if (!jsonContent.includes('tool_call') && !jsonContent.includes('toolCall') && 
        !jsonContent.includes('function_call') && !jsonContent.includes('functionCall') &&
        !jsonContent.includes('"name"')) {
      try {
        if (isDiagnosticsEnabled()) {
          createLogger('AIDiagnostics').warn('fallback.parse.no_tool_structure', { 
            content: jsonContent.substring(0, 100)
          });
        }
      } catch {}
      return null;
    }
    
    const obj = tryParse(jsonContent);

    // Handle case where tryParse returned a parse error
    if (obj && obj.parseError) {
      return obj; // Return the parse error object
    }
    
    if (!obj) {
      return { parseError: 'JSON parsing failed', content: jsonContent.substring(0, 200) };
    }

    // Extract tool call - be more flexible with structure
    const toolCall = obj.tool_call || obj.toolCall || obj.function_call || obj.functionCall || obj;
    const name = toolCall?.name || toolCall?.function?.name;
    let args = toolCall?.arguments || toolCall?.function?.arguments || toolCall?.args || {};

    if (!name) {
      try {
        if (isDiagnosticsEnabled()) {
          createLogger('AIDiagnostics').warn('fallback.parse.no_name', { 
            objKeys: Object.keys(obj),
            toolCallKeys: toolCall ? Object.keys(toolCall) : []
          });
        }
      } catch {}
      return null;
    }
    
    // Ensure arguments are an object
    if (typeof args === 'string') {
      const parsedArgs = tryParse(args);
      args = parsedArgs || {};
    }

    // Validate tool name against registry
    try {
      const toolInfo = toolRegistry.getToolInfo(name);
      if (!toolInfo) {
        try {
          if (isDiagnosticsEnabled()) {
            createLogger('AIDiagnostics').warn('fallback.parse.invalid_tool', { name });
          }
        } catch {}
        return null;
      }
    } catch (e) {
      return null;
    }

    const cleanedText = cleanText.replace(blockMatch[0], '').trim();
    
    try {
      if (isDiagnosticsEnabled()) {
        createLogger('AIDiagnostics').info('fallback.parse.success', { 
          name, 
          argsKeys: Object.keys(args),
          pattern: matchedPattern.toString()
        });
      }
    } catch {}

    return { name, arguments: args, cleanedText };
  }

  /**
   * Get document types information for the system prompt
   */
  static getDocumentTypesInfo() {
    try {
      const documentTypes = Object.keys(game?.documentTypes || {}).filter(type => {
        const collection = game?.collections?.get(type);
        return collection !== undefined;
      });

      if (documentTypes.length === 0) {
        return 'No document types available in current system.';
      }

      const typeDetails = documentTypes.map(type => {
        const subtypes = game.documentTypes[type] || [];
        if (subtypes.length > 0) {
          return `${type}: [${subtypes.join(', ')}]`;
        }
        return type;
      });

      return `Available document types: ${typeDetails.join(', ')}.`;
    } catch (error) {
      return 'Document type information unavailable.';
    }
  }

static getSystemPrompt() {
    const documentTypesInfo = this.getDocumentTypesInfo();
    const legacyMode = game?.settings?.get('simulacrum', 'legacyMode') || false;
    const customSystemPrompt = game?.settings?.get('simulacrum', 'customSystemPrompt') || '';
    
    let basePrompt;
    
    if (legacyMode) {
      let toolSchemas = '';
      try {
        const schemas = toolRegistry.getToolSchemas();
        if (Array.isArray(schemas) && schemas.length > 0) {
          toolSchemas = `\n\nAvailable tool schemas:\n${JSON.stringify(schemas, null, 2)}`;
        }
      } catch (_e) {}
      
      basePrompt = [
        game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.Intro'),
        documentTypesInfo,
        game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.Instructions'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.Format'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.Warning'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.Action'),
        toolSchemas
      ].join(' ');
    } else {
      basePrompt = [
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.Intro'),
        documentTypesInfo,
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.Capabilities'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.Autonomous'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.Planning'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.MultiTool'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.ToolLabels'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.Verification'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.Continuation')
      ].join(' ');
    }
    
    // Append custom system prompt if provided
    if (customSystemPrompt && customSystemPrompt.trim().length > 0) {
      const customInstructions = game.i18n.format('SIMULACRUM.SystemPrompt.CustomInstructions', {
        customPrompt: customSystemPrompt.trim()
      });
      return basePrompt + '\n\n' + customInstructions;
    }
    
    return basePrompt;
  }
}
// Export the SimulacrumCore class
export { SimulacrumCore };
