/**
 * Simulacrum Sidebar Tab - ApplicationV2-based sidebar tab for AI interaction
 * Replaces the panel interface with a proper FoundryVTT v13 sidebar integration
 */

import { createLogger, isDebugEnabled } from '../utils/logger.js';
import { SidebarEventHandlers } from './sidebar-event-handlers.js';
import {
  syncMessagesFromCore,
  processMessageForDisplay,
} from './sidebar-state-syncer.js';
import { formatPendingToolCall } from '../utils/message-utils.js';
import { SimulacrumHooks } from '../core/hook-manager.js';

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
    taskTracker: {
      template: 'modules/simulacrum/templates/simulacrum/sidebar-task-tracker.hbs',
    },
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
      openSettings: SimulacrumSidebarTab.prototype._onOpenSettings,
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
  #currentAbortController = null;
  #isRetrying = false;
  #retryLabel = null;
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

    // Listen for tool confirmation requests
    Hooks.on('simulacrumToolConfirmationRequest', (data) => {
      this._showToolConfirmation(data);
    });

    // Listen for pending tool notifications to render styled pending cards
    Hooks.on('simulacrumToolPending', (data) => {
      this._addPendingToolCard(data);
    });

    // Listen for tool results to remove pending cards
    Hooks.on('simulacrumToolResult', (data) => {
      this._removePendingToolCard(data.toolCallId);
    });

    // Listen for API retry status to show connection error warnings
    Hooks.on(SimulacrumHooks.RETRY_STATUS, (payload) => {
      if (payload.state === 'start') {
        this.#isRetrying = true;
        this.#retryLabel = payload.label || 'Connection Error, Retrying...';
        // Update DOM directly to avoid destroying ephemeral elements (confirmation dialogs, pending cards)
        this._updateRetryStatusInDOM(true);
      } else {
        this.#isRetrying = false;
        this.#retryLabel = null;
        this._updateRetryStatusInDOM(false);
      }
    });

    // Task tracker hooks
    Hooks.on(SimulacrumHooks.TASK_STARTED, (taskState) => {
      this._updateTaskTracker(taskState, true);
    });

    Hooks.on(SimulacrumHooks.TASK_UPDATED, (taskState) => {
      this._updateTaskTracker(taskState, true);
    });

    Hooks.on(SimulacrumHooks.TASK_FINISHED, () => {
      this._updateTaskTracker(null, false);
    });
  }

  /**
   * Update the process status element in the DOM directly without full re-render
   * This preserves ephemeral elements like confirmation dialogs and pending cards
   */
  _updateRetryStatusInDOM(isRetrying) {
    const chatScroll = this.element?.[0]?.querySelector('.chat-scroll') ||
      this.element?.querySelector?.('.chat-scroll');
    if (!chatScroll) return;

    const processStatusMsg = chatScroll.querySelector('.process-status-message');
    if (!processStatusMsg) return;

    const labelEl = processStatusMsg.querySelector('.process-status .label');
    const spinnerEl = processStatusMsg.querySelector('.simulacrum-process-spinner');
    const contentEl = processStatusMsg.querySelector('.message-content');

    if (isRetrying) {
      processStatusMsg.classList.add('retry-warning');
      spinnerEl?.classList.add('retry-icon');
      if (labelEl && this.#retryLabel) {
        labelEl.textContent = this.#retryLabel;
      }
    } else {
      processStatusMsg.classList.remove('retry-warning');
      spinnerEl?.classList.remove('retry-icon');
      // Restore normal label
      if (labelEl) {
        labelEl.textContent = this._getProcessLabel() || 'Thinking...';
      }
    }
  }

  /**
   * Update the task tracker element in the DOM
   * @param {object|null} taskState - The current task state or null to hide
   * @param {boolean} show - Whether to show or hide the tracker
   */
  _updateTaskTracker(taskState, show) {
    const container = this.element?.[0] || this.element;
    if (!container) return;

    const tracker = container.querySelector('.task-tracker');
    if (!tracker) return;

    if (!show || !taskState) {
      tracker.style.display = 'none';
      return;
    }

    // Show the tracker
    tracker.style.display = '';

    // Update header
    const currentStep = taskState.steps[taskState.currentStepIndex];
    const stepTitle = currentStep?.title || 'Working...';
    const iconEl = tracker.querySelector('.task-tracker-icon');
    const titleEl = tracker.querySelector('.task-tracker-title');
    const stepEl = tracker.querySelector('.task-tracker-step');
    const progressEl = tracker.querySelector('.task-tracker-progress');

    if (iconEl) {
      // Update icon based on status
      iconEl.className = currentStep?.status === 'completed'
        ? 'fa-solid fa-circle-check task-tracker-icon'
        : 'fa-solid fa-circle-notch fa-spin task-tracker-icon';
    }
    if (titleEl) titleEl.textContent = taskState.name;
    if (stepEl) stepEl.textContent = `Step ${taskState.currentStepIndex + 1}: ${stepTitle}`;
    if (progressEl) progressEl.textContent = `(${taskState.currentStepIndex + 1}/${taskState.totalSteps})`;

    // Update body
    const goalEl = tracker.querySelector('.task-tracker-goal');
    const stepsEl = tracker.querySelector('.task-tracker-steps');

    if (goalEl) goalEl.textContent = taskState.goal;

    if (stepsEl) {
      stepsEl.innerHTML = taskState.steps.map((step, index) => {
        let iconClass = 'fa-regular fa-square';
        let liClass = '';
        if (step.status === 'completed') {
          iconClass = 'fa-solid fa-circle-check';
          liClass = 'completed-step';
        } else if (step.status === 'in_progress') {
          iconClass = 'fa-solid fa-circle-notch fa-spin';
          liClass = 'current-step';
        }
        if (index === taskState.currentStepIndex) liClass = 'current-step';
        return `<li class="${liClass}"><i class="${iconClass}"></i><span>${step.title}</span></li>`;
      }).join('');
    }

    // Set up toggle button click handler (only once)
    const toggleBtn = tracker.querySelector('.task-tracker-toggle');
    const header = tracker.querySelector('.task-tracker-header');
    if (header && !header.dataset.listenerAttached) {
      header.addEventListener('click', () => {
        tracker.classList.toggle('expanded');
      });
      header.dataset.listenerAttached = 'true';
    }
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

    // SECURITY: Defensive check - GM-only access
    if (!game.user?.isGM) {
      return foundry.utils.mergeObject(context, {
        messages: [],
        welcomeMessage: null,
        isGM: false,
        user: game.user,
        accessDenied: true,
        accessDeniedMessage: game.i18n?.localize('SIMULACRUM.AccessDenied') ?? 'Simulacrum is only available to Game Masters.',
        isAtBottom: true,
        processActive: false,
        processLabel: null,
        disableInput: true,
      });
    }

    // Check if endpoint is configured
    const apiKey = game.settings.get('simulacrum', 'apiKey');
    const baseURL = game.settings.get('simulacrum', 'baseURL');
    const hasValidConfig = apiKey || baseURL;

    if (!hasValidConfig) {
      return foundry.utils.mergeObject(context, {
        messages: [],
        welcomeMessage: null,
        isGM: true,
        user: game.user,
        configurationRequired: true,
        configurationMessage: game.i18n?.localize('SIMULACRUM.ConfigurationRequired') ?? 'Please configure your AI endpoint in module settings.',
        isAtBottom: true,
        processActive: false,
        processLabel: null,
        disableInput: true,
      });
    }

    // Sync messages if empty
    if (this.messages.length === 0) {
      await this._syncFromCoreConversation();
    }

    const processActive = this.#isThinking || this._activeProcesses.size > 0 || this.#isRetrying;
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
      isGM: game.user.isGM,
      user: game.user,
      isAtBottom: this.#isAtBottom,
      processActive,
      processLabel,
      processIsRetrying: this.#isRetrying,
      disableInput:
        !this.isPopout &&
        !!ui.sidebar.popouts[this.constructor.tabName]?.rendered &&
        !this._popoutClosing,
    });
  }

  _getProcessLabel() {
    // Prioritize retry label (connection errors) over normal process labels
    if (this.#isRetrying && this.#retryLabel) {
      return this.#retryLabel;
    }

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
    const atTop = log.scrollTop < 8;
    this.#isAtBottom = atBottom;

    // Toggle 'scrolled' class when there is content below (i.e. not at bottom)
    log.classList.toggle('scrolled', !atBottom);
    // Toggle 'not-at-top' class when scrolled down from top
    log.classList.toggle('not-at-top', !atTop);

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
      // Update label directly in DOM to avoid destroying ephemeral elements (confirmation dialogs)
      this._updateThinkingLabelInDOM();
    }, 2500);
  }

  /**
   * Update the thinking label text directly in DOM without full re-render
   */
  _updateThinkingLabelInDOM() {
    const chatScroll = this.element?.[0]?.querySelector('.chat-scroll') ||
      this.element?.querySelector?.('.chat-scroll');
    if (!chatScroll) return;

    const processStatusMsg = chatScroll.querySelector('.process-status-message');
    if (!processStatusMsg) return;

    const labelEl = processStatusMsg.querySelector('.process-status .label');
    if (labelEl) {
      // Get current thinking word
      const thinkingWords = game.i18n?.translations?.SIMULACRUM?.ThinkingWords || [
        'Divining...',
        'Scrying...',
        'Weaving...',
        'Conjuring...',
      ];
      labelEl.textContent = thinkingWords[this.#thinkingWordIndex % thinkingWords.length];
    }
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

  async addMessage(role, content, display = null, noGroup = false) {
    const processedDisplay = display || (await processMessageForDisplay(content));

    // Check for grouping (skip if noGroup flag is set)
    if (!noGroup && this.messages.length > 0 && role === 'assistant') {
      const lastMsg = this.messages[this.messages.length - 1];
      if (lastMsg.role === 'assistant') {
        // Merge!
        lastMsg.content += '\n\n' + content;
        lastMsg.display = (lastMsg.display || lastMsg.content) + processedDisplay;

        // Try to update DOM directly to avoid destroying ephemeral elements (confirmation dialogs)
        const updated = this._updateMessageInDOM(lastMsg.id, lastMsg.display);
        if (!updated) {
          // Fallback to render if element not found
          this.#needsScroll = true;
          this.render({ parts: ['log'] });
        } else {
          // Scroll to bottom if needed
          this._scrollToBottom();
        }
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

    // Render the single message template and append to DOM
    // This avoids destruction of ephemeral elements (confirmation dialogs) caused by full re-renders
    const templatePath = 'modules/simulacrum/templates/simulacrum/message.hbs';
    const html = await renderTemplate(templatePath, msg);

    const chatScroll = this.element?.[0]?.querySelector('.chat-scroll') ||
      this.element?.querySelector?.('.chat-scroll');

    if (chatScroll) {
      // Create a temporary container to extract the element
      const div = document.createElement('div');
      div.innerHTML = html;
      const messageEl = div.firstElementChild;

      // Before appending, check if we need to remove any "process status" or "pending" elements?
      // No, usually we just append. But we might want to insert BEFORE the process status if it exists.
      // However, process status is usually at the bottom.
      // If we append, it goes after process status. 
      // Foundry structure: <ol class="chat-log"> ... </ol>
      // Process status is an <li> inside the <ol>.

      const chatLog = chatScroll.querySelector('.chat-log');
      if (chatLog) {
        // Check for process status message to insert before (direct child only)
        const processStatus = chatLog.querySelector(':scope > .process-status-message');
        if (processStatus) {
          chatLog.insertBefore(messageEl, processStatus);
        } else {
          chatLog.appendChild(messageEl);
        }
      }

      this._scrollToBottom();
    } else {
      // Fallback only if DOM is missing (should not happen if visible)
      this.#needsScroll = true;
      this.render({ parts: ['log'] });
    }
  }

  /**
   * Update message content in DOM directly
   * @param {string} messageId - ID of the message to update
   * @param {string} content - New HTML content
   * @returns {boolean} True if updated, false if element not found
   */
  _updateMessageInDOM(messageId, content) {
    if (!this.element) return false;

    // Find message element by data-message-id
    // Note: The template needs to ensure data-message-id is set. 
    // Looking at message.hbs, we might need to verify if ID is on the element.
    // If not, we might need to find the LAST assistant message.

    const chatScroll = this.element[0]?.querySelector('.chat-scroll') ||
      this.element.querySelector?.('.chat-scroll');
    if (!chatScroll) return false;

    // Strategy: Start from bottom and find the last assistant message that matches
    const messages = chatScroll.querySelectorAll('.chat-message');
    if (messages.length === 0) return false;

    // Iterate backwards
    for (let i = messages.length - 1; i >= 0; i--) {
      const msgEl = messages[i];
      // Check if this is the message we want (by ID if possible, or assumption it's the last one)
      // Since addMessage only merges into the VERY LAST message of the array, 
      // we can assume the last message in DOM (ignoring ephemeral ones like confirmation/pending) is the target.

      // Skip ephemeral elements
      if (msgEl.classList.contains('tool-confirmation-wrapper') ||
        msgEl.classList.contains('pending-tool-wrapper') ||
        msgEl.classList.contains('process-status-message')) {
        continue;
      }

      // This should be our message
      const contentEl = msgEl.querySelector('.message-content');
      if (contentEl) {
        contentEl.innerHTML = content;
        return true;
      }
      return false; // Found the message element but no content wrapper?
    }
    return false;
  }

  _scrollToBottom() {
    const chatScroll = this.element?.[0]?.querySelector('.chat-scroll') ||
      this.element?.querySelector?.('.chat-scroll');
    if (chatScroll) {
      chatScroll.scrollTop = chatScroll.scrollHeight;
    }
  }

  /**
   * Add a pending tool card to the chat display
   * Appended inside the last assistant message's content to maintain card continuity
   * @param {Object} data - Pending tool data
   * @param {string} data.toolCallId - The tool call ID for tracking
   * @param {string} data.toolName - The name of the tool being executed
   * @param {string} [data.justification] - Optional justification/reason
   */
  _addPendingToolCard(data) {
    const { toolCallId, toolName, justification } = data;

    // Hidden tools have dedicated UI elsewhere (e.g., task tracker) - skip pending cards
    const hiddenTools = ['end_loop', 'manage_task'];
    if (hiddenTools.includes(toolName)) {
      return;
    }

    // Generate the pending card HTML using the utility function
    const pendingHtml = formatPendingToolCall(toolName, justification || '', toolCallId);

    // Find the last assistant message's content container
    const lastAssistantContent = this._getLastAssistantMessageContent();

    if (lastAssistantContent) {
      // Append directly to the last assistant message content
      const wrapper = document.createElement('div');
      wrapper.className = 'pending-tool-inline';
      wrapper.dataset.toolCallId = toolCallId;
      wrapper.innerHTML = pendingHtml;
      lastAssistantContent.appendChild(wrapper);

      // Scroll to bottom
      this._scrollToBottom();
    }
  }

  /**
   * Get the last assistant message's .message-content element from DOM
   * Skips ephemeral elements like process-status, pending cards, and confirmations
   * @returns {HTMLElement|null}
   */
  _getLastAssistantMessageContent() {
    const chatScroll = this.element?.[0]?.querySelector('.chat-scroll') ||
      this.element?.querySelector?.('.chat-scroll');
    if (!chatScroll) return null;

    const chatLog = chatScroll.querySelector('.chat-log');
    if (!chatLog) return null;

    // Find the last assistant message (skip ephemeral elements)
    const messages = chatLog.querySelectorAll('.chat-message.simulacrum-role-assistant');
    if (messages.length === 0) return null;

    const lastMsg = messages[messages.length - 1];
    return lastMsg.querySelector('.message-content');
  }

  /**
   * Remove a pending tool card when the result arrives
   * @param {string} toolCallId - The tool call ID to find and remove
   */
  _removePendingToolCard(toolCallId) {
    if (!toolCallId) return;

    const chatScroll = this.element?.[0]?.querySelector('.chat-scroll') ||
      this.element?.querySelector?.('.chat-scroll');

    if (chatScroll) {
      // Look for inline pending cards (new pattern) or standalone wrappers (legacy)
      const pendingEl = chatScroll.querySelector(`.pending-tool-inline[data-tool-call-id="${toolCallId}"]`) ||
        chatScroll.querySelector(`.pending-tool-wrapper[data-tool-call-id="${toolCallId}"]`);
      if (pendingEl) {
        pendingEl.remove();
      }
    }
  }

  rollbackUserMessage() {
    if (this.messages.length > 0 && this.messages[this.messages.length - 1]?.role === 'user') {
      this.messages.pop();
      this.render({ parts: ['log'] });
    }
  }

  async clearMessages() {
    this.messages = [];
    await this.render({ parts: ['log'] });
  }

  markAtBottom(atBottom) {
    this.#isAtBottom = atBottom;
  }

  /**
   * Start a new process and return the abort signal
   * @returns {AbortSignal} The signal to pass to async operations
   */
  startProcess() {
    // Abort any existing process first
    if (this.#currentAbortController) {
      this.#currentAbortController.abort();
    }
    this.#currentAbortController = new AbortController();
    return this.#currentAbortController.signal;
  }

  async cancelCurrentProcesses() {
    // Abort the current operation if running
    if (this.#currentAbortController) {
      this.#currentAbortController.abort();
      this.#currentAbortController = null;
    }
    this._activeProcesses.clear();
    this.setThinking(false);
    return true;
  }

  /**
   * Show tool confirmation UI inline in chat
   * @param {Object} data - Confirmation request data
   * @param {string} data.toolName - Tool name
   * @param {string} data.toolCallId - Tool call ID
   * @param {string} data.displayName - Display name for the tool
   * @param {string} data.explainerText - Explanation of what the tool does
   * @param {string} data.toolArgs - JSON stringified tool arguments
   */
  async _showToolConfirmation(data) {
    // Guard: Only respond if this instance is rendered and has an element
    // This prevents errors when the Hook fires before render or for non-active instances
    if (!this.rendered || !this.element) {
      return;
    }

    const { toolName, toolCallId, displayName, explainerText, justification, toolArgs } = data;

    // Render the confirmation template
    const templatePath = 'modules/simulacrum/templates/simulacrum/tool-confirmation.hbs';
    const html = await renderTemplate(templatePath, {
      toolName,
      toolCallId,
      displayName,
      explainerText,
      justification,
      toolArgs,
    });

    // Find the last assistant message's content container
    const lastAssistantContent = this._getLastAssistantMessageContent();

    if (!lastAssistantContent) {
      this.logger.warn('No assistant message found to attach confirmation dialog');
      return;
    }

    // Create inline confirmation element
    const confirmationEl = document.createElement('div');
    confirmationEl.className = 'tool-confirmation-inline';
    confirmationEl.dataset.toolCallId = toolCallId;
    confirmationEl.innerHTML = html;

    // Append to the last assistant message content
    lastAssistantContent.appendChild(confirmationEl);

    // Scroll to bottom
    this._scrollToBottom();

    // Attach button click handlers
    const buttons = confirmationEl.querySelectorAll('.confirm-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const action = btn.dataset.action;

        // Remove the confirmation UI
        confirmationEl.remove();

        // Emit response via hook
        Hooks.callAll('simulacrumToolConfirmationResponse', toolCallId, action);
      });
    });
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

  async _onOpenSettings(_event, _target) {
    // Open the module settings
    const { SettingsInterface } = await import('./settings-interface.js');
    SettingsInterface.open();
  }

  _activateListeners(html) {
    super._activateListeners(html);
    // Basic listeners that don't fit in parts or needed globally?
    // Most are in _attachPartListeners now.
  }

  _attachPartListeners(partId, element, options) {
    super._attachPartListeners?.(partId, element, options);

    // Delegate to Handler if possible, or keep simple logic here
    if (partId === 'log') {
      // FIX: .chat-scroll is the ROOT element of 'log' part, so querySelector fails
      const scroll = element.classList.contains('chat-scroll') ? element : element.querySelector('.chat-scroll');

      if (scroll) {
        scroll.addEventListener('scroll', _e => {
          this._updateJumpToBottomVisibility(scroll);
        });

        // Toggle justification expansion on click (for completed tool cards only)
        scroll.addEventListener('click', e => {
          const justification = e.target.closest('.tool-success .tool-justification, .tool-failure .tool-justification');
          if (justification) {
            justification.classList.toggle('expanded');
          }
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
