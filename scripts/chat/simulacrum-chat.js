import { ChatModal } from "../fimlib/components/chat-modal.js";
import { SimulacrumAIService } from "./ai-service.js";

/**
 * Extended ChatModal class for Simulacrum AI integration
 */
export class SimulacrumChatModal extends ChatModal {
    constructor(options = {}) {
        super(options);
        this.aiService = null;
        this.isProcessing = false;
        this.abortController = null;
        this.messages = [];
        this.contextDocuments = []; // New: Array to store documents added to context
    }

    /**
     * Adds a FoundryVTT document to the Simulacrum context.
     * @param {Document} document The FoundryVTT document to add.
     */
    addDocumentContext(document) {
        if (!document || !(document instanceof Document)) {
            console.error("Simulacrum | Invalid document provided for context.", document);
            ui.notifications.error("Simulacrum | Failed to add document to context: Invalid document.");
            return;
        }

        // Prevent adding duplicates
        if (this.contextDocuments.some(d => d.uuid === document.uuid)) {
            ui.notifications.warn(`Simulacrum | ${document.name} is already in context.`);
            return;
        }

        this.contextDocuments.push(document);
        console.log(`Simulacrum | Added document to context: ${document.name} (${document.uuid})`, this.contextDocuments);
        // Future: Potentially send this to the AI service for context management
    }

    static get defaultOptions() {
        const options = super.defaultOptions;
        options.template = "modules/simulacrum/templates/chat-modal.html";
        options.title = "Simulacrum - Campaign Assistant";
        options.width = 600;
        options.height = 500;
        options.resizable = true;
        options.classes = ['simulacrum-chat-modal'];
        return options;
    }

    getData() {
        return {
            ...super.getData(),
            messages: this.messages,
            isProcessing: this.isProcessing,
            placeholder: this.isProcessing ? "Processing..." : "Type your message..."
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // Override send button functionality
        html.find('.chat-send').off('click').on('click', this._onSendOrCancel.bind(this));
        
        // Handle Enter key in textarea
        html.find('.chat-input textarea').on('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                this._onSendOrCancel();
            }
        });

        // Auto-resize textarea
        html.find('.chat-input textarea').on('input', function() {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
        });
    }

    async _onSendOrCancel() {
        if (this.isProcessing) {
            // Cancel current operation
            this._cancelRequest();
        } else {
            // Send new message
            await this._sendMessage();
        }
    }

    async _sendMessage() {
        const textarea = this.element.find('.chat-input textarea');
        const message = textarea.val().trim();
        
        if (!message || this.isProcessing) return;

        // Add user message to display
        this._addMessage('user', message);
        textarea.val('');

        // Update UI state
        this.isProcessing = true;
        this._updateSendButton();
        
        // Create abort controller
        this.abortController = new AbortController();

        try {
            // Initialize AI service if needed
            if (!this.aiService) {
                this.aiService = new SimulacrumAIService(game.simulacrum.toolRegistry);
            }

            // Add assistant message placeholder
            const assistantMessageId = this._addMessage('assistant', '');

            // Send to AI service
            await this.aiService.sendMessage(
                message,
                (chunk, type) => this._onStreamChunk(chunk, type, assistantMessageId),
                (message, functionCalls) => this._onStreamComplete(message, functionCalls),
                this.abortController.signal
            );

        } catch (error) {
            console.error('Error sending message:', error);
            this._addMessage('assistant', `Error: ${error.message}`);
        } finally {
            this.isProcessing = false;
            this._updateSendButton();
            this.abortController = null;
        }
    }

    _cancelRequest() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        
        this.isProcessing = false;
        this._updateSendButton();
        
        // Add cancellation message
        this._addMessage('system', 'Request cancelled by user.');
    }

    _updateSendButton() {
        const sendButton = this.element.find('.chat-send');
        if (this.isProcessing) {
            sendButton.html('<i class="fas fa-stop"></i>').attr('title', 'Cancel');
        } else {
            sendButton.html('<i class="fas fa-paper-plane"></i>').attr('title', 'Send');
        }
    }

    _onStreamChunk(chunk, type, messageId) {
        const messageElement = this.element.find(`[data-message-id="${messageId}"]`);
        
        if (type === 'text') {
            // Append text chunk to message content
            const contentElement = messageElement.find('.message-content');
            if (contentElement.length === 0) {
                messageElement.append('<div class="message-content"></div>');
            }
            contentElement.append(chunk);
            this._scrollToBottom();
        } else if (type === 'tool_result') {
            // Display tool execution result
            this._displayToolResult(chunk, messageElement);
        } else if (type === 'error') {
            // Display error message
            messageElement.find('.message-content').append(`<div class="error">${chunk}</div>`);
        }
    }

    _onStreamComplete(message, functionCalls) {
        console.log('Stream complete:', { message, functionCalls });
        // Handle any final processing
    }

    _addMessage(role, content) {
        const messageId = foundry.utils.randomID();
        const timestamp = new Date().toLocaleTimeString();
        
        const message = {
            _id: messageId,
            role: role,
            content: content,
            timestamp: timestamp,
            sender: role === 'user' ? game.user.name : 'Simulacrum',
            cssClass: `message-${role}`
        };

        this.messages.push(message);

        // Add to DOM if modal is rendered
        if (this.rendered) {
            const messageHtml = this._renderMessage(message);
            this.element.find('.message-list').append(messageHtml);
            this._scrollToBottom();
        }

        return messageId;
    }

    _renderMessage(message) {
        return `
            <div class="chat-message message ${message.cssClass}" data-message-id="${message._id}">
                <header class="message-header">
                    <h4 class="message-sender">
                        <span class="name-stacked">
                            <span class="title">${message.sender}</span>
                        </span>
                    </h4>
                    <span class="message-metadata">
                        <span class="message-timestamp">${message.timestamp}</span>
                    </span>
                </header>
                <div class="message-content">${message.content}</div>
            </div>
        `;
    }

    _displayToolResult(result, messageElement) {
        let resultHtml = '<div class="tool-result">';
        if (result.success) {
            resultHtml += `<div class="tool-success">✓ Tool executed successfully</div>`;
            if (result.data) {
                resultHtml += `<pre>${JSON.stringify(result.data, null, 2)}</pre>`;
            }
        } else {
            resultHtml += `<div class="tool-error">✗ Tool execution failed: ${result.error}</div>`;
        }
        resultHtml += '</div>';
        
        messageElement.find('.message-content').append(resultHtml);
        this._scrollToBottom();
    }

    _scrollToBottom() {
        const messageContainer = this.element.find('.message-list');
        if (messageContainer.length) {
            messageContainer.scrollTop(messageContainer[0].scrollHeight);
        }
    }

    clearHistory() {
        this.messages = [];
        if (this.aiService) {
            this.aiService.clearHistory();
        }
        
        // Clear DOM
        if (this.rendered) {
            this.element.find('.message-list').empty();
        }
    }
}