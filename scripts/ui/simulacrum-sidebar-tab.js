/**
 * Simulacrum Sidebar Tab - ApplicationV2-based sidebar tab for AI interaction
 * Replaces the panel interface with a proper FoundryVTT v13 sidebar integration
 */

import { createLogger, isDebugEnabled } from '../utils/logger.js';
import { SidebarEventHandlers } from './sidebar-event-handlers.js';
import {
  syncMessagesFromCore,
  createWelcomeMessage,
  processMessageForDisplay,
} from './sidebar-state-syncer.js';

// Stable base class resolution for FoundryVTT v13 with fallback safety
const AbstractSidebarTab =
  foundry?.applications?.sidebar?.AbstractSidebarTab ?? globalThis.AbstractSidebarTab;
const HandlebarsApplicationMixin =
  foundry?.applications?.api?.HandlebarsApplicationMixin ?? globalThis.HandlebarsApplicationMixin;

export class SimulacrumSidebarTab extends HandlebarsApplicationMixin(AbstractSidebarTab) {
  static tabName = 'simulacrum';

  /** @override */
  static emittedEvents = Object.freeze(['render', 'close', 'position', 'activate', 'deactivate']);

  static PARTS = {
    log: {
      template: 'modules/simulacrum/templates/simulacrum/sidebar-log.hbs',
      templates: [
        'modules/simulacrum/templates/simulacrum/message.hbs',
        'modules/simulacrum/templates/simulacrum/sidebar-notifications.hbs',
      ],
      scrollable: [''],
    },
    input: {
      template: 'modules/simulacrum/templates/simulacrum/sidebar-input.hbs',
    },
  };

  static DEFAULT_OPTIONS = {
    id: 'simulacrum',
    classes: ['flexcol', 'chat-sidebar'],
    window: {
      title: 'SIMULACRUM.SidebarTab.Title',
    },
    actions: {
      sendMessage: SimulacrumSidebarTab.prototype._onSendMessage,
      clearChat: SimulacrumSidebarTab.prototype._onClearChat,
      jumpToBottom: SimulacrumSidebarTab.prototype._onJumpToBottom,
      cancelProcess: SimulacrumSidebarTab.prototype._onCancelProcess,
    },
  };

  /** Private fields */
  #isAtBottom = true;
  #needsScroll = false;
  #isThinking = false;
  #thinkingWordIndex = 0;
  #thinkingIntervalId = null;
  #notificationsElement;
  #inputElement;
  #chatControls;
  _popoutClosing = false;

  constructor(options) {
    super(options);
    this.messages = [];
    this._activeProcesses = new Map();
    this.chatHandler = null;
    this.logger = createLogger('SimulacrumSidebarTab');

    // Sync when conversation is loaded (race condition fix)
    Hooks.on('simulacrumConversationLoaded', async () => {
      await this._syncFromCoreConversation();
      if (this.rendered) this.render();
    });
  }

  _render(optionsOrForce) {
    const options =
      typeof optionsOrForce === 'boolean' ? { force: optionsOrForce } : optionsOrForce || {};
    return Promise.resolve(super.render(options));
  }

  render(...args) {
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

  popOut() {
    return this.renderPopout();
  }

  async renderPopout() {
    const popout = await super.renderPopout();
    const originalClose = popout.close.bind(popout);
    popout.close = async options => {
      this._popoutClosing = true;
      if (this.rendered) this.render();
      await originalClose(options);
      this._popoutClosing = false;
      if (this.rendered) this.render();
    };
    if (this.rendered) this.render();
    return popout;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Sync messages if empty
    if (this.messages.length === 0) {
      await this._syncFromCoreConversation();
    }

    const processActive = this.#isThinking || this._activeProcesses.size > 0;
    const processLabel = this._getProcessLabel();

    if (isDebugEnabled()) {
      this.logger.debug(
        '_prepareContext processActive:',
        processActive,
        'isThinking:',
        this.#isThinking
      );
    }

    return foundry.utils.mergeObject(context, {
      messages: this.messages,
      welcomeMessage: this.messages.length === 0 ? createWelcomeMessage() : null,
      isGM: game.user.isGM,
      user: game.user,
      isAtBottom: this.#isAtBottom,
      processActive,
      processLabel,
      disableInput:
        !this.isPopout &&
        !!ui.sidebar.popouts[this.constructor.tabName]?.rendered &&
        !this._popoutClosing,
    });
  }

  _getProcessLabel() {
    let label = Array.from(this._activeProcesses.values()).slice(-1)[0]?.label || null;
    if (!label && this.#isThinking) {
      const thinkingWords = game.i18n?.translations?.SIMULACRUM?.ThinkingWords || [
        'Divining...',
        'Scrying...',
        'Weaving...',
        'Conjuring...',
      ];
      label = thinkingWords[this.#thinkingWordIndex % thinkingWords.length];
    }
    return label;
  }

  async _syncFromCoreConversation() {
    // Logic handled in state syncer helper or simplified here
    try {
      let cm;
      if (this.chatHandler) {
        cm = this.chatHandler.conversationManager;
      } else {
        const { SimulacrumCore } = await import('../core/simulacrum-core.js');
        cm = SimulacrumCore?.conversationManager;
      }
      if (cm) {
        this.messages = await syncMessagesFromCore(cm);
        this.#needsScroll = true;
      }
    } catch (_e) {
      /* ignore */
    }
  }

  async _loadConversationHistoryOnInit() {
    return this._syncFromCoreConversation();
  }

  async _postRender(_context, options) {
    // Only attempt scroll if the tab is currently active. If not active, scrolling a hidden
    // element will fail silently. Keep #needsScroll = true so _onActivate can try again.
    const isTabActive = ui.sidebar?.tabGroups?.primary === this.constructor.tabName;

    if (this.#needsScroll || options.isFirstRender) {
      if (isTabActive) {
        await this._scrollToBottom({ waitImages: options.isFirstRender });
        this.#needsScroll = false;
      } else {
        // Tab is not active. Set the flag so _onActivate will scroll when the tab becomes visible.
        this.#needsScroll = true;
      }
    } else {
      // Ensure button visibility is correct even if we didn't scroll to bottom
      const log = this.element[0]?.querySelector('.chat-scroll') ?? this.element.querySelector?.('.chat-scroll');
      if (log) this._updateJumpToBottomVisibility(log);
    }
  }

  /** @inheritDoc */
  async _onActivate() {
    super._onActivate?.();
    // Only scroll if there's a pending scroll request (from messages added while inactive)
    if (this.#needsScroll) {
      // Yield to the browser to ensure layout update (display: none -> block) is processed
      // before we try to set scrollTop. Double rAF ensures we are in the next paint frame.
      await new Promise(resolve => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(resolve);
        });
      });
      await this._scrollToBottom({ waitImages: true });
      this.#needsScroll = false;
    }
  }

  /**
   * Scroll the chat log to the bottom.
   * @param {object} [options]
   * @param {boolean} [options.waitImages=false] Wait for images to load before scrolling.
   */
  async _scrollToBottom({ waitImages = false } = {}) {
    if (!this.element) return;
    const log =
      this.element[0]?.querySelector('.chat-scroll') ??
      this.element.querySelector?.('.chat-scroll');
    if (log) {
      if (waitImages) await this.constructor.waitForImages(log);
      log.scrollTop = log.scrollHeight;
      this._updateJumpToBottomVisibility(log);
    }
  }

  /**
   * Wait for all images in an element to load.
   * @param {HTMLElement} element The container element.
   * @returns {Promise<void>}
   */
  static async waitForImages(element) {
    const images = element.querySelectorAll('img');
    const promises = Array.from(images).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    });
    await Promise.all(promises);
  }

  _updateJumpToBottomVisibility(log) {
    if (!log) return;
    const dist = log.scrollHeight - log.scrollTop - log.clientHeight;
    const atBottom = dist < 32;
    this.#isAtBottom = atBottom;

    // Toggle 'scrolled' class when there is content below (i.e. not at bottom)
    log.classList.toggle('scrolled', !atBottom);

    if (this.#inputElement) {
      const btn = this.#inputElement.querySelector('.jump-to-bottom');
      if (btn) {
        btn.toggleAttribute('hidden', atBottom);
      }
    }
  }

  /* Public Interface for Handlers */

  isProcessing() {
    return this.#isThinking || this._activeProcesses.size > 0;
  }

  setThinking(active) {
    this.#isThinking = active;
    if (active) {
      this.#thinkingWordIndex = 0;
      this.#needsScroll = true;
      this.render({ parts: ['log', 'input'] });
      this.#startThinkingInterval();
    } else {
      this.#stopThinkingInterval();
      this.#needsScroll = true;
      this.render({ parts: ['log', 'input'] });
    }
  }

  #startThinkingInterval() {
    if (this.#thinkingIntervalId) clearInterval(this.#thinkingIntervalId);
    this.#thinkingIntervalId = setInterval(() => {
      this.#thinkingWordIndex++;
      this.render({ parts: ['log'] });
    }, 2500);
  }

  #stopThinkingInterval() {
    if (this.#thinkingIntervalId) {
      clearInterval(this.#thinkingIntervalId);
      this.#thinkingIntervalId = null;
    }
  }

  async ensureChatHandler() {
    if (!this.chatHandler) {
      const { SimulacrumCore } = await import('../core/simulacrum-core.js');
      const { ChatHandler } = await import('../core/chat-handler.js');
      if (SimulacrumCore?.conversationManager) {
        this.chatHandler = new ChatHandler(SimulacrumCore.conversationManager);
      }
    }
    return this.chatHandler;
  }

  async addMessage(role, content, display = null) {
    const processedDisplay = display || (await processMessageForDisplay(content));

    // Check for grouping
    if (this.messages.length > 0 && role === 'assistant') {
      const lastMsg = this.messages[this.messages.length - 1];
      if (lastMsg.role === 'assistant') {
        // Merge!
        lastMsg.content += '\n\n' + content;
        lastMsg.display = (lastMsg.display || lastMsg.content) + processedDisplay;
        // Don't push a new message, just update UI
        this.#needsScroll = true;
        this.render({ parts: ['log'] });
        return;
      }
    }

    const msg = {
      role,
      content,
      display: processedDisplay,
      timestamp: new Date(),
      user: role === 'user' ? game.user : undefined,
      id: foundry.utils.randomID(),
      pending: false,
    };
    this.messages.push(msg);
    this.#needsScroll = true;
    this.render({ parts: ['log'] });
  }

  rollbackUserMessage() {
    if (this.messages.length > 0 && this.messages[this.messages.length - 1]?.role === 'user') {
      this.messages.pop();
      this.render({ parts: ['log'] });
    }
  }

  clearMessages() {
    this.messages = [];
    this.render({ parts: ['log'] });
  }

  markAtBottom(atBottom) {
    this.#isAtBottom = atBottom;
  }

  async cancelCurrentProcesses() {
    // Implement cancellation
    if (this._activeProcesses.size === 0) return false;
    // Logic to emit cancel event or use controller
    // For now, assuming ChatHandler handles it via signal if integrated
    // Reset state mainly
    this._activeProcesses.clear();
    this.setThinking(false);
    return true;
  }

  /** Event Handler Delegates */

  async _onSendMessage(event, target) {
    if (isDebugEnabled()) this.logger.debug('_onSendMessage triggered');
    await SidebarEventHandlers.handleSendMessage(this, event, target);
  }

  async _onClearChat(_event, _target) {
    await SidebarEventHandlers.handleClearChat(this);
  }

  async _onJumpToBottom(_event, _target) {
    await SidebarEventHandlers.handleJumpToBottom(this);
  }

  async _onCancelProcess(event, target) {
    await SidebarEventHandlers.handleCancelProcess(this, event, target);
  }

  _activateListeners(html) {
    super._activateListeners(html);
    // Basic listeners that don't fit in parts or needed globally?
    // Most are in _attachPartListeners now.
  }

  _attachPartListeners(partId, element, options) {
    super._attachPartListeners?.(partId, element, options);
    // console.log(`Simulacrum | _attachPartListeners`, partId, element);

    // Delegate to Handler if possible, or keep simple logic here
    if (partId === 'log') {
      // FIX: .chat-scroll is the ROOT element of 'log' part, so querySelector fails
      const scroll = element.classList.contains('chat-scroll') ? element : element.querySelector('.chat-scroll');

      // console.log('Simulacrum | Attaching log listeners. Scroll element found:', !!scroll);

      if (scroll) {
        scroll.addEventListener('scroll', _e => {
          this._updateJumpToBottomVisibility(scroll);
        });
      }
    }
    if (partId === 'input') {
      this.#inputElement = element;
      const form = element.querySelector('.chat-form');
      if (form && !form.dataset.simulacrumBound) {
        form.dataset.simulacrumBound = '1';
        form.addEventListener('submit', event => {
          event.preventDefault();
          const input = form.querySelector('textarea[name="message"]');
          if (input) this._onSendMessage(event, input);
        });
      }

      const input = element.querySelector('textarea[name="message"]');
      if (input && !input.dataset.simulacrumBound) {
        input.dataset.simulacrumBound = '1';
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this._onSendMessage(e, input);
          }
        });
      }
    }
  }
}
