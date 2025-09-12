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
import { sanitizeMessagesForFallback, normalizeAIResponse, parseInlineToolCall } from '../utils/ai-normalization.js';
import { processToolCallLoop } from './tool-loop-handler.js';

class SimulacrumCore {
  static logger = createLogger('Core');
  static currentAbortController = null; // Track current cancellation controller
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
   * Legacy compatibility method - use ChatHandler in implementation
   */
  static async processMessage(message, user, options = {}) {
    try {
      const { ChatHandler } = await import('./chat-handler.js');
      const chatHandler = new ChatHandler(this.conversationManager);
      return await chatHandler.processUserMessage(message, user, options);
    } catch (e) {
      this.logger.error('processMessage failed', e);
      throw e;
    }
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
  }
  
  /**
   * Handle Foundry ready event
   */
  static async onReady() {
    // Initialize AI client
    await this.initializeAIClient();
    
    // Initialize conversation manager with auto-save callback
    this.conversationManager = new ConversationManager(
      game.user.id,
      game.world.id,
      32000,
      null,
      () => this.saveConversationState() // Auto-save callback
    );
    // Attempt to load any previously saved conversation state
    try {
      const loaded = await this.loadConversationState();
      if (loaded) {
        if (isDiagnosticsEnabled()) this.logger.debug('Loaded conversation history');
      } else {
        if (isDiagnosticsEnabled()) this.logger.debug('No saved conversation history found, starting fresh');
      }
    } catch (error) {
      this.logger.warn('Failed to load conversation history:', error);
      // Start with empty state on load failure
    }
    
    // Register default tools so the model can call them
    this.registerDefaultTools();

    // Set up periodic auto-save for extra reliability
    this._setupPeriodicSave();
    
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
      const contextLength = game.settings.get('simulacrum', 'contextLength');
      
      // Do not enforce API key at this layer. Some endpoints may not require it.
      
      // Create AI client (provider-agnostic)
      this.aiClient = new AIClient({
        apiKey,
        baseURL,
        model,
        contextLength
      });
      
      // Validate connection
      // await this.aiClient.validateConnection();
      
      this.logger.info('AI client initialized');
    } catch (error) {
      this.logger.error('Failed to initialize AI client', error);
    }
  }
  
  /**
   * Cancel the current agent processing
   */
  static cancelCurrentProcess() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
      this.logger.info('Agent process cancelled by user');
      try {
        Hooks.call('simulacrum:processCancelled');
      } catch (_e) { /* ignore */ }
    }
  }

  /**
   * Generate AI response from messages (pure AI functionality)
   * @param {Array} messages - Conversation messages
   * @param {Object} options - Options including signal for cancellation
   * @returns {Object} Normalized AI response
   */
  static async generateResponse(messages, options = {}) {
    // Cancel any existing process
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    
    // Create new abort controller for this process
    this.currentAbortController = new AbortController();
    const signal = options.signal || this.currentAbortController.signal;
    
    try {
      // Check if AI client is initialized
      if (!this.aiClient) {
        await this.initializeAIClient();
        if (!this.aiClient) {
          throw new Error('AI client not initialized');
        }
      }
      
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
      
      // Get context length setting and limit conversation history
      const contextLength = game?.settings?.get('simulacrum', 'contextLength') || 20;
      const limitedMessages = messages.length > contextLength 
        ? messages.slice(-contextLength)
        : messages;
      
      // Get AI response - use legacy mode setting to determine tool support
      const legacyMode = game.settings.get('simulacrum', 'legacyMode');
      const useNativeTools = !legacyMode;
      const sendTools = useNativeTools ? tools : null;
      
      if (isDiagnosticsEnabled()) this.logger.debug('Chat request configuration:', {
        legacyMode,
        useNativeTools,
        sendingTools: !!sendTools,
        toolCount: tools?.length || 0
      });
      
      // Debug logging
      try {
        if (isDiagnosticsEnabled()) {
          createLogger('AIDiagnostics').info('chat_request', { 
            legacyMode, 
            useNativeTools,
            sendingTools: !!sendTools
          });
        }
      } catch {}
      
      // Check for cancellation before making request
      if (signal.aborted) {
        throw new Error('Process was cancelled');
      }
      
      const raw = useNativeTools 
        ? await this.aiClient.chatWithSystem(limitedMessages, this.getSystemPrompt.bind(this), sendTools, { signal })
        : await this.aiClient.chat(sanitizeMessagesForFallback([{ role: 'system', content: this.getSystemPrompt() }, ...limitedMessages]), sendTools, { signal });
      if (raw == null) {
        throw new Error('Empty AI response');
      }
      
      // Normalize and return response
      return this._normalizeAIResponse(raw);
      
    } finally {
      // Clean up abort controller
      if (this.currentAbortController) {
        this.currentAbortController = null;
      }
    }
  }

  /**
   * Normalize AI response into consistent format
   * @private
   */
  static _normalizeAIResponse(raw) { return normalizeAIResponse(raw); }

  
  
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
  /**
   * Set up periodic auto-save for extra reliability
   * @private
   */
  static _setupPeriodicSave() {
    // Clear any existing interval
    if (this._saveInterval) {
      clearInterval(this._saveInterval);
    }
    
    // Auto-save every 30 seconds if conversation has changed
    this._saveInterval = setInterval(async () => {
      if (this.conversationManager && this.conversationManager.messages.length > 0) {
        try {
          await this.saveConversationState();
        } catch (error) {
          this.logger.warn('Periodic save failed:', error);
        }
      }
    }, 30000); // 30 seconds
    
    // Also save before page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        try {
          // Use synchronous save if possible for beforeunload
          this.saveConversationState();
        } catch (error) {
          this.logger.warn('beforeunload save failed:', error);
        }
      });
    }
  }

  static async saveConversationState() {
    if (!this.conversationManager) {
      this.logger.warn('Cannot save: conversationManager not initialized');
      return false;
    }
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
        if (isDiagnosticsEnabled()) this.logger.debug('Conversation state saved to user flags');
        return true;
      }
    } catch (error) {
      this.logger.warn('Failed to save to user flags:', error);
      // fall back below
    }
    // Fallback to module settings when set() exists
    try {
      if (game?.settings && typeof game.settings.set === 'function') {
        await game.settings.set('simulacrum', key, state);
        if (isDiagnosticsEnabled()) this.logger.debug('Conversation state saved to module settings');
        return true;
      }
    } catch (error) {
      this.logger.warn('Failed to save to module settings:', error);
    }
    this.logger.warn('Failed to save conversation state - no storage method available');
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



  /**
   * Parse a tool_call from a fenced JSON block in the assistant's content.
   * This is a fallback for models that do not support native tool calling.
   * The parser is strict: it requires a ```json ... ``` block.
   */
  static _parseInlineToolCall(text) {
    // Delegate to shared utility
    return parseInlineToolCall(text);
  }
    if (!text || typeof text !== 'string') return null;

    // Remove <think> tags and their content before parsing - this is internal reasoning only
    const cleanText = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
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
          const fixed = s
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
        // Assertion: schemas must be present and well-formed in legacy mode
        const hasSchemas = Array.isArray(schemas) && schemas.length > 0;
        const allWellFormed = hasSchemas && schemas.every(s => s && s.type === 'function' && s.function && s.function.name && s.function.parameters && s.function.parameters.type === 'object');
        if (!hasSchemas || !allWellFormed) {
          // Log a clear warning for maintainers and guide the model conservatively
          this.logger.warn('Legacy mode active but tool schemas are missing or malformed; tool calls may fail.');
          toolSchemas = '\n\nWARNING: Tool schemas are unavailable. Do NOT attempt tool calls.';
        } else {
          toolSchemas = `\n\nAvailable tool schemas:\n${JSON.stringify(schemas, null, 2)}`;
        }
      } catch (e) {
        this.logger.error('Failed to retrieve tool schemas for legacy mode', e);
      }
      
      basePrompt = [
        game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.Intro'),
        documentTypesInfo,
        game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.Instructions'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.Format'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.Warning'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.Action'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.DocumentSchema'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.EndTask'),
        toolSchemas
      ].join(' ');
    } else {
      basePrompt = [
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.Intro'),
        documentTypesInfo,
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.Capabilities'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.Autonomous'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.DocumentSchema'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.Planning'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.MultiTool'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.ToolLabels'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.Verification'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.Continuation'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.EndTask')
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
