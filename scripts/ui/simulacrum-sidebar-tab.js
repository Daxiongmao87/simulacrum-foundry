/**
 * Simulacrum Sidebar Tab - ApplicationV2-based sidebar tab for AI interaction
 * Replaces the panel interface with a proper FoundryVTT v13 sidebar integration
 */

import { createLogger, isDebugEnabled } from '../utils/logger.js';
import { ConversationCommands } from './conversation-commands.js';
import { transformThinkTags, hasThinkTags } from '../utils/content-processor.js';
import { ChatHandler } from '../core/chat-handler.js';
import { MarkdownRenderer } from '../lib/markdown-renderer.js';
import {
  syncMessagesFromCore,
  createWelcomeMessage as createWelcome,
  initializeChatHandler
} from './sidebar-state-syncer.js';

// Stable base class resolution for FoundryVTT v13 with fallback safety
const AbstractSidebarTab = foundry?.applications?.sidebar?.AbstractSidebarTab ?? globalThis.AbstractSidebarTab;
const HandlebarsApplicationMixin = foundry?.applications?.api?.HandlebarsApplicationMixin ?? globalThis.HandlebarsApplicationMixin;

export default class SimulacrumSidebarTab extends HandlebarsApplicationMixin(AbstractSidebarTab) {
  /**
   * Static configuration for the sidebar tab
   */
  static tabName = 'simulacrum';

  /** @override */
  static emittedEvents = Object.freeze(["render", "close", "position", "activate", "deactivate"]);

  /**
   * Define the parts of the application
   */
  static PARTS = {
    log: {
      template: 'modules/simulacrum/templates/simulacrum/sidebar-log.hbs',
      templates: ['modules/simulacrum/templates/simulacrum/message.hbs', 'modules/simulacrum/templates/simulacrum/sidebar-notifications.hbs'],
      scrollable: ['']
    },
    input: {
      template: 'modules/simulacrum/templates/simulacrum/sidebar-input.hbs'
    }
  };

  /**
   * Default application options (v13: use static DEFAULT_OPTIONS)
   */
  static DEFAULT_OPTIONS = {
    classes: ["flexcol", "chat-sidebar"],
    window: {
      title: "SIMULACRUM.SidebarTab.Title"
    },
    actions: {
      sendMessage: SimulacrumSidebarTab.prototype._onSendMessage,
      clearChat: SimulacrumSidebarTab.prototype._onClearChat,
      jumpToBottom: SimulacrumSidebarTab.prototype._onJumpToBottom,
      cancelProcess: SimulacrumSidebarTab.prototype._onCancelProcess
    }
  };

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
    const result = super.render(options);
    Promise.resolve(result).then(() => {
      if (this.element && this.element.length) {
        const font = game.settings.get('simulacrum', 'fontChoice');
        this.element.css('font-family', `"${font}", "Signika", sans-serif`);
      }
    });
    return Promise.resolve(result);
  }

  /**
   * Compatibility alias for Sidebar right-click support
   * Foundry's Sidebar class expects tab.popOut() to exist when right-clicking a tab
   * @returns {void}
   */
  popOut() {
    return this.renderPopout();
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
   * Track if AI is currently processing a message (Task-03)
   * @type {boolean}
   * @private
   */
  #isThinking = false;

  /**
   * Task-16: Index for rotating thinking words
   * @type {number}
   * @private
   */
  #thinkingWordIndex = 0;

  /**
   * Task-16: Interval ID for thinking word rotation
   * @type {number|null}
   * @private
   */
  #thinkingIntervalId = null;

  /**
   * The chat notifications container.
   * @type {HTMLDivElement}
   * @private
   */
  #notificationsElement;

  /**
   * The chat input element.
   * @type {HTMLTextAreaElement}
   * @private
   */
  #inputElement;

  /**
   * Chat controls containing roll-privacy buttons and log actions
   * @type {HTMLDivElement}
   * @private
   */
  #chatControls;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Override renderPopout to hook into the close event
   * @inheritDoc
   */
  async renderPopout() {
    const popout = await super.renderPopout();
    // Hook the close method to re-render the sidebar when popout closes
    // This ensures the input field returns to the sidebar
    const originalClose = popout.close.bind(popout);
    popout.close = async (options) => {
      this._popoutClosing = true;
      if (this.rendered) this.render();
      await originalClose(options);
      this._popoutClosing = false;
      // Final re-render to ensure state is clean
      if (this.rendered) this.render();
    };
    // Force a re-render of the sidebar to hide the input immediately
    if (this.rendered) this.render();
    return popout;
  }

  /* -------------------------------------------- */
  /*  Event Listeners                             */
  /* -------------------------------------------- */



  /**
   * Handle drop events on the textarea.
   * @param {DragEvent} event  The originating drop event.
   * @private
   */
  async #onDropTextAreaData(event) {
    event.preventDefault();
    const textarea = event.currentTarget;
    // Drop cross-linked content
    const TextEditorImpl = foundry?.applications?.ux?.TextEditor?.implementation ?? TextEditor;
    const eventData = TextEditorImpl.getDragEventData(event);
    const link = await TextEditorImpl.getContentLink(eventData);
    if (link) textarea.value += link;
  }

  /* -------------------------------------------- */

  /**
   * Render chat notifications framework.
   * @returns {Promise<void>}
   */
  async #renderNotifications() {
    const right = document.getElementById("ui-right-column-1") ?? document.body;
    const html = await renderTemplate("templates/simulacrum/sidebar-notifications.hbs", { user: game.user });
    [this.#notificationsElement, this.#inputElement, this.#chatControls] = foundry.utils.parseHTML(html);
    this.#notificationsElement.addEventListener("click", this._onClickNotification.bind(this));
    this.#inputElement.addEventListener("keydown", this._onKeyDown.bind(this));
    this.#inputElement.addEventListener("drop", this.#onDropTextAreaData.bind(this));

    right.append(this.#notificationsElement);
    this.#notificationsElement.append(this.#inputElement, this.#chatControls);
    this._toggleNotifications();
  }

  /* -------------------------------------------- */

  /**
   * Determine whether the notifications pane should be visible.
   * @param {object} [options]
   * @param {boolean} [options.closing=false]  Whether the chat popout is closing.
   * @returns {boolean}
   * @protected
   */
  _shouldShowNotifications({ closing = false } = {}) {
    const { chatNotifications, uiScale } = game.settings.get("core", "uiConfig");

    // Case 1 - Notifications disabled or pip mode.
    if ((chatNotifications === "pip") || this.options.stream) return false;

    // Case 2 - Chat tab visible in sidebar.
    if (ui.sidebar.expanded && ui.sidebar.tabGroups.primary === this.tabName) return false;

    // Case 3 - Chat popout visible.
    if (ui.sidebar.popouts[this.tabName]?.rendered && (!this.isPopout || !closing)) return false;

    // Case 4 - Not enough viewport width available.
    const cameraDock = ui.webrtc?.isVertical && !ui.webrtc?.hidden;
    const viewportWidth = window.innerWidth / uiScale;
    const spaceRequired = 1024 + (ui.sidebar.expanded * 300) + (cameraDock * 264);
    if (viewportWidth < spaceRequired) return false;

    // Otherwise, show notifications.
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Toggle the display of the notifications area.
   * If the sidebar is expanded, and the chat log is the active tab, embed chat input into it. Otherwise,
   * embed chat input into the notifications area.
   * If the sidebar is expanded, and the chat log is the active tab, do not display notifications.
   * If the chat log is popped out, do not display notifications.
   * @param {object} [options]
   * @param {boolean} [options.closing=false]  Whether this method has been triggered by the chat popout closing.
   * @fires {hookEvents:renderChatInput}
   * @internal
   */
  _toggleNotifications({ closing = false } = {}) {
    if (ui.sidebar.popouts[this.tabName]?.rendered && !this.isPopout) return;

    const notifications = this.#notificationsElement;
    const inputElement = this.#inputElement;
    const chatControls = this.#chatControls;

    if (!notifications || !inputElement || !chatControls) return;

    const log = notifications.querySelector(".chat-log");
    const privacyButtons = this.#chatControls?.querySelector("#simulacrum-privacy");

    const embedInput = !this._shouldShowNotifications({ closing });
    log.hidden = embedInput;
    privacyButtons?.classList.toggle("vertical", !embedInput);

    const previousParent = inputElement.parentElement;
    if (game.user.isGM) {
      const controlButtons = chatControls.querySelector(".control-buttons");
      if (controlButtons) controlButtons.hidden = !embedInput;
    }

    if (embedInput) {
      const target = ui.sidebar.popouts[this.tabName]?.rendered && !closing ? ui.sidebar.popouts[this.tabName] : ui.sidebar;
      target.element?.querySelector(".chat-form")?.append(chatControls, inputElement);
    } else {
      notifications.append(inputElement, chatControls);
    }

    Hooks.callAll("renderChatInput", this, {
      "#simulacrum-chat-message": inputElement,
      "#simulacrum-controls": chatControls,
      "#simulacrum-privacy": privacyButtons
    }, { previousParent });

    if (this.#isAtBottom) this.scrollBottom();
  }

  /* -------------------------------------------- */

  /**
   * Initialize the sidebar tab
   * FIXED: Constructor now popout-aware, defers complex initialization
   */
  constructor(options = {}) {
    super(options);

    // Basic initialization only - safe for both main and popout instances
    this.messages = [];
    this.logger = createLogger(`SimulacrumSidebarTab${this.isPopout ? '-Popout' : ''}`);
    this._syncedFromCore = false;
    this.chatHandler = null;
    this._deferredInitComplete = false;
    this._activeProcesses = new Map(); // callId -> { label, toolName }

    // DEFECT #2 FIX: Only register hooks for main sidebar instance, not popouts
    if (!this.isPopout) {
      this._initializeForMainInstance();
    }
  }

  /**
   * Initialize components that should only exist for the main sidebar instance
   * DEFECT #2 FIX: Prevents duplicate hook registration for popouts
   * @private
   */
  _initializeForMainInstance() {
    try {
      // Set up hook to load conversation history AFTER SimulacrumCore is ready
      Hooks.once('ready', () => {
        // Delay slightly to ensure SimulacrumCore.onReady() has completed
        setTimeout(() => {
          this._loadConversationHistoryOnInit();
        }, 100);
      });

      // Active process labels reported by core while tools execute
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

        // Also update popout if it exists
        if (this.popout?.rendered) {
          this.popout.#needsScroll = true;
          this.popout.render({ parts: ['log', 'input'] });
        }
      });

      this.logger.debug('Hooks registered for main instance');
    } catch (err) {
      this.logger.error('Hook registration failed:', err);
    }
  }

  /**
   * Create welcome message with safe i18n access
   * DEFECT #3 FIX: Moved from constructor to ensure game.i18n is available
   * @private
   */
  _createWelcomeMessage() {
    try {
      const welcome = createWelcome();
      this.messages.push(welcome);
      this.logger.debug('Welcome message created');
    } catch (err) {
      this.logger.warn('Failed to create welcome message:', err);
      // Fallback without i18n
      this.messages.push({
        id: foundry.utils.randomID(),
        role: 'assistant',
        content: 'Welcome to Simulacrum!',
        display: null,
        timestamp: Date.now(),
        timestampLabel: 'Welcome',
        user: null
      });
    }
  }

  /**
   * Handle first render initialization
   * DEFECT #3 & #4 FIX: Deferred initialization that requires game objects to be ready
   * @param {ApplicationRenderContext} context
   * @param {ApplicationRenderOptions} options
   */
  async _onFirstRender(context, options) {
    await super._onFirstRender?.(context, options);

    // DEFECT #3 & #4 FIX: Only run deferred initialization once
    if (!this._deferredInitComplete) {
      this.logger.debug('Running deferred initialization');

      // DEFECT #3 FIX: Create welcome message now that game.i18n is available
      if (this.messages.length === 0) {
        this._createWelcomeMessage();
      }

      // For popout instances, sync from main instance if available
      if (this.isPopout && ui.simulacrum && ui.simulacrum !== this) {
        try {
          this.messages = [...ui.simulacrum.messages]; // Copy messages from main instance
          this.logger.debug('Synced messages from main instance to popout');
        } catch (err) {
          this.logger.warn('Failed to sync from main instance:', err);
        }
      }

      this._deferredInitComplete = true;
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

    // Sync messages from main instance if this is a popout
    if (this.isPopout && ui.simulacrum && ui.simulacrum !== this) {
      this.messages = [...ui.simulacrum.messages];
    }

    // Conversation history is loaded via 'ready' hook

    // Create welcome message if no messages exist
    const welcomeMessage = this.messages.length === 0 ? {
      messageId: 'welcome',
      role: 'assistant',
      content: game.i18n.localize('SIMULACRUM.WelcomeMessage'),
      timestamp: new Date(),
      user: game.user
    } : null;

    // Task-03: Use #isThinking for overall thinking indicator, _activeProcesses for detailed labels
    const processActive = this.#isThinking || this._activeProcesses.size > 0;

    // Task-16: Use rotating thematic words when thinking, fall back to tool labels when processing
    let processLabel = Array.from(this._activeProcesses.values()).slice(-1)[0]?.label || null;
    if (!processLabel && this.#isThinking) {
      // Get thematic words array from localization
      const thinkingWords = game.i18n?.translations?.SIMULACRUM?.ThinkingWords ||
        ['Divining...', 'Scrying...', 'Weaving...', 'Conjuring...'];
      processLabel = thinkingWords[this.#thinkingWordIndex % thinkingWords.length];
    }

    if (isDebugEnabled()) this.logger.debug('_prepareContext processActive:', processActive, 'isThinking:', this.#isThinking, 'activeProcesses:', this._activeProcesses.size);

    return foundry.utils.mergeObject(context, {
      messages: this.messages,
      welcomeMessage: welcomeMessage,
      isGM: game.user.isGM,
      user: game.user,
      isAtBottom: this.#isAtBottom,
      processActive: processActive,
      processLabel: processLabel,
      processLabel: processLabel,
      disableInput: !this.isPopout && !!ui.sidebar.popouts[this.constructor.tabName]?.rendered && !this._popoutClosing
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

      if (cm) {
        this.messages = await syncMessagesFromCore(cm);
      }
    } catch (_e) { /* ignore */ }
  }

  /**
   * Handle message sending action
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  async _onSendMessage(event, target) {
    const form = target.closest('form');
    const input = form.querySelector('textarea[name="message"]');
    const message = input.value.trim();

    if (!message) return;

    // Check if agent is processing (Task-04: textarea stays enabled but submission blocked)
    if (this._activeProcesses?.size > 0 || this.#isThinking) {
      return; // Don't submit while agent is working
    }

    // Clear input immediately
    input.value = '';

    // Task-03: Set thinking state immediately and trigger render
    this.#isThinking = true;
    this.#thinkingWordIndex = 0;
    this.#needsScroll = true;
    this.render({ parts: ['log', 'input'] });

    // Task-16: Start word rotation interval (every 2.5 seconds)
    this.#thinkingIntervalId = setInterval(() => {
      this.#thinkingWordIndex++;
      this.render({ parts: ['log'] });
    }, 2500);

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

      // onError: Rollback user message from UI and restore to textarea
      const onError = ({ originalMessage, error }) => {
        // Remove the user message we just added to the UI
        if (this.messages.length > 0 && this.messages[this.messages.length - 1]?.role === 'user') {
          this.messages.pop();
        }
        // Restore message to textarea so user can retry
        const form = this.element?.querySelector('form');
        const textarea = form?.querySelector('textarea[name="message"]');
        if (textarea) {
          textarea.value = originalMessage;
        }
        // Error notification is already shown by ChatHandler via ui.notifications
      };

      // Process message through ChatHandler
      await this.chatHandler.processUserMessage(message, game.user, {
        onUserMessage,
        onAssistantMessage,
        onError
      });

    } catch (error) {
      // Fallback: If ChatHandler itself fails to initialize, show notification
      this.logger.error('Error processing message', error);
      ui.notifications?.error(`Simulacrum: ${error.message}`, { permanent: false });
    } finally {
      // Task-16: Clear word rotation interval
      if (this.#thinkingIntervalId) {
        clearInterval(this.#thinkingIntervalId);
        this.#thinkingIntervalId = null;
      }
      // Task-03: Always clear thinking state when done
      this.#isThinking = false;
      this.#needsScroll = true;
      this.render({ parts: ['log', 'input'] });
    }
  }

  /**
   * Handle clear chat action
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  async _onClearChat() {
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
  async _onJumpToBottom(event, target) {
    this.scrollBottom();
  }

  /**
   * Handle cancel process action
   * @param {Event} event - The originating event
   * @param {HTMLElement} target - The target element
   * @private
   */
  async _onCancelProcess(event, target) {
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
   * Handle clicks on notifications
   * @param {MouseEvent} event  The triggering event
   * @private
   */
  _onClickNotification(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const { action } = target.dataset;
    let handler = this.options.actions[action];
    let buttons = [0];
    if (typeof handler === "object") {
      buttons = handler.buttons;
      handler = handler.handler;
    }
    if (buttons.includes(event.button)) handler?.call(this, event, target);
  }

  /* -------------------------------------------- */

  /**
   * Handle keydown events
   * @param {KeyboardEvent} event  The triggering event
   * @private
   */
  _onKeyDown(event) {
    if (event.isComposing) return; // Ignore IME composition.

    // Allow external hooks to intercept chat input
    const inputOptions = { recordPending: true };
    if (Hooks.call("chatInput", event, inputOptions) === false) {
      return;
    }

    switch (event.key) {
      case "ArrowUp": case "ArrowDown":
        return;

      case "Enter":
        SimulacrumSidebarTab._onSendMessage.call(this, event, event.target);
        return;
    }

  }

  /* -------------------------------------------- */

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
        // Escape key cancels AI processing (Task-05)
        if (event.key === 'Escape' && this._activeProcesses.size > 0) {
          event.preventDefault();
          SimulacrumSidebarTab._onCancelProcess.call(this, event, input);
          return;
        }

        if (event.key === 'Enter') {
          // Shift+Enter inserts newline (Task-07)
          if (event.shiftKey) {
            return; // Allow default behavior (newline insertion)
          }
          event.preventDefault();
          // Block submission when AI is processing (Task-04)
          if (this._activeProcesses.size > 0) {
            return;
          }
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
          // Escape key cancels AI processing (Task-05)
          if (event.key === 'Escape') {
            event.preventDefault();
            this._onCancelProcess(event, input);
            return;
          }

          if (event.key === 'Enter') {
            // Shift+Enter inserts newline (Task-07)
            if (event.shiftKey) {
              return; // Allow default behavior (newline insertion)
            }
            event.preventDefault();
            // Block submission when AI is processing (Task-04)
            if (this._activeProcesses.size > 0) {
              return;
            }
            this._onSendMessage(event, input);
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
          this._onCancelProcess(event, cancelButton);
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

export { registerSimulacrumSidebarTab };