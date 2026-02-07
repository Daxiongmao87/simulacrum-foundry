/* eslint-disable complexity, max-lines-per-function, no-unused-vars, no-empty */
/**
 * Simulacrum Core - Main module logic
 */
import { createLogger, isDebugEnabled } from '../utils/logger.js';
import { AIClient } from './ai-client.js';
import { ConversationManager } from './conversation.js';
import { toolRegistry } from './tool-registry.js';
import { documentReadRegistry } from '../utils/document-read-registry.js';
import { toolPermissionManager } from './tool-permission-manager.js';

import { DocumentAPI } from './document-api.js';
import {
  normalizeAIResponse,
  parseInlineToolCall,
  sanitizeMessagesForFallback,
} from '../utils/ai-normalization.js';
import { smartSliceMessages, formatToolCallDisplay } from '../utils/message-utils.js';
import { processToolCallLoop } from './tool-loop-handler.js';
import { emitProcessCancelled } from './hook-manager.js';
import {
  buildSystemPrompt,
  getDocumentTypesInfo as getDocTypesInfo,
  getAvailableMacrosList as getMacros,
} from './system-prompt-builder.js';

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
    const tokenLimit = game.settings.get('simulacrum', 'fallbackContextLimit') || 32000;
    this.conversationManager = new ConversationManager(
      game.user.id,
      game.world.id,
      tokenLimit,
      null,
      () => this.saveConversationState() // Auto-save callback
    );
    // Attempt to load any previously saved conversation state
    try {
      const loaded = await this.loadConversationState();
      if (loaded && this.conversationManager.messages.length > 0) {
        if (isDebugEnabled()) this.logger.debug('Loaded conversation history');
      } else {
        if (isDebugEnabled())
          this.logger.debug('No saved conversation history found, starting fresh');
        // Task-06: Add welcome message to ConversationManager so it persists across reloads
        const welcomeContent =
          game.i18n?.localize('SIMULACRUM.WelcomeMessage') ||
          "Hello! I'm your AI assistant for campaign document management. How can I help you today?";
        this.conversationManager.addMessage('assistant', welcomeContent);
        if (isDebugEnabled()) this.logger.debug('Added welcome message to conversation history');
      }
    } catch (error) {
      this.logger.warn('Failed to load conversation history:', error);
      // Start with welcome message on load failure
      const welcomeContent =
        game.i18n?.localize('SIMULACRUM.WelcomeMessage') ||
        "Hello! I'm your AI assistant for campaign document management. How can I help you today?";
      this.conversationManager.addMessage('assistant', welcomeContent);
    }

    // Register default tools so the model can call them
    this.registerDefaultTools();

    // Set up periodic auto-save for extra reliability
    this._setupPeriodicSave();

    // Signal that conversation is fully loaded
    Hooks.callAll('simulacrumConversationLoaded', this.conversationManager);

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

      // Create AI client (OpenAI-compatible)
      this.aiClient = new AIClient({
        apiKey,
        baseURL,
        model,
      });
      this.logger.info('AI Client Initialized');

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
      emitProcessCancelled();
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
      let tools = options.tools !== undefined ? options.tools : toolRegistry.getToolSchemas();
      // Diagnostics: log tool schemas sent (names only)
      try {
        if (isDebugEnabled()) {
          const diag = createLogger('AIDiagnostics');
          const toolNames = Array.isArray(tools)
            ? tools.map(t => t?.function?.name || t?.name).filter(Boolean)
            : [];
          diag.info('tools', {
            count: toolNames.length,
            names: toolNames,
            fromOptions: options.tools !== undefined,
          });
        }
      } catch { }

      // Filter blacklisted tools - Ensure AI doesn't see tools explicitly denied
      if (Array.isArray(tools)) {
        const originalCount = tools.length;
        tools = tools.filter(t => {
          const name = t.function?.name || t.name;
          return !toolPermissionManager.isBlacklisted(name);
        });

        if (isDebugEnabled() && tools.length < originalCount) {
          this.logger.debug(`Filtered ${originalCount - tools.length} blacklisted tools from context`);
        }
      }

      // Get context length setting and limit conversation history
      // const contextLength = game?.settings?.get('simulacrum', 'contextLength') || 20;

      // Trigger compaction if approaching token limit (Context Compaction feature)
      if (this.conversationManager && this.aiClient) {
        try {
          const compacted = await this.conversationManager.compactHistory(this.aiClient);
          if (compacted) {
            if (isDebugEnabled()) {
              this.logger.debug('Conversation history compacted via rollingSummary');
            }
            // UX: Show compaction as a simulated tool call
            if (options.onAssistantMessage) {
              const displayHtml = formatToolCallDisplay(
                {
                  toolName: 'optimize_memory',
                  content: JSON.stringify({
                    display: 'Compacted conversation history into working memory summary.',
                  }),
                  isError: false,
                },
                'optimize_memory'
              );
              options.onAssistantMessage({
                role: 'assistant',
                content: 'System Event: Conversation history compacted to rolling summary.', // Persist to history
                display: displayHtml,
              });
            }
          }
        } catch (compactionError) {
          // Non-fatal: log and continue with uncompacted history
          this.logger.warn('Compaction failed, continuing with full history:', compactionError);
        }
      }

      // Legacy capping removed in favor of Tiered Context Compaction
      // const limitedMessages = smartSliceMessages(messages, contextLength);
      const limitedMessages = messages;

      // Get AI response - use legacy mode setting to determine tool support
      const legacyMode = game.settings.get('simulacrum', 'legacyMode');
      const useNativeTools = !legacyMode;
      const sendTools = useNativeTools && tools ? tools : null;

      if (isDebugEnabled())
        this.logger.debug('Chat request configuration:', {
          legacyMode,
          useNativeTools,
          sendingTools: !!sendTools,
          toolCount: tools?.length || 0,
        });

      // Debug logging
      try {
        if (isDebugEnabled()) {
          createLogger('AIDiagnostics').info('chat_request', {
            legacyMode,
            useNativeTools,
            sendingTools: !!sendTools,
          });
        }
      } catch { }

      // Check for cancellation before making request
      if (signal.aborted) {
        throw new Error('Process was cancelled');
      }

      // Get system prompt (use provided or default)
      const systemPrompt = options.systemPrompt || (await this.getSystemPrompt());
      const getSystemPromptFn = () => systemPrompt;

      const raw = useNativeTools
        ? await this.aiClient.chatWithSystem(limitedMessages, getSystemPromptFn, sendTools, {
          signal,
        })
        : await this.aiClient.chat(
          sanitizeMessagesForFallback([
            { role: 'system', content: systemPrompt },
            ...limitedMessages,
          ]),
          sendTools,
          { signal }
        );
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
  static _normalizeAIResponse(raw) {
    return normalizeAIResponse(raw);
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
        await this.conversationManager.save();
      }
      // Clear the document read registry since conversation context is reset
      documentReadRegistry.clear();
      // Clear interaction log when conversation is cleared
      const { interactionLogger } = await import('./interaction-logger.js');
      await interactionLogger.clear();
      return true;
    } catch (_e) {
      return false;
    }
  }

  /**
   * Get persistence key - delegates to ConversationManager
   * @deprecated Use conversationManager.getPersistenceKey() directly
   */
  static getPersistenceKey() {
    return (
      this.conversationManager?.getPersistenceKey() ||
      `conversationState:${game?.user?.id || 'unknown'}:${game?.world?.id || 'unknown'}`
    );
  }

  /**
   * Load conversation state - delegates to ConversationManager
   */
  static async loadConversationState() {
    if (!this.conversationManager) return false;
    return this.conversationManager.load();
  }

  /**
   * Set up periodic auto-save - delegates to ConversationManager
   * @private
   */
  static _setupPeriodicSave() {
    if (this.conversationManager) {
      this.conversationManager.setupPeriodicSave(30000);
    }
  }

  /**
   * Save conversation state - delegates to ConversationManager
   */
  static async saveConversationState() {
    if (!this.conversationManager) {
      this.logger.warn('Cannot save: conversationManager not initialized');
      return false;
    }
    return this.conversationManager.save();
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
      changes,
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
    toolRegistry.registerDefaults();
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
    return getDocTypesInfo();
  }

  /**
   * Get formatted list of available macros (World + Module)
   * @returns {Promise<string>} Formatted list of macros
   */
  static async getAvailableMacrosList() {
    return getMacros();
  }

  static async getSystemPrompt() {
    return buildSystemPrompt();
  }
}
// Export the SimulacrumCore class
export { SimulacrumCore };
