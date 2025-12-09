/**
 * Simulacrum Core - Main module logic
 */
import { createLogger, isDebugEnabled } from '../utils/logger.js';
import { AIClient } from './ai-client.js';
import { ConversationManager } from './conversation.js';
import { toolRegistry } from './tool-registry.js';
import { DocumentCreateTool } from '../tools/document-create.js';
import { DocumentReadTool } from '../tools/document-read.js';
import { DocumentUpdateTool } from '../tools/document-update.js';
import { DocumentDeleteTool } from '../tools/document-delete.js';
import { DocumentListTool } from '../tools/document-list.js';
import { DocumentSearchTool } from '../tools/document-search.js';
import { ArtifactSearchTool } from '../tools/artifact-search.js';
import { DocumentSchemaTool } from '../tools/document-schema.js';
import { ExecuteMacroTool } from '../tools/execute-macro.js';
import { DocumentAPI } from './document-api.js';
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
      if (loaded && this.conversationManager.messages.length > 0) {
        if (isDebugEnabled()) this.logger.debug('Loaded conversation history');
      } else {
        if (isDebugEnabled()) this.logger.debug('No saved conversation history found, starting fresh');
        // Task-06: Add welcome message to ConversationManager so it persists across reloads
        const welcomeContent = game.i18n?.localize('SIMULACRUM.WelcomeMessage') ||
          'Hello! I\'m your AI assistant for campaign document management. How can I help you today?';
        this.conversationManager.addMessage('assistant', welcomeContent);
        if (isDebugEnabled()) this.logger.debug('Added welcome message to conversation history');
      }
    } catch (error) {
      this.logger.warn('Failed to load conversation history:', error);
      // Start with welcome message on load failure
      const welcomeContent = game.i18n?.localize('SIMULACRUM.WelcomeMessage') ||
        'Hello! I\'m your AI assistant for campaign document management. How can I help you today?';
      this.conversationManager.addMessage('assistant', welcomeContent);
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
      const temperature = game.settings.get('simulacrum', 'temperature');
      const provider = game.settings.get('simulacrum', 'provider') || 'openai';

      // Do not enforce API key at this layer. Some endpoints may not require it.

      // Create AI client (provider-agnostic)
      this.aiClient = new AIClient({
        apiKey,
        baseURL,
        model,
        contextLength,
        provider,
        temperature
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

      // Get available tools (use provided tools or default from registry)
      const tools = options.tools !== undefined ? options.tools : toolRegistry.getToolSchemas();
      // Diagnostics: log tool schemas sent (names only)
      try {
        if (isDebugEnabled()) {
          const diag = createLogger('AIDiagnostics');
          const toolNames = Array.isArray(tools) ? tools.map(t => t?.function?.name || t?.name).filter(Boolean) : [];
          diag.info('tools', { count: toolNames.length, names: toolNames, fromOptions: options.tools !== undefined });
        }
      } catch { }

      // Get context length setting and limit conversation history
      const contextLength = game?.settings?.get('simulacrum', 'contextLength') || 20;
      const limitedMessages = messages.length > contextLength
        ? messages.slice(-contextLength)
        : messages;

      // Get AI response - use legacy mode setting to determine tool support
      const legacyMode = game.settings.get('simulacrum', 'legacyMode');
      const useNativeTools = !legacyMode;
      const sendTools = useNativeTools && tools ? tools : null;

      if (isDebugEnabled()) this.logger.debug('Chat request configuration:', {
        legacyMode,
        useNativeTools,
        sendingTools: !!sendTools,
        toolCount: tools?.length || 0
      });

      // Debug logging
      try {
        if (isDebugEnabled()) {
          createLogger('AIDiagnostics').info('chat_request', {
            legacyMode,
            useNativeTools,
            sendingTools: !!sendTools
          });
        }
      } catch { }

      // Check for cancellation before making request
      if (signal.aborted) {
        throw new Error('Process was cancelled');
      }

      // Get system prompt (use provided or default)
      const systemPrompt = options.systemPrompt || await this.getSystemPrompt();
      const getSystemPromptFn = () => systemPrompt;

      const raw = useNativeTools
        ? await this.aiClient.chatWithSystem(limitedMessages, getSystemPromptFn, sendTools, { signal })
        : await this.aiClient.chat(sanitizeMessagesForFallback([{ role: 'system', content: systemPrompt }, ...limitedMessages]), sendTools, { signal });
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
        if (isDebugEnabled()) this.logger.debug('Conversation state saved to user flags');
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
        if (isDebugEnabled()) this.logger.debug('Conversation state saved to module settings');
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
        new ArtifactSearchTool(),
        new DocumentSchemaTool(),
        new ExecuteMacroTool()
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

  /**
   * Get formatted list of available macros (World + Module)
   * @returns {string} Formatted list of macros
   */
  static async getAvailableMacrosList() {
    const macros = [];

    // 1. World Macros
    game.macros.forEach(m => {
      macros.push(`- "${m.name}" (UUID: ${m.uuid})`);
    });

    // 2. Simulacrum Module Macros
    const pack = game.packs.get('simulacrum.simulacrum-macros');
    if (pack) {
      const index = await pack.getIndex();
      index.forEach(i => {
        macros.push(`- "${i.name}" (UUID: ${i.uuid})`);
      });
    }

    if (macros.length === 0) return 'No macros available.';
    return macros.join('\n');
  }

  static async getSystemPrompt() {
    const documentTypesInfo = this.getDocumentTypesInfo();
    const legacyMode = game?.settings?.get('simulacrum', 'legacyMode') || false;
    const customSystemPrompt = game?.settings?.get('simulacrum', 'customSystemPrompt') || '';

    // Fetch available macros (World + Module) for execution context
    const macrosList = await this.getAvailableMacrosList();

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
        game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.Intro_v2'),
        documentTypesInfo,
        game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.Instructions'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.Format'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.Warning'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.Action'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.DocumentSchema'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.EndTask'),
        toolSchemas
      ].join('\n\n');
    } else {
      basePrompt = [
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.Identity'),
        documentTypesInfo,
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.StrategicProtocol'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.ToolOperatives'),
        `## Available Macros\nThe following macros are available for execution via the execute_macro tool:\n${macrosList}`,
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.CommunicationStyle_v2'),
        game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.LoopTermination')
      ].join('\n\n');
    }

    // Append custom system prompt if provided
    if (customSystemPrompt && customSystemPrompt.trim().length > 0) {
      const customInstructions = game.i18n.format('SIMULACRUM.SystemPrompt.CustomInstructions', {
        customPrompt: customSystemPrompt.trim()
      });
      basePrompt = basePrompt + '\n\n' + customInstructions;
    }

    // DEBUG: VERSION AND SECURITY CHECK (User Request)
    const version = '0.1.8';
    // Strict check: verify no HTML tags exist in the prompt
    // This regex matches <tag> or </tag> where tag is 1+ letters
    const tagRegex = /<\/?[a-z][a-z0-9]*\b[^>]*>/gi;
    const foundTags = basePrompt.match(tagRegex) || [];
    const isClean = foundTags.length === 0;

    console.log(`%c[Simulacrum] System Prompt Verification (v${version})`, 'color: #00ff00; font-weight: bold; font-size: 12px;');
    console.log(`[Simulacrum] Content Length: ${basePrompt.length}`);
    if (isClean) {
      console.log('%c[Simulacrum] Security Check: PASS (No forbidden HTML tags found)', 'color: green');
    } else {
      console.error(`[Simulacrum] Security Check: FAIL (Found tags: ${foundTags.slice(0, 10).join(', ')}${foundTags.length > 10 ? '...' : ''})`);
      console.warn('[Simulacrum] The presence of ANY HTML tags may trigger the API WAF.');
    }
    console.log('[Simulacrum] Prompt Preview:', basePrompt.substring(0, 200) + '...');

    return basePrompt;
  }
}
// Export the SimulacrumCore class
export { SimulacrumCore };
