/**
 * Simulacrum Sidebar Tab - ApplicationV2-based sidebar tab for AI interaction
 * Replaces the panel interface with a proper FoundryVTT v13 sidebar integration
 */

import { createLogger, isDebugEnabled } from '../utils/logger.js';
import { ConversationCommands } from './conversation-commands.js';
import { transformThinkTags, hasThinkTags } from '../utils/content-processor.js';
import { ChatHandler } from '../core/chat-handler.js';
import { MarkdownRenderer } from '../lib/markdown-renderer.js';

// Simple, direct base class resolution for FoundryVTT v13
const AbstractSidebarTab = globalThis.foundry?.applications?.sidebar?.AbstractSidebarTab ?? globalThis.AbstractSidebarTab;
const HandlebarsApplicationMixin = globalThis.foundry?.applications?.api?.HandlebarsApplicationMixin ?? globalThis.HandlebarsApplicationMixin;

class SimulacrumSidebarTab extends HandlebarsApplicationMixin(AbstractSidebarTab) {
  /**
   * Static configuration for the sidebar tab
   */
  static tabName = 'simulacrum';

  /**
   * Define the parts of the application
   */
  static get PARTS() {
    return {
      log: {
        template: 'modules/simulacrum/templates/simulacrum/sidebar-log.hbs',
        templates: ['modules/simulacrum/templates/simulacrum/message.hbs'],
        scrollable: ['']
      },
      input: {
        template: 'modules/simulacrum/templates/simulacrum/sidebar-input.hbs'
      }
    };
  }

  /**
   * Default application options (v13: use static DEFAULT_OPTIONS)
   */
  static DEFAULT_OPTIONS = (() => {
    const base = (foundry?.utils?.mergeObject)
      ? foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {})
      : (super.DEFAULT_OPTIONS ? { ...super.DEFAULT_OPTIONS } : {});
    return foundry.utils.mergeObject(base, {
      id: 'simulacrum',
      tag: 'section',
      // Ensure our section inherits Chat tab layout rules
      // Foundry's AbstractSidebarTab already adds ["tab", "sidebar-tab"]
      classes: ["flexcol", "chat-sidebar"],
      window: { frame: false, positioned: false, resizable: false },
      actions: { 
        sendMessage: this._onSendMessage, 
        clearChat: this._onClearChat,
        jumpToBottom: this._onJumpToBottom,
        cancelProcess: this._onCancelProcess
      }
    });
  })();

  /**
   * Legacy-compatible render bridge used by Sidebar.#renderTabs which may prefer _render(force) for some tabs.
   * Ensures a Promise is returned and the boolean force flag is handled.
   * @param {boolean|object} optionsOrForce
   * @returns {Promise<this>}
   */
  _render(optionsOrForce) {
    const options = (typeof optionsOrForce === 'boolean') ? { force: optionsOrForce } : (optionsOrForce || {});
    // Always return a Promise so callers may safely chain .catch
    return Promise.resolve(super.render(options));
  }

  /**
   * Ensure direct calls to render(...) also return a Promise in older contexts.
   * @param {object} [options]
   * @returns {Promise<this>}
   */
  render(...args) {
    // Support legacy signature render(force:boolean, options:object)
    let options = {};
    if (typeof args[0] === 'boolean') {
      options = { force: args[0], ...(args[1] || {}) };
    } else if (typeof args[0] === 'object' && args[0] !== null) {
      options = args[0];
    }
    return Promise.resolve(super.render(options));
  }

  /**
   * Track if chat is scrolled to bottom
   * @type {boolean}
   * @private
   */
  #isAtBottom = true;

  /**
   * Track if a scroll is needed after render
   * @type {boolean}
   * @private
   */
  #needsScroll = false;

  /**
   * Initialize the sidebar tab
   */
  constructor() {
    super();
    
    this.messages = [];
    this.logger = createLogger('SimulacrumSidebarTab');
    this._syncedFromCore = false;
    this.chatHandler = null; // Will be initialized when SimulacrumCore is ready

    // Seed a welcome message until conversation history loads
    try {
      const welcome = {
        id: foundry.utils.randomID(),
        role: 'assistant',
        content: game.i18n?.localize('SIMULACRUM.WelcomeMessage') ?? 'Welcome to Simulacrum!',
        display: null,
        timestamp: Date.now(),
        timestampLabel: game.i18n?.localize('SIMULACRUM.Welcome') ?? 'Welcome',
        user: null
      };
      this.messages.push(welcome);
    } catch (_e) { /* ignore */ }

    // Set up hook to load conversation history AFTER SimulacrumCore is ready
    try {
      Hooks.once('ready', () => {
        // Delay slightly to ensure SimulacrumCore.onReady() has completed
        setTimeout(() => {
          this._loadConversationHistoryOnInit();
        }, 100);
      });
    } catch (_err) {
      // Hooks may be unavailable in certain test contexts
    }

    // Active process labels reported by core while tools execute
    this._activeProcesses = new Map(); // callId -> { label, toolName }
    try {
      Hooks.on('simulacrum:processStatus', (info) => {
        if (isDebugEnabled()) this.logger.debug('Process status hook', info);
        const { state, callId, label, toolName } = info || {};
        if (!callId) return;
        if (state === 'start') {
          const capped = String(label || '').slice(0, 120);
          this._activeProcesses.set(callId, { label: capped, toolName: String(toolName || '') });
          if (isDebugEnabled()) this.logger.debug('Process started, active processes:', this._activeProcesses.size);
        } else if (state === 'end') {
          this._activeProcesses.delete(callId);
          if (isDebugEnabled()) this.logger.debug('Process ended, active processes:', this._activeProcesses.size);
        }
        this.#needsScroll = true;
        this.render({ parts: ['log', 'input'] });
      });
    } catch (_err) {
      // Hooks may be unavailable in certain test contexts
      this.logger.error('Hook registration failed:', _err);
    }

  }

  /**
   * Apply post-render behaviors to keep the chat viewport aligned.
   * @param {ApplicationRenderContext} context
   * @param {ApplicationRenderOptions} [options]
   */
  async _postRender(context, options) {
    const parent = Object.getPrototypeOf(SimulacrumSidebarTab.prototype);
    const parentPostRender = parent?._postRender;
    if (typeof parentPostRender === 'function') {
      await parentPostRender.call(this, context, options);
    }
    if (!this.#needsScroll) return;

    const waitImages = Boolean(options?.isFirstRender);
    try {
      const scrolled = await this.scrollBottom({ waitImages });
      if (scrolled) {
        this.#needsScroll = false;
      }
    } catch (err) {
      if (this.logger?.warn) {
        this.logger.warn('Failed to maintain chat scroll position', err);
      }
    }
  }

  /**
   * Load conversation history when SimulacrumCore is ready
   */
  async _loadConversationHistoryOnInit() {
    try {
      // Initialize ChatHandler
      const { SimulacrumCore } = await import('../core/simulacrum-core.js');
      if (SimulacrumCore?.conversationManager) {
        this.chatHandler = new ChatHandler(SimulacrumCore.conversationManager);
      }
      
      await this._syncFromCoreConversation();
      this._syncedFromCore = true;
      // If history was loaded, replace welcome message and re-render
      if (this.messages.length > 1 ||
          (this.messages.length === 1 && !this.messages[0].content?.includes('Welcome'))) {
        this.#needsScroll = true;
        await this.render({ parts: ['log'] });
      }
    } catch (_e) {
      // If sync fails, keep welcome message (already added in constructor)
    }
  }

  /**
   * Prepare data for rendering
   * @returns {Object} Template data
   */
  async _prepareContext() {
    const context = await super._prepareContext();
    // Conversation history is loaded via 'ready' hook
    
    // Create welcome message if no messages exist
    const welcomeMessage = this.messages.length === 0 ? {
      messageId: 'welcome',
      role: 'assistant',
      content: game.i18n.localize('SIMULACRUM.WelcomeMessage'),
      timestamp: new Date(),
      user: game.user
    } : null;
    
    const processActive = this._activeProcesses.size > 0;
    const processLabel = Array.from(this._activeProcesses.values()).slice(-1)[0]?.label || null;
    
    if (isDebugEnabled()) this.logger.debug('_prepareContext processActive:', processActive, 'active:', this._activeProcesses.size);
    
    return foundry.utils.mergeObject(context, {
      messages: this.messages,
      welcomeMessage: welcomeMessage,
      isGM: game.user.isGM,
      user: game.user,
      isAtBottom: this.#isAtBottom,
      processActive: processActive,
      processLabel: processLabel
    });
  }

  /**
   * Sync UI messages from conversation manager (user/assistant only)
   */
  async _syncFromCoreConversation() {
    try {
      // Use ChatHandler if available, otherwise fallback to SimulacrumCore
      let cm;
      if (this.chatHandler) {
        cm = this.chatHandler.conversationManager;
      } else {
        const { SimulacrumCore } = await import('../core/simulacrum-core.js');
        cm = SimulacrumCore?.conversationManager;
      }
      
      if (cm && Array.isArray(cm.messages)) {
        const filtered = cm.messages.filter(m => m && (m.role === 'user' || m.role === 'assistant'));
        const projected = [];

        // Process each historical message through the same pipeline as new messages
        for (const m of filtered) {
          const content = String(m.content ?? '');

          // Transform <think></think> tags to collapsible spoilers
          let processedContent = content;
          if (hasThinkTags(processedContent)) {
            processedContent = transformThinkTags(processedContent);
          }

          // Apply markdown rendering
          let markdownNormalized = processedContent;
          try {
            markdownNormalized = await MarkdownRenderer.render(processedContent);
          } catch (err) {
            if (this.logger?.warn) {
              this.logger.warn('Markdown rendering failed for historical message; using original content', err);
            }
          }

          // Apply FoundryVTT HTML enrichment
          const TextEditorImpl = foundry?.applications?.ux?.TextEditor?.implementation ?? TextEditor;
          const enrichedContent = await TextEditorImpl.enrichHTML(markdownNormalized, {
            secrets: game.user.isGM,
            documents: true,
            async: true
          });

          projected.push({
            id: foundry.utils.randomID(),
            role: m.role,
            content: content,
            display: enrichedContent,
            timestamp: Date.now(),
            user: m.role === 'user' ? game.user : null
          });
        }

        this.messages = projected;
      }
    } catch (_e) { /* ignore */ }
  }

  /**
   * Handle message sending action
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  static async _onSendMessage(event, target) {
    const form = target.closest('form');
    const input = form.querySelector('textarea[name="message"]');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Check if input is disabled (means agent is processing)
    if (input.disabled) {
      return; // Don't submit while agent is working
    }

    // Clear input immediately
    input.value = '';

    try {
      // Ensure ChatHandler is initialized
      if (!this.chatHandler) {
        const { SimulacrumCore } = await import('../core/simulacrum-core.js');
        const { ChatHandler } = await import('../core/chat-handler.js');
        if (SimulacrumCore?.conversationManager) {
          this.chatHandler = new ChatHandler(SimulacrumCore.conversationManager);
        }
      }
      
      if (!this.chatHandler) {
        throw new Error('ChatHandler not available');
      }
      
      // Handle conversation commands
      if (this.chatHandler.conversationManager) {
        const commandResult = await ConversationCommands.handleConversationCommand(
          message, 
          this.chatHandler.conversationManager
        );
        
        if (commandResult.isCommand) {
          await this.addMessage('assistant', commandResult.message, commandResult.message);
          return;
        }
      }

      // Add user message to chat log
      await this.addMessage('user', message);

      // Define callbacks for ChatHandler
      const onUserMessage = ({ content }) => {
        // User message already added above
      };
      
      const onAssistantMessage = async (response) => {
        if (response.content) {
          await this.addMessage('assistant', response.content, response.display);
        }
      };

      // Process message through ChatHandler
      await this.chatHandler.processUserMessage(message, game.user, { 
        onUserMessage, 
        onAssistantMessage 
      });

    } catch (error) {
      this.logger.error('Error processing message', error);
      await this.addMessage('assistant', `Error: ${error.message}`, `❌ ${error.message}`);
    }
  }

  /**
   * Handle clear chat action
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  static async _onClearChat() {
    try {
      if (this.chatHandler) {
        await this.chatHandler.clearConversation();
      } else {
        // Fallback to SimulacrumCore for compatibility
        const { SimulacrumCore } = await import('../core/simulacrum-core.js');
        await SimulacrumCore.clearConversation?.();
      }
    } catch (_e) { /* ignore */ }
    this.clearMessages();
    await this.addMessage('assistant', game.i18n.localize('SIMULACRUM.WelcomeMessage'));
  }

  /**
   * Handle jump to bottom action
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  static async _onJumpToBottom(event, target) {
    this.scrollBottom();
  }

  /**
   * Handle cancel process action
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  static async _onCancelProcess(event, target) {
    try {
      // Cancel through SimulacrumCore (it handles the actual abort controller)
      const { SimulacrumCore } = await import('../core/simulacrum-core.js');
      SimulacrumCore.cancelCurrentProcess();
      // Note: this refers to the instance when called with .call(this, ...)
      if (this && typeof this.addMessage === 'function') {
        await this.addMessage('assistant', 'Process cancelled by user', '🛑 Process cancelled');
      }
    } catch (error) {
      if (this && this.logger) {
        this.logger.error('Error cancelling process', error);
      }
    }
  }

  /**
   * Handle scroll events on the chat log
   * @param {Event} event - The scroll event
   * @private
   */
  #onScrollLog(event) {
    const log = event.currentTarget;
    const pct = log.scrollTop / (log.scrollHeight - log.clientHeight);
    this.#isAtBottom = (pct > 0.99) || Number.isNaN(pct);
    
    // Update jump-to-bottom button visibility
    const jumpButton = this.element?.querySelector('.jump-to-bottom');
    if (jumpButton) {
      jumpButton.style.display = this.#isAtBottom ? 'none' : 'block';
    }
  }

  /**
   * Scroll chat log to bottom with options
   * @param {Object} options - Scroll options
   * @param {boolean} options.waitImages - Wait for images to load
   * @param {HTMLElement} [options.container] - Specific scroll container to target
   * @returns {Promise<boolean>} True when scroll applied
   */
  async scrollBottom({ waitImages = false, container = null } = {}) {
    let scroll = container;
    if (!scroll) {
      scroll = this.element?.querySelector('.chat-scroll');
    }
    if (!(scroll instanceof HTMLElement)) {
      return false;
    }

    // Wait for content to be rendered before scrolling
    // Use requestAnimationFrame to wait for the next paint cycle
    if (scroll.scrollHeight === 0) {
      // Wait for the next frame or up to a reasonable timeout
      await new Promise(resolve => {
        let attempts = 0;
        const maxAttempts = 50; // 50 * 100ms = 5 seconds max wait
        
        const checkRender = () => {
          attempts++;
          
          // If content has been rendered or we've waited long enough, proceed
          if (scroll.scrollHeight > 0 || attempts >= maxAttempts) {
            resolve();
          } else {
            // Use requestAnimationFrame for better timing with browser rendering
            requestAnimationFrame(() => {
              if (scroll.scrollHeight > 0) {
                resolve();
              } else {
                // Fallback to setTimeout if still not rendered
                setTimeout(checkRender, 50);
              }
            });
          }
        };
        
        // Start checking
        checkRender();
      });
    }

    if (waitImages) {
      // Wait for any images to load before scrolling
      const images = scroll.querySelectorAll('img');
      await Promise.all(Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        });
      }));
    }

    scroll.scrollTop = scroll.scrollHeight;
    this.#isAtBottom = true;

    // Hide jump-to-bottom button
    const jumpButton = this.element?.querySelector('.jump-to-bottom');
    if (jumpButton) {
      jumpButton.style.display = 'none';
    }

    return true;
  }

  /**
   * Add a message to the chat log
   * @param {string} role - Message role ('user' or 'assistant')
   * @param {string} content - Message content
   * @param {string} display - Optional display content for rich formatting
   */
  async addMessage(role, content, display = null) {
    // Transform <think></think> tags to collapsible spoilers before enriching HTML
    let processedContent = display || content;
    if (hasThinkTags(processedContent)) {
      processedContent = transformThinkTags(processedContent);
    }

    let markdownNormalized = processedContent;
    try {
      markdownNormalized = await MarkdownRenderer.render(processedContent);
    } catch (err) {
      if (this.logger?.warn) {
        this.logger.warn('Markdown rendering failed; using original content', err);
      }
    }

    // Use the modern namespaced TextEditor API for FoundryVTT v13+
    const TextEditorImpl = foundry?.applications?.ux?.TextEditor?.implementation ?? TextEditor;
    const enrichedContent = await TextEditorImpl.enrichHTML(markdownNormalized, {
      secrets: game.user.isGM,
      documents: true,
      async: true
    });

    const message = {
      id: foundry.utils.randomID(),
      role,
      content,
      display: enrichedContent,
      timestamp: Date.now(),
      user: role === 'user' ? game.user : null
    };

    this.messages.push(message);

    // If we are already at the bottom, flag that we need to scroll after the render
    if (this.#isAtBottom) {
      this.#needsScroll = true;
    }

    // Re-render only the log part for efficiency
    this.render({ parts: ['log'] });
  }

  /**
   * Clear all messages
   */
  clearMessages() {
    this.messages = [];
    this.render({ parts: ['log'] });
  }

  /**
   * Legacy scroll method for compatibility
   * @private
   */
  _scrollToBottom() {
    // This method is deprecated. Scrolling is now handled by _onRender.
    // Kept for compatibility in case of external calls, but redirects to the new method.
    setTimeout(() => {
      this.scrollBottom();
    }, 10);
  }

  /**
   * Activate event listeners
   * @param {HTMLElement} html - The rendered HTML
   */
  _activateListeners(html) {
    super._activateListeners(html);

    // Handle form submission to prevent URL redirect
    const form = html.querySelector('.chat-form');
    if (form && !form.dataset.simulacrumBound) {
      form.dataset.simulacrumBound = '1';
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const input = form.querySelector('textarea[name="message"]');
        if (input) SimulacrumSidebarTab._onSendMessage.call(this, event, input);
      });
    }

    // Handle Enter key in message input
    const input = html.querySelector('textarea[name="message"]');
    if (input && !input.dataset.simulacrumBound) {
      input.dataset.simulacrumBound = '1';
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          // Directly call send message instead of clicking button
          SimulacrumSidebarTab._onSendMessage.call(this, event, input);
        }
      });

      // Auto-focus on input
      input.focus();
    }
  }

  /**
   * Attach event listeners for a specific part (v13 HandlebarsApplicationMixin)
   * @param {string} partId - The part identifier
   * @param {HTMLElement} element - The part element
   * @param {Object} options - Rendering options
   */
  _attachPartListeners(partId, element, options) {
    super._attachPartListeners?.(partId, element, options);

    // Handle scroll events for the log part
    if (partId === 'log') {
      const scrollContainer = element.querySelector('.chat-scroll');
      if (scrollContainer && !scrollContainer.dataset.simulacrumBound) {
        scrollContainer.dataset.simulacrumBound = '1';
        scrollContainer.addEventListener('scroll', this.#onScrollLog.bind(this));
      }
    }

    // Handle input form events for the input part
    if (partId === 'input') {
      // Handle form submission to prevent URL redirect
      const form = element.querySelector('.chat-form');
      if (form && !form.dataset.simulacrumBound) {
        form.dataset.simulacrumBound = '1';
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          const input = form.querySelector('textarea[name=\"message\"]');
          if (input) SimulacrumSidebarTab._onSendMessage.call(this, event, input);
        });
      }

      // Handle Enter key in message input
      const input = element.querySelector('textarea[name="message"]');
      if (input && !input.dataset.simulacrumBound) {
        input.dataset.simulacrumBound = '1';
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            // Directly call send message instead of clicking button
            SimulacrumSidebarTab._onSendMessage.call(this, event, input);
          }
        });

        // Auto-focus on input
        input.focus();
      }
      
      // Handle cancel button explicitly (backup for data-action)
      const cancelButton = element.querySelector('[data-action="cancelProcess"]');
      if (cancelButton && !cancelButton.dataset.simulacrumBound) {
        cancelButton.dataset.simulacrumBound = '1';
        cancelButton.addEventListener('click', (event) => {
          event.preventDefault();
          SimulacrumSidebarTab._onCancelProcess.call(this, event, cancelButton);
        });
      }
    }
  }
}

/**
 * Register the sidebar tab with FoundryVTT
 */
function registerSimulacrumSidebarTab() {
  const logger = createLogger('SidebarTab');
  
  try {
    // Register the tab in the Sidebar TABS configuration
    const Sidebar = globalThis.foundry?.applications?.sidebar?.Sidebar ?? globalThis.Sidebar;
    if (Sidebar && Sidebar.TABS) {
      const desc = { tooltip: 'SIMULACRUM.SidebarTab.Title', icon: 'fa-solid fa-hand-sparkles' };
      // Insert Simulacrum before the Settings tab for better prominence
      const entries = Object.entries(Sidebar.TABS).filter(([k]) => k !== 'simulacrum');
      const reordered = {};
      let inserted = false;
      for (const [key, value] of entries) {
        if (!inserted && key === 'settings') {
          reordered['simulacrum'] = desc;
          inserted = true;
        }
        reordered[key] = value;
      }
      if (!inserted) {
        // Fallback: append if settings not found
        reordered['simulacrum'] = desc;
      }
      Sidebar.TABS = reordered;
      logger.info('Sidebar TABS registration successful');
    } else {
      logger.error('Sidebar class or TABS property not found');
    }

    // Register the application class in CONFIG.ui
    if (CONFIG && CONFIG.ui) {
      CONFIG.ui.simulacrum = SimulacrumSidebarTab;
      logger.info('CONFIG.ui registration successful');
    } else {
      logger.error('CONFIG.ui not found');
    }
    
    logger.info('Sidebar tab registration completed');
  } catch (error) {
    logger.error('Failed to register sidebar tab:', error);
  }
}

export { SimulacrumSidebarTab, registerSimulacrumSidebarTab };