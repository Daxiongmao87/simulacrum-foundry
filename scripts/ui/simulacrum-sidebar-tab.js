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
import { modelService } from '../core/model-service.js';
import { formatPendingToolCall, formatToolCallDisplay } from '../utils/message-utils.js';
import { SimulacrumHooks } from '../core/hook-manager.js';
import { SequentialQueue } from '../utils/sequential-queue.js';

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
  #availableModels = [];
  #modelsLoaded = false;
  #loadingModelPromise = null;
  #modelDropdownHighlightIndex = -1;
  #statusInterval = null;
  #modelSaveDebounceTimer = null;
  #contextLimitDebounceTimer = null;

  constructor(options) {
    super(options);
    this.messages = [];
    this._activeProcesses = new Map();
    this.chatHandler = null;
    this.logger = createLogger('SimulacrumSidebarTab');
    this._messageQueue = new SequentialQueue();

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
      this._addToolResultCard(data);
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

    // Asset index status hooks
    Hooks.on(SimulacrumHooks.INDEX_STATUS, (payload) => {
      this._updateIndexStatus(payload);
    });

    // Endpoint validation status hooks
    Hooks.on(SimulacrumHooks.ENDPOINT_STATUS, (payload) => {
      this._updateEndpointStatus(payload);
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
  _updateIndexStatus(payload) {
    const container = this.element?.[0] || this.element;
    if (!container) return;

    const statusArea = container.querySelector('.simulacrum-status-area');
    if (!statusArea) return;

    const { state, fileCount = 0, folderCount = 0 } = payload;
    const statusText = statusArea.querySelector('.status-text');

    if (state === 'complete') {
      statusArea.style.display = 'none';
    } else {
      statusArea.style.display = '';
      if (statusText) {
        if (state === 'start') {
          statusText.textContent = 'Indexing assets...';
        } else if (state === 'progress') {
          statusText.textContent = `Indexing... (${fileCount} files, ${folderCount} folders)`;
        }
      }
    }
  }

  /**
   * Update the status area to show endpoint validation errors
   * @param {Object} payload - { state: 'ok'|'error', message?: string }
   */
  _updateEndpointStatus(payload) {
    const container = this.element?.[0] || this.element;
    if (!container) return;

    const statusArea = container.querySelector('.simulacrum-status-area');
    if (!statusArea) return;

    const { state, message } = payload;
    const statusText = statusArea.querySelector('.status-text');
    const statusIcon = statusArea.querySelector('.status-icon');

    if (state === 'ok') {
      // Hide status area when endpoint is OK (unless indexing is active)
      // Check if indexing is currently shown
      if (statusText?.textContent?.includes('Indexing')) {
        // Don't hide - indexing is in progress
        return;
      }
      statusArea.style.display = 'none';
    } else {
      statusArea.style.display = '';
      if (statusIcon) {
        statusIcon.className = 'status-icon fa-solid fa-triangle-exclamation';
      }
      if (statusText) {
        statusText.textContent = message || 'Endpoint not available';
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
    const stepEl = tracker.querySelector('.task-tracker-step');
    const progressEl = tracker.querySelector('.task-tracker-progress');

    if (iconEl) {
      // Update icon based on status
      iconEl.className = currentStep?.status === 'completed'
        ? 'fa-solid fa-circle-check task-tracker-icon'
        : 'fa-solid fa-circle-notch fa-spin task-tracker-icon';
    }
    if (stepEl) stepEl.textContent = `Step ${taskState.currentStepIndex + 1}: ${stepTitle}`;
    if (progressEl) progressEl.textContent = `(${taskState.currentStepIndex + 1}/${taskState.totalSteps})`;

    // Update body
    const titleEl = tracker.querySelector('.task-tracker-title');
    const goalEl = tracker.querySelector('.task-tracker-goal');
    const stepsEl = tracker.querySelector('.task-tracker-steps');

    if (titleEl) titleEl.textContent = taskState.name;
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
      currentModel: game.settings.get('simulacrum', 'model') || '',
      contextLimit: this._getFormattedContextLimit(game.settings.get('simulacrum', 'model')),
    });
  }

  /**
   * Get formatted context limit for a model (e.g., "128k", "1M")
   * @param {string} modelId
   * @returns {string}
   */
  _getFormattedContextLimit(modelId) {
    if (!modelId) return '32k';

    // Check for derived limit first
    const { limit, source } = modelService.getContextLimit(modelId);

    console.log(`[Simulacrum] Derived limit for ${modelId}: ${limit} (source: ${source})`);

    if (limit > 0 && (source === 'derived' || source === 'openrouter')) {
      return this._formatLimitValue(limit);
    }

    // Use stored fallback if no derived limit
    const storedLimit = game.settings.get('simulacrum', 'fallbackContextLimit');
    return this._formatLimitValue(storedLimit);
  }


  /**
   * Format numeric limit to string string (e.g. 1000 -> "1k")
   * @param {number} limit 
   * @returns {string}
   */
  _formatLimitValue(limit) {
    if (!limit) return '';

    // Millions: always format with up to 2 decimals
    if (limit >= 1000000) {
      return `${parseFloat((limit / 1000000).toFixed(2))}M`;
    }

    // Thousands:
    // If >= 10k or exact thousand, use 'k' notation with decimals
    // Else (small integers like 1024, 4096, 8192) show raw number
    if (limit >= 10000 || (limit >= 1000 && limit % 1000 === 0)) {
      return `${parseFloat((limit / 1000).toFixed(2))}k`;
    }

    return `${limit}`;
  }



  /**
   * Debounced model save - saves 500ms after user stops typing
   * @param {string} model - The model ID to save
   */
  _debouncedSaveModel(model) {
    if (this.#modelSaveDebounceTimer) {
      clearTimeout(this.#modelSaveDebounceTimer);
    }
    this.#modelSaveDebounceTimer = setTimeout(() => {
      this._saveModelSelection(model);
      this.#modelSaveDebounceTimer = null;
    }, 500);
  }

  /**
   * Save model selection to settings
   * @param {string} model - The model ID to save
   */
  async _saveModelSelection(model) {
    const currentModel = game.settings.get('simulacrum', 'model');
    if (model && model !== currentModel) {
      try {
        await game.settings.set('simulacrum', 'model', model);
        this.logger.info(`Model changed to: ${model}`);

        // CRITICAL: Explicitly reinitialize AI client here to avoid race condition.
        // The settings onChange callback is async and doesn't block, so the user
        // could send a message before it completes. By awaiting this here, we ensure
        // the AI client uses the new model before returning control to the UI.
        const { SimulacrumCore } = await import('../core/simulacrum-core.js');
        await SimulacrumCore.initializeAIClient();

        // Update context limit input
        const limitInput = this.element.querySelector('.context-limit-input');
        if (limitInput) {
          const newVal = this._getFormattedContextLimit(model);
          console.log(`[Simulacrum] Updating input to: ${newVal}`);
          limitInput.value = newVal;
        } else {
          console.warn('[Simulacrum] Could not find .context-limit-input to update');
        }
      } catch (e) {
        this.logger.warn('Failed to save model selection:', e);
      }
    }
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
    // Prevent syncing while the agent is actively processing/thinking.
    // This avoids race conditions where a stale Core State (triggered by a document update hook)
    // overwrites the live DOM updates (like Tool Cards) that the ChatHandler is managing.
    if (this.isProcessing()) {
      return;
    }

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
    // Queue the message addition to prevent race conditions
    return this._messageQueue.add(async () => {
      const processedDisplay = display || (await processMessageForDisplay(content));

      // Check for grouping (skip if noGroup flag is set)
      if (!noGroup && this.messages.length > 0 && role === 'assistant') {
        const lastMsg = this.messages[this.messages.length - 1];
        if (lastMsg.role === 'assistant') {
          // Merge with proper HTML separation to prevent content running together
          lastMsg.content += '\n\n' + content;
          const existingDisplay = lastMsg.display || lastMsg.content;
          // Wrap new content in a div to ensure proper block-level separation
          lastMsg.display = existingDisplay + `<div class="merged-content">${processedDisplay}</div>`;

          // Attempt to update DOM using Block Architecture (Non-destructive)
          const updated = this._updateMessageInDOM(lastMsg.id, processedDisplay);

          if (!updated) {
            // Fallback to render if element not found (rare)
            // Note: This fallback is destructive, but should only happen if the DOM disappeared
            this.#needsScroll = true;
            this.render({ parts: ['log'] });
          } else {
            this._scrollToBottom();
          }
          return;
        }
      }

      const msg = {
        role,
        content,
        // Wrap initial display in a content block for consistency
        display: `<div class="content-block text">${processedDisplay}</div>`,
        timestamp: new Date(),
        user: role === 'user' ? game.user : undefined,
        id: foundry.utils.randomID(),
        pending: false,
      };
      this.messages.push(msg);

      // Render the single message template and append to DOM
      const templatePath = 'modules/simulacrum/templates/simulacrum/message.hbs';
      const html = await renderTemplate(templatePath, msg);

      const chatScroll = this.element?.[0]?.querySelector('.chat-scroll') ||
        this.element?.querySelector?.('.chat-scroll');

      if (chatScroll) {
        const div = document.createElement('div');
        div.innerHTML = html;
        const messageEl = div.firstElementChild;
        const chatLog = chatScroll.querySelector('.chat-log');
        if (chatLog) {
          const processStatus = chatLog.querySelector(':scope > .process-status-message');
          if (processStatus) {
            chatLog.insertBefore(messageEl, processStatus);
          } else {
            chatLog.appendChild(messageEl);
          }
        }
        this._scrollToBottom();
      } else {
        this.#needsScroll = true;
        this.render({ parts: ['log'] });
      }
    });
  }

  /**
   * Update message content in DOM using Block Architecture
   * Appends new content as a block instead of replacing innerHTML
   * @param {string} messageId - ID of the message to update
   * @param {string} newContentChunk - The NEW chunk of content to append
   * @returns {boolean} True if updated, false if element not found
   */
  _updateMessageInDOM(messageId, newContentChunk) {
    if (!this.element) return false;

    const chatScroll = this.element[0]?.querySelector('.chat-scroll') ||
      this.element.querySelector?.('.chat-scroll');
    if (!chatScroll) return false;

    // Find the last assistant message (assumed target for streaming)
    const messages = chatScroll.querySelectorAll('.chat-message.simulacrum-role-assistant');
    if (messages.length === 0) return false;
    const msgEl = messages[messages.length - 1];

    const contentEl = msgEl.querySelector('.message-content');
    if (contentEl) {
      // BLOCK 1: Check if the last child is a text block
      const lastChild = contentEl.lastElementChild;
      const isTextBlock = lastChild && lastChild.classList.contains('content-block') && lastChild.classList.contains('text');

      if (isTextBlock) {
        // Safe to append to the existing text block's innerHTML? 
        // Yes, because processDisplay returns safe HTML and we are only modifying this specific block.
        // And we know this block is PURE text/html content, not a tool card.
        // However, user complained about inconsistency.
        // If we strictly *append*, we never overwrite.
        // But for *streaming text*, we usually want to append to the text node.

        // Use insertAdjacentHTML to append to the end of the text block
        lastChild.insertAdjacentHTML('beforeend', newContentChunk);
      } else {
        // Last child is NOT a text block (might be a tool card or nothing)
        // Create a NEW text block
        const newBlock = document.createElement('div');
        newBlock.className = 'content-block text';
        newBlock.innerHTML = newContentChunk;
        contentEl.appendChild(newBlock);
      }
      return true;
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
    this._messageQueue.add(async () => {
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
        wrapper.className = 'content-block tool-card pending-tool-inline'; // Block Architecture
        wrapper.dataset.toolCallId = toolCallId;
        wrapper.innerHTML = pendingHtml;
        lastAssistantContent.appendChild(wrapper);

        // Scroll to bottom
        this._scrollToBottom();
      }
    });
  }

  /**
   * Add a completed tool result card to the chat display
   * @param {Object} data - Tool result data
   */
  _addToolResultCard(data) {
    this._messageQueue.add(async () => {
      const { toolCallId, toolName, formattedDisplay, result, justification } = data;

      // Hidden tools check
      const hiddenTools = ['end_loop', 'manage_task'];
      if (hiddenTools.includes(toolName)) {
        return;
      }

      // Generate result HTML
      // PRIORITIZE formattedDisplay from Hook (which includes pre-rendered markdown)
      let html = formattedDisplay;
      if (!html) {
        // Fallback (e.g. if hook didn't send formattedDisplay for some reason)
        html = formatToolCallDisplay(result || { content: data.content }, toolName, null, justification);
      }

      // Append to last assistant message DOM
      const lastAssistantContent = this._getLastAssistantMessageContent();
      if (lastAssistantContent) {
        const wrapper = document.createElement('div');
        wrapper.className = 'content-block tool-card tool-result';
        wrapper.dataset.toolCallId = toolCallId; // Optional: track it
        wrapper.innerHTML = html;
        lastAssistantContent.appendChild(wrapper);
        this._scrollToBottom();

        // CRITICAL: Update the persistent state so re-renders don't wipe the card
        if (this.messages.length > 0) {
          const lastMsg = this.messages[this.messages.length - 1];
          if (lastMsg.role === 'assistant') {
            // Append the full block HTML to the display string
            lastMsg.display = (lastMsg.display || '') + wrapper.outerHTML;
          }
        }
      }
    });
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

    this._messageQueue.add(async () => {
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
    });
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
    this._updateTaskTracker(null, false);
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

    // Model selector event listeners
    this._attachModelSelectorListeners(element);
  }

  /**
   * Attach event listeners for the model selector combobox
   * @param {HTMLElement} element - The input part element
   */
  _attachModelSelectorListeners(element) {
    const wrapper = element.querySelector('.model-selector-wrapper');
    const modelInput = element.querySelector('.model-selector-input');
    const dropdown = element.querySelector('.model-dropdown');
    const hintEl = element.querySelector('.model-autocomplete-hint');

    if (!modelInput || !dropdown || !wrapper) return;

    // Input event - filter dropdown, update autocomplete hint, and trigger debounced save
    modelInput.addEventListener('input', () => {
      this._filterAndShowDropdown(modelInput, dropdown, hintEl);
      // Debounced save: save model selection 500ms after user stops typing
      this._debouncedSaveModel(modelInput.value);
    });

    // Context limit input events
    const limitInput = element.querySelector('.context-limit-input');
    if (limitInput) {
      // Debounced save on input (500ms)
      limitInput.addEventListener('input', () => {
        // Cancel existing timer
        if (this.#contextLimitDebounceTimer) {
          clearTimeout(this.#contextLimitDebounceTimer);
        }
        // Start new debounce timer
        this.#contextLimitDebounceTimer = setTimeout(() => {
          this._saveContextLimit(limitInput.value);
        }, 500);
      });

      // Auto-format on blur (e.g. 1000 -> 1k)
      limitInput.addEventListener('blur', () => {
        // Cancel any pending debounced save and save immediately
        if (this.#contextLimitDebounceTimer) {
          clearTimeout(this.#contextLimitDebounceTimer);
          this.#contextLimitDebounceTimer = null;
        }
        const parsed = this._parseContextLimit(limitInput.value);
        if (parsed) {
          limitInput.value = this._formatLimitValue(parsed);
          this._saveContextLimit(limitInput.value);
        }
      });
    }

    // Focus event - show dropdown
    modelInput.addEventListener('focus', async () => {
      await this._loadAvailableModels(); // Changed from ensureModelsLoaded
      this._filterAndShowDropdown(modelInput, dropdown, hintEl);
      wrapper.classList.add('dropdown-open');
    });

    // Blur event - save and close dropdown (with delay for click handling)
    modelInput.addEventListener('blur', () => {
      setTimeout(() => {
        this._closeDropdown(wrapper, dropdown, hintEl);
        this._saveModelSelection(modelInput.value);
      }, 150);
    });

    // Keydown event - handle Tab, Enter, Escape, Arrow keys
    modelInput.addEventListener('keydown', (e) => {
      const isOpen = !dropdown.classList.contains('hidden');

      if (e.key === 'Enter') {
        e.preventDefault();
        if (isOpen && this.#modelDropdownHighlightIndex >= 0) {
          const items = dropdown.querySelectorAll('li:not(.no-models)');
          const selected = items[this.#modelDropdownHighlightIndex];
          if (selected) {
            modelInput.value = selected.dataset.model;
          }
        }
        this._closeDropdown(wrapper, dropdown, hintEl);
        this._saveModelSelection(modelInput.value);
        modelInput.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this._closeDropdown(wrapper, dropdown, hintEl);
        modelInput.blur();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen) {
          this._filterAndShowDropdown(modelInput, dropdown, hintEl);
          wrapper.classList.add('dropdown-open');
        }
        this._navigateDropdown(dropdown, 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._navigateDropdown(dropdown, -1);
      }
    });

    // Click on dropdown item - save immediately (cancel any pending debounce)
    dropdown.addEventListener('mousedown', (e) => {
      const li = e.target.closest('li:not(.no-models)');
      if (li && li.dataset.model) {
        e.preventDefault();
        modelInput.value = li.dataset.model;
        this._closeDropdown(wrapper, dropdown, hintEl);
        // Cancel any pending debounced save and save immediately
        if (this.#modelSaveDebounceTimer) {
          clearTimeout(this.#modelSaveDebounceTimer);
          this.#modelSaveDebounceTimer = null;
        }
        this._saveModelSelection(li.dataset.model);
      }
    });

    // Initialize logic
    this._loadAvailableModels();
  }

  /**
   * Load available models from services
   */
  async _loadAvailableModels() {
    // If already loaded, return immediately
    if (this.#modelsLoaded) return;

    // If already loading, wait for existing promise
    if (this.#loadingModelPromise) {
      await this.#loadingModelPromise;
      return;
    }

    const wrapper = this.element.querySelector('.model-selector-wrapper');
    if (wrapper) wrapper.classList.add('loading');

    // Create shared promise
    this.#loadingModelPromise = (async () => {
      try {
        const [models] = await Promise.all([
          modelService.fetchModels(),
          modelService.fetchOpenRouterModels()
        ]);
        this.#availableModels = models;
        this.#modelsLoaded = true;
      } catch (error) {
        this.logger.warn('Failed to load models:', error);
      }
    })();

    try {
      await this.#loadingModelPromise;
    } finally {
      this.#loadingModelPromise = null;
      if (wrapper) wrapper.classList.remove('loading');
    }
  }



  /**
   * Parse numeric limit from string (e.g. "1k" -> 1000)
   * @param {string} value 
   * @returns {number|null}
   */
  _parseContextLimit(value) {
    if (!value) return null;
    value = value.toString().trim().toLowerCase();

    let multiplier = 1;
    if (value.endsWith('k')) {
      multiplier = 1000;
      value = value.slice(0, -1);
    } else if (value.endsWith('m')) {
      multiplier = 1000000;
      value = value.slice(0, -1);
    }

    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) return null;

    return Math.round(num * multiplier);
  }

  /**
   * Save context limit to settings
   * @param {string} value - The input string (e.g. "128k")
   */
  async _saveContextLimit(value) {
    const limit = this._parseContextLimit(value);
    if (limit) {
      // Update fallback setting
      await game.settings.set('simulacrum', 'fallbackContextLimit', limit);
      this.logger.info(`Context limit updated to: ${limit}`);
    }
  }

  /**
   * Filter dropdown based on input and show matching models
   * @param {HTMLInputElement} input - The model input element
   * @param {HTMLUListElement} dropdown - The dropdown element
   * @param {HTMLElement} hintEl - The autocomplete hint element
   */
  _filterAndShowDropdown(input, dropdown, hintEl) {
    const query = input.value.toLowerCase();
    const currentModel = game.settings.get('simulacrum', 'model');

    // Filter models
    const filtered = query
      ? this.#availableModels.filter(m => m.toLowerCase().includes(query))
      : this.#availableModels;

    // Build dropdown HTML with context limit suffix
    if (filtered.length === 0) {
      dropdown.innerHTML = '<li class="no-models">No models found</li>';
    } else {
      dropdown.innerHTML = filtered.map(model => {
        const isSelected = model === currentModel;
        const displayName = this._formatModelDisplayName(model);
        return `<li data-model="${model}" class="${isSelected ? 'selected' : ''}" title="${displayName}">${displayName}</li>`;
      }).join('');
    }

    // Show dropdown
    dropdown.classList.remove('hidden');
    this.#modelDropdownHighlightIndex = -1;

    // Update autocomplete hint

  }

  /**
   * Format model name with context limit suffix
   * @param {string} modelId - The model ID
   * @returns {string} Display name with context limit (e.g., "gpt-4 (128k)")
   */
  _formatModelDisplayName(modelId) {
    const { limit, source } = modelService.getContextLimit(modelId);

    // Show suffix for derived or openrouter sources (not fallback)
    if ((source === 'derived' || source === 'openrouter') && limit > 0) {
      const suffix = this._formatLimitValue(limit);
      return `${modelId} (${suffix})`;
    }

    return modelId;
  }




  /**
   * Navigate dropdown with arrow keys
   * @param {HTMLUListElement} dropdown - The dropdown element
   * @param {number} direction - 1 for down, -1 for up
   */
  _navigateDropdown(dropdown, direction) {
    const items = dropdown.querySelectorAll('li:not(.no-models)');
    if (items.length === 0) return;

    // Remove current highlight
    items.forEach(li => li.classList.remove('highlighted'));

    // Calculate new index
    this.#modelDropdownHighlightIndex += direction;
    if (this.#modelDropdownHighlightIndex < 0) {
      this.#modelDropdownHighlightIndex = items.length - 1;
    } else if (this.#modelDropdownHighlightIndex >= items.length) {
      this.#modelDropdownHighlightIndex = 0;
    }

    // Apply highlight
    const highlighted = items[this.#modelDropdownHighlightIndex];
    if (highlighted) {
      highlighted.classList.add('highlighted');
      highlighted.scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Close the dropdown
   * @param {HTMLElement} wrapper - The wrapper element
   * @param {HTMLUListElement} dropdown - The dropdown element
   * @param {HTMLElement} hintEl - The autocomplete hint element
   */
  _closeDropdown(wrapper, dropdown, hintEl) {
    dropdown.classList.add('hidden');
    wrapper.classList.remove('dropdown-open');
    if (hintEl) hintEl.textContent = '';
    this.#modelDropdownHighlightIndex = -1;
  }


}
