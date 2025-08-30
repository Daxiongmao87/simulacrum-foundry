/**
 * ChatModal Component - A compact instant messaging interface for FoundryVTT
 * @module ChatModal
 */

import { MarkdownParser } from '../core/markdown-parser.js';

export class ChatModal extends FormApplication {
  /**
   * Data store for messages and tabs
   * @type {Object}
   * @property {Array} messages - Array of message objects containing content, sender, and timestamp
   * @property {Array} tabs - Array of tab objects containing tab name and message history
   */
  static data = {
    title: 'Chat',
    messages: [],
    tabs: [],
    placeholder: 'Type a message...',
    sendIcon: 'fas fa-paper-plane',
  };

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'foundry-im-chat-modal',
      template: 'modules/simulacrum/templates/chat-modal.html',
      title: 'Chat',
      width: 300,
      height: 400,
      minimizable: true,
      resizable: true,
      popOut: true,
      classes: ['foundry-im', 'chat-modal'],
      editorClasses: ['chat-message'],
      dragDrop: [{ dragSelector: '.window-header' }],
      showAvatars: true,
      showCornerText: true,
    });
  }

  /**
   * Create a new ChatModal instance
   * @param {Object} options - Configuration options for the chat modal
   */
  constructor(options = {}) {
    super(options);
    this.options = foundry.utils.mergeObject(this.options, options);
  }

  getData(options = {}) {
    const processedMessages = ChatModal.data.messages.map((msg) => {
      return {
        ...msg,
        isCurrentUser: msg.sender === game.user.name,
        cssClass: msg.sender === game.user.name ? 'current-user' : 'other-user',
      };
    });

    return {
      data: {
        ...ChatModal.data,
        messages: processedMessages,
      },
      showAvatars: this.options.showAvatars,
      showCornerText: this.options.showCornerText,
    };
  }

  /**
   * Set up event listeners and initialize UI elements
   * @param {jQuery} html - The rendered HTML content
   */
  activateListeners(html) {
    super.activateListeners(html);

    const textarea = html.find('textarea.chat-input');
    const parentDiv = textarea.parent();
    const messageContainer = html.find('.chat-messages.message-list');

    html.find('.chat-send').click(() => this._onSendMessage(html));

    textarea.on('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._onSendMessage(html);
      }
    });

    textarea.on('input', (e) => this._handleTextareaResize(e.currentTarget));
    this._handleTextareaResize(textarea[0]);

    textarea.on('focus', () => parentDiv.addClass('focused'));
    textarea.on('blur', () => parentDiv.removeClass('focused'));

    // Immediately scroll to bottom
    if (messageContainer.length) {
      messageContainer[0].scrollTop = messageContainer[0].scrollHeight;
    }

    // Always update gradients when scrolling
    messageContainer.on('scroll', (e) =>
      this._updateMessageListGradients(e.currentTarget)
    );

    // Also update the gradients immediately, and after a short delay to catch rendering
    if (messageContainer.length) {
      this._updateMessageListGradients(messageContainer[0]);
      setTimeout(
        () => this._updateMessageListGradients(messageContainer[0]),
        100
      );
    }
  }

  /**
   * Handle sending a message
   * @private
   */
  _onSendMessage(html) {
    const input = html.find('textarea.chat-input');
    const rawMessage = input.val().trim();

    if (rawMessage) {
      // Use the MarkdownParser to parse the message content
      // If user is typing plain text, it will be wrapped in paragraphs
      // If user is typing markdown, it will be converted to HTML
      const formattedContent = MarkdownParser.parse(rawMessage);

      ChatModal.data.messages.push({
        _id: foundry.utils.randomID(),
        content: formattedContent,
        sender: game.user.name,
        timestamp: new Date().toISOString(),
        img: game.user.avatar || 'icons/svg/mystery-man.svg',
        subtitle: '',
      });

      input.val('');
      this.render();

      setTimeout(() => {
        const textarea = this.element.find('textarea.chat-input');
        if (textarea.length) {
          textarea[0].focus();
          if (textarea[0].value.length) {
            textarea[0].selectionStart = textarea[0].selectionEnd =
              textarea[0].value.length;
          }
        }
      }, 0);
    }
  }

  /**
   * Update gradient indicators based on textarea scroll position
   * @private
   * @param {HTMLTextAreaElement} textarea - The textarea element
   */
  _updateGradientIndicators(textarea) {
    const container = textarea.closest('.chat-input.editor.flexrow');
    const hasOverflow = textarea.scrollHeight > textarea.clientHeight;
    const maxOpacity = 0.8;

    if (!hasOverflow) {
      container.style.setProperty('--top-gradient-opacity', '0');
      container.style.setProperty('--bottom-gradient-opacity', '0');
      return;
    }

    const contentHiddenAbove = textarea.scrollTop;
    const contentHiddenBelow =
      textarea.scrollHeight - textarea.clientHeight - textarea.scrollTop;
    const threshold = 1;
    const maxDistance = 20;

    const topOpacity =
      contentHiddenAbove <= threshold
        ? 0
        : Math.min(contentHiddenAbove / maxDistance, 1) * maxOpacity;

    const bottomOpacity =
      contentHiddenBelow <= threshold
        ? 0
        : Math.min(contentHiddenBelow / maxDistance, 1) * maxOpacity;

    container.style.setProperty('--top-gradient-opacity', topOpacity);
    container.style.setProperty('--bottom-gradient-opacity', bottomOpacity);

    if (!textarea._hasScrollListener) {
      const boundMethod = this._updateGradientIndicators.bind(this);
      textarea.addEventListener('scroll', function () {
        boundMethod(textarea);
      });
      textarea._hasScrollListener = true;
    }
  }

  /**
   * Handle textarea auto-resize
   * @private
   * @param {HTMLTextAreaElement} textarea - The textarea element
   */
  _handleTextareaResize(textarea) {
    const scrollPos = textarea.scrollTop;
    const style = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(style.lineHeight);
    const paddingTop = parseFloat(style.paddingTop);
    const paddingBottom = parseFloat(style.paddingBottom);

    textarea.style.height = 'auto';

    const newlines = (textarea.value.match(/\n/g) || []).length;
    const wrappedLines =
      Math.floor(textarea.scrollHeight / lineHeight) - newlines;
    const totalLines = newlines + wrappedLines;

    if (totalLines === 1) {
      textarea.style.removeProperty('height');
      textarea.style.overflowY = 'hidden';
      return;
    }

    const newHeight =
      Math.ceil(
        Math.min(
          totalLines * lineHeight + paddingTop + paddingBottom,
          3 * lineHeight + paddingTop + paddingBottom
        )
      ) + 1;

    textarea.style.height = `${newHeight}px`;
    textarea.scrollTop = scrollPos;
    this._updateGradientIndicators(textarea);
  }

  /**
   * Close the chat modal
   * @param {Object} options - The close options
   * @returns {Promise} - A promise which resolves once the application is closed
   */
  close(options = {}) {
    // Clean up the observer when closing
    if (this._messageObserver) {
      this._messageObserver.disconnect();
      this._messageObserver = null;
    }

    // Remove the resize listener when closing
    if (this._boundUpdateGradients) {
      $(window).off('resize.chatModal', this._boundUpdateGradients);
    }

    return super.close(options);
  }

  /**
   * Add a message to the chat display
   * @param {Object} message - The message to add
   * @param {string} message.content - The message content
   * @param {string} message.sender - The sender's name
   * @param {boolean} [render=true] - Whether to re-render the chat window
   * @returns {jQuery|null} - The newly added message element or null
   */
  addMessage(message, render = true) {
    // Process markdown if enabled and content is not already HTML
    if (message.content) {
      // Use the MarkdownParser to convert markdown to HTML
      message.content = MarkdownParser.parse(message.content);
    }

    const formattedMessage = {
      _id: message._id || foundry.utils.randomID(),
      content: message.content,
      sender: message.sender,
      cornerText: message.cornerText || '',
      isCurrentUser: message.sender === game.user.name,
      img:
        message.img ||
        (message.sender === game.user.name
          ? game.user.avatar
          : 'icons/svg/mystery-man.svg'),
      subtitle: message.subtitle || '',
    };

    // Add to data store
    ChatModal.data.messages.push(formattedMessage);

    // Try to append directly to the DOM if possible to avoid full re-render
    if (render && this.element && this.element.length) {
      const messageList = this.element.find('.chat-messages.message-list');

      if (messageList.length) {
        // Create the message HTML
        const cssClass = formattedMessage.isCurrentUser
          ? 'current-user'
          : 'other-user';
        const avatarHTML =
          this.options.showAvatars && formattedMessage.img
            ? `<a class="avatar"><img src="${formattedMessage.img}" alt="${formattedMessage.sender}"></a>`
            : '';

        const cornerText =
          this.options.showCornerText && formattedMessage.cornerText
            ? `<span class="message-corner-text">${formattedMessage.cornerText}</span>`
            : '';

        const copyButton = !formattedMessage.isCurrentUser
          ? `<button class="message-copy-btn" title="Copy message"><i class="fas fa-copy"></i></button>`
          : '';

        const subtitle = formattedMessage.subtitle
          ? `<span class="subtitle">${formattedMessage.subtitle}</span>`
          : '';

        // Build the message element
        const messageHTML = `
          <div class="chat-message message flexcol ${cssClass}" data-message-id="${formattedMessage._id}">
            <header class="message-header flexrow">
              <h4 class="message-sender">
                ${avatarHTML}
                <span class="name-stacked">
                  <span class="title">${formattedMessage.sender}</span>
                  ${subtitle}
                </span>
              </h4>
              <span class="message-metadata">
                ${cornerText}
                ${copyButton}
              </span>
            </header>
            <div class="message-content">
              ${formattedMessage.content}
            </div>
          </div>
        `;

        // Append directly to the message list
        const newMessageElem = $(messageHTML);
        messageList.append(newMessageElem);

        // Scroll to bottom
        if (messageList[0]) {
          messageList[0].scrollTop = messageList[0].scrollHeight;
          this._updateMessageListGradients(messageList[0]);
        }

        return newMessageElem;
      } else {
        // If we can't find the message list, do a full render
        this.render();
        return null;
      }
    } else if (render) {
      // If no DOM element yet, do a full render
      this.render();
      return null;
    }

    return null;
  }

  /**
   * Override the render method to properly handle post-render operations
   * @override
   */
  async render(force = false, options = {}) {
    const result = await super.render(force, options);

    // Setup a MutationObserver to detect when messages are actually in the DOM
    if (this.element && !this._messageObserver) {
      const messageContainer = this.element.find(
        '.chat-messages.message-list'
      )[0];
      if (messageContainer) {
        // Create an observer to watch for changes to the message list
        this._messageObserver = new MutationObserver((mutations) => {
          // Scroll to bottom and apply gradients when messages change
          this._scrollToBottom(messageContainer);
          this._updateMessageListGradients(messageContainer);
        });

        // Start observing the message container for changes
        this._messageObserver.observe(messageContainer, {
          childList: true,
          subtree: true,
        });

        // Initial scroll to bottom
        this._scrollToBottom(messageContainer);
      }
    } else if (this.element) {
      // If we already have an observer but are re-rendering
      const messageContainer = this.element.find(
        '.chat-messages.message-list'
      )[0];
      if (messageContainer) {
        // Manually trigger scroll to bottom
        this._scrollToBottom(messageContainer);
      }
    }

    return result;
  }

  /**
   * Helper method to scroll a container to the bottom
   * @private
   * @param {HTMLElement} container - The container to scroll
   */
  _scrollToBottom(container) {
    if (!container) {
      return;
    }

    // Use RAF to ensure we're in the next paint cycle when heights should be accurate
    requestAnimationFrame(() => {
      // Set scroll position to bottom
      container.scrollTop = container.scrollHeight;
      // Force gradient update
      this._updateMessageListGradients(container);

      // Double-check after a short delay to ensure content has fully rendered
      setTimeout(() => {
        if (container && document.body.contains(container)) {
          container.scrollTop = container.scrollHeight;
          this._updateMessageListGradients(container);
        }
      }, 50);
    });
  }

  /**
   * Schedule multiple gradient updates to ensure they're applied correctly
   * @private
   * @param {HTMLElement} container - The message container
   */
  _scheduleGradientUpdates(container) {
    // Check right away
    this._updateMessageListGradients(container);

    // Check several times over a period to ensure rendering completes
    // These intervals cover different phases of DOM rendering
    const checkTimes = [50, 100, 250, 500, 1000];

    checkTimes.forEach((time) => {
      setTimeout(() => {
        if (this.element && document.body.contains(container)) {
          // Ensure scroll position is maintained at bottom
          container.scrollTop = container.scrollHeight;
          // Apply gradient with current dimensions
          this._updateMessageListGradients(container);

          // Force a style recalculation to help with rendering
          void container.offsetHeight;
        }
      }, time);
    });
  }

  /**
   * Update gradient indicators for the message list based on scroll position
   * @private
   * @param {HTMLElement} container - The message list container
   */
  _updateMessageListGradients(container) {
    if (!container) {
      return;
    }

    const parentContainer = container.closest(
      '.foundry-im.chat-messages-container'
    );
    if (!parentContainer) {
      return;
    }

    // Force style recalculation to get accurate dimensions
    void container.offsetHeight;

    // Calculate if content actually overflows
    const hasOverflow =
      Math.ceil(container.scrollHeight) > Math.floor(container.clientHeight);
    const maxOpacity = 0.8;

    if (!hasOverflow) {
      parentContainer.style.setProperty('--msg-top-gradient-opacity', '0');
      parentContainer.style.setProperty('--msg-bottom-gradient-opacity', '0');
      return;
    }

    const contentHiddenAbove = container.scrollTop;
    const contentHiddenBelow =
      container.scrollHeight - container.clientHeight - container.scrollTop;
    const threshold = 1;
    const maxDistance = 20;

    const topOpacity =
      contentHiddenAbove <= threshold
        ? 0
        : Math.min(contentHiddenAbove / maxDistance, 1) * maxOpacity;

    const bottomOpacity =
      contentHiddenBelow <= threshold
        ? 0
        : Math.min(contentHiddenBelow / maxDistance, 1) * maxOpacity;

    parentContainer.style.setProperty('--msg-top-gradient-opacity', topOpacity);
    parentContainer.style.setProperty(
      '--msg-bottom-gradient-opacity',
      bottomOpacity
    );

    // Debug info - uncomment if needed for troubleshooting
    // console.log(`Gradient update: hasOverflow=${hasOverflow}, scrollHeight=${container.scrollHeight}, clientHeight=${container.clientHeight}, topOpacity=${topOpacity}, bottomOpacity=${bottomOpacity}`);
  }

  /**
   * Fix for CSS issue with the window-resizable-handle
   */
  _updateCSS() {
    // Fix the CSS issue with the resize handle if it exists
    const resizeHandle = document.querySelector(
      '#foundry-im-chat-modal .window-resizable-handle'
    );
    if (resizeHandle) {
      resizeHandle.style.color = 'var(--color-text-dark)';
      resizeHandle.style.overflow = 'hidden';
    }
  }

  /**
   * This runs when the application is rendered
   * @override
   */
  _renderInner(data) {
    const html = super._renderInner(data);

    // Add a hook to run immediately after rendering completes
    Hooks.once('renderChatModal', (app, html) => {
      const messageContainer = html.find('.chat-messages.message-list');
      if (messageContainer.length) {
        messageContainer[0].scrollTop = messageContainer[0].scrollHeight;
        this._updateMessageListGradients(messageContainer[0]);
        this._updateCSS();
      }
    });

    return html;
  }
}

globalThis.ChatModal = ChatModal;
