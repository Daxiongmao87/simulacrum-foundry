import { ChatModal, MarkdownParser } from "../fimlib/main.js";
import { SimulacrumAIService } from "./ai-service.js";
import { AgenticLoopController } from "../core/agentic-loop-controller.js";
import { getChatModalClass } from "../main.js";


/**
 * SimulacrumChatModal - Uses FIMLib's ChatModal through composition for AI chat interface
 * Based on the proven divination-foundry pattern
 */
export class SimulacrumChatModal {
    /**
     * The currently active chat instances
     * @type {Map<string, SimulacrumChatModal>}
     */
    static instances = new Map();

    constructor(options = {}) {
        this.options = foundry.utils.mergeObject({
            title: "Simulacrum - Campaign Assistant",
            width: 600,
            height: 500,
            history: [],
            id: null
        }, options);

        this.history = this.options.history;
        this.id = this.options.id || foundry.utils.randomID();
        this.processing = false;
        this.abortController = null;

        // Context documents array
        this.contextDocuments = [];
        
        // Placeholder message management
        this.currentPlaceholderId = null;

        // Get the appropriate ChatModal class (the extended version with correct template)
        const ModalClass = getChatModalClass();
        
        // Initialize the chat window using our custom modal class
        this.chatWindow = new ModalClass({
            title: this.options.title,
            width: this.options.width,
            height: this.options.height,
            showAvatars: true,
            showCornerText: true
        });

        // Listen for YOLO mode changes to update UI
        Hooks.on('updateSetting', (setting) => {
            if (setting.key === 'simulacrum.yoloMode') {
                this._updateYoloIndicator();
            }
        });

        // Initialize AI service
        this.aiService = null;

        // Display welcome message
        this._displayWelcomeMessage();

        // Register this instance
        SimulacrumChatModal.instances.set(this.id, this);

        // Override the chat window's _onSendMessage method to intercept messages
        const originalSendMethod = this.chatWindow._onSendMessage;
        this.chatWindow._onSendMessage = (html) => {
            // If currently processing, this should cancel instead of send
            if (this.processing) {
                this._cancelCurrentOperation();
                this._addCancelMessage();
                return;
            }
            
            const input = html.find('textarea.chat-input');
            const message = input.val().trim();
            
            if (message) {
                input.val('');
                this._handleUserMessage(message);
            }
        };
    }

    /**
     * Get a formatted timestamp string for the current time
     * @returns {string} - Formatted timestamp
     * @private
     */
    _getTimestamp() {
        const now = new Date();
        return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    /**
     * Open a new chat window or bring an existing one to focus
     * @param {Object} options - Options to pass to the SimulacrumChatModal constructor
     * @returns {SimulacrumChatModal} - The chat instance
     */
    static openChat(options = {}) {
        // Check permission first - require GM level access
        if (game.user.role < CONST.USER_ROLES.GAMEMASTER) {
            ui.notifications.error("You don't have permission to use Simulacrum.");
            return null;
        }

        const id = options.id || 'default';

        // If we have an existing chat instance with this id
        if (SimulacrumChatModal.instances.has(id)) {
            const chat = SimulacrumChatModal.instances.get(id);
            
            // If the window is open, just focus it
            if (chat.chatWindow?.element?.is(":visible")) {
                chat.chatWindow.bringToTop();
                return chat;
            } else {
                // Window exists but is closed - rerender to preserve history
                chat.render(true);
                return chat;
            }
        }

        // Create a new chat with either the provided id or 'default'
        const chat = new SimulacrumChatModal({...options, id});
        chat.render(true);
        return chat;
    }

    /**
     * Render the chat window
     * @param {boolean} [force=false] - Whether to force re-rendering
     */
    render(force = false) {
        this.chatWindow.render(true, {
            focus: true,
            height: this.options.height,
            width: this.options.width
        });
        
        // Re-setup context container after re-render
        this._setupContextContainerUI();
        
        // Re-setup copy buttons after re-render
        this._setupCopyButtons();
    }

    /**
     * Close the chat window and clean up
     */
    close() {
        this._cancelCurrentOperation();

        // Close the window but don't delete from instances (allows reopening)
        if (this.chatWindow) {
            this.chatWindow.close();
        }
    }

    /**
     * Cancel any current AI operation
     * @private
     */
    _cancelCurrentOperation() {
        if (this.abortController) {
            console.log('Simulacrum | Cancelling current AI operation');
            this.abortController.abort();
            this.abortController = null;
        }
        
        this.processing = false;
    }

    /**
     * Add a cancellation message to the chat
     * @private
     */
    _addCancelMessage() {
        this.chatWindow.addMessage({
            content: '<p class="simulacrum-system"><i>Request cancelled by user</i></p>',
            sender: 'System',
            cornerText: this._getTimestamp(),
            img: "icons/svg/clockwork.svg"
        });
    }

    /**
     * Set up the context items container between conversation and input
     * @private
     */
    _setupContextContainerUI() {
        setTimeout(() => {
            let contextContainer = $(this.chatWindow.element).find('.auxiliary-content-container');
            if (!contextContainer.length) {
                // Find the main chat content area
                const chatContent = $(this.chatWindow.element).find('.chat-content');
                // Find the input container
                const inputContainer = chatContent.find('.chat-input-container');

                // Create the auxiliary container
                contextContainer = $('<div class="auxiliary-content-container"><div class="simulacrum-context-items"></div></div>');
                
                // Insert it before the input container
                inputContainer.before(contextContainer);
            }
            this._updateContextItemsUI();
        }, 100);
    }

    /**
     * Update the context items in the UI
     * @private
     */
    _updateContextItemsUI() {
        const contextItemsContainer = $(this.chatWindow.element).find('.auxiliary-content-container .simulacrum-context-items');
        if (!contextItemsContainer.length) return; 
        
        // Clear existing items
        contextItemsContainer.empty();
        
        // If there are no items, hide the container
        const auxiliaryContainer = $(this.chatWindow.element).find('.auxiliary-content-container');
        if (this.contextDocuments.length === 0) {
            auxiliaryContainer.hide();
            return;
        }
        
        // Show the container
        auxiliaryContainer.show();
        
        // Add each context item
        this.contextDocuments.forEach(doc => {
            let icon, label;
            // Determine icon and label based on document type
            if (doc.documentName === 'JournalEntry') {
                icon = 'fa-book';
                label = `Journal: ${doc.name}`;
            } else if (doc.documentName === 'Scene') {
                icon = 'fa-map';
                label = `Scene: ${doc.name}`;
            } else if (doc.documentName === 'Actor') {
                icon = 'fa-user';
                label = `Actor: ${doc.name}`;
            } else if (doc.documentName === 'Item') {
                icon = 'fa-suitcase';
                label = `Item: ${doc.name}`;
            } else {
                icon = 'fa-file-alt';
                label = doc.name || 'Context';
            }
            
            // Create the context item element
            const contextItem = $(`
                <div class="simulacrum-context-item" data-uuid="${doc.uuid}">
                  <i class="fas ${icon} simulacrum-context-item-icon"></i>
                  <span class="simulacrum-context-item-label">${label}</span>
                  <i class="fas fa-times simulacrum-context-item-remove"></i>
                </div>
            `);
            
            // Add click handler for the remove button
            contextItem.find('.simulacrum-context-item-remove').click(ev => {
                ev.preventDefault();
                ev.stopPropagation();
                this.removeDocumentContext(doc.uuid);
            });
            
            // Add the item to the container
            contextItemsContainer.append(contextItem);
        });
    }

    /**
     * Remove a context document from the chat
     * @param {string} uuid - The UUID of the document to remove
     */
    removeDocumentContext(uuid) {
        const initialLength = this.contextDocuments.length;
        this.contextDocuments = this.contextDocuments.filter(doc => doc.uuid !== uuid);
        
        if (this.contextDocuments.length < initialLength) {
            this._updateContextItemsUI();
            ui.notifications.info("Removed context document");
        }
    }

    /**
     * Display a welcome message in the chat
     * @private
     */
    _displayWelcomeMessage() {
        // Create greeting message
        const greetingMessage = `Greetings! I am Simulacrum, your AI-powered campaign assistant. I can help you manage your FoundryVTT documents, answer questions about your campaign, and assist with game preparation.`;
        
        // Add to visual chat only if the history is empty
        if (this.history.length === 0) {
            this.chatWindow.addMessage({
                content: `<p>${greetingMessage}</p>`,
                sender: 'Simulacrum',
                cornerText: this._getTimestamp(),
                img: "modules/simulacrum/assets/simulacrum-avatar.png"
            });
            
            // Add to conversation history for API context
            this.history.push({
                role: 'assistant',
                content: greetingMessage
            });
        }
        
        // Set up copy button for the welcome message
        this._setupCopyButtons();
    }

    /**
     * Set up copy buttons for assistant messages
     * This adds a copy button to each assistant message
     * @private
     */
    _setupCopyButtons() {
        // Wait a short time for DOM to update
        setTimeout(() => {
            // Find all assistant messages in this chat window
            const assistantMessages = $(this.chatWindow.element)
                .find('.chat-message')
                .filter(function() {
                    // Find messages where sender is Simulacrum
                    return $(this).find('.message-sender .title').text() === 'Simulacrum';
                });
            
            // Process each message to add copy button if not already present
            assistantMessages.each((i, message) => {
                const $message = $(message);
                const messageId = $message.data('message-id');
                
                // Skip if this message already has a copy button
                if ($message.find('.simulacrum-copy-btn').length) return;
                
                // Create a copy button
                const copyButton = $(
                    `<button class="simulacrum-copy-btn" title="Copy response to clipboard" data-message-id="${messageId}">
                      <i class="fas fa-copy"></i>
                    </button>`
                );
                
                // Create tooltip element
                const tooltip = $(
                    `<div class="simulacrum-copy-tooltip">Copied!</div>`
                );
                
                // Add the button to the message header's metadata section
                const metadataSection = $message.find('.message-metadata');
                metadataSection.append(copyButton);
                metadataSection.css('position', 'relative').append(tooltip);
                
                // Add click handler to copy message content
                copyButton.on('click', async (event) => {
                    // Get the message content (excluding any potential reasoning section)
                    let contentEl = $message.find('.message-content');
                    
                    // If there's a simulacrum-response section, prefer that
                    const responseSection = contentEl.find('.simulacrum-response');
                    if (responseSection.length) {
                        contentEl = responseSection;
                    }
                    
                    try {
                        await this._copyMessageContent(contentEl[0], tooltip, copyButton);
                    } catch (err) {
                        console.error('Simulacrum | Failed to copy text: ', err);
                        ui.notifications.error("Failed to copy message to clipboard");
                    }
                    
                    // Prevent event bubbling
                    event.preventDefault();
                    event.stopPropagation();
                });
            });
        }, 150);
    }
    
    /**
     * Copy message content to clipboard with proper formatting
     * @param {HTMLElement} contentElement - The element containing the message content
     * @param {jQuery} tooltip - The tooltip element to show feedback
     * @param {jQuery} button - The button element for visual feedback
     * @private
     */
    async _copyMessageContent(contentElement, tooltip, button) {
        if (!contentElement) return;
        
        try {
            // Get both HTML and plain text versions
            const htmlContent = contentElement.innerHTML;
            
            // Create a temporary element to get plain text with preserved formatting
            const temp = document.createElement('div');
            temp.innerHTML = htmlContent;
            
            // Process the element to convert some HTML to plain text equivalent
            this._processElementForTextCopy(temp);
            
            // Get the processed plain text
            const plainText = temp.innerText || temp.textContent || '';
            
            // Trim whitespace
            const trimmedText = plainText.trim();

            // Try to use the Clipboard API to copy both formats if available
            if (navigator.clipboard && navigator.clipboard.write) {
                const clipboardItem = new ClipboardItem({
                    'text/html': new Blob([htmlContent], { type: 'text/html' }),
                    'text/plain': new Blob([trimmedText], { type: 'text/plain' })
                });
                
                await navigator.clipboard.write([clipboardItem]);
            } else {
                await navigator.clipboard.writeText(trimmedText);
            }
            
            // Show success feedback
            button.addClass('copied');
            tooltip.addClass('visible');
            
            // Reset after a delay
            setTimeout(() => {
                button.removeClass('copied');
                tooltip.removeClass('visible');
            }, 2000);
            
        } catch (err) {
            console.error('Simulacrum | Copy operation failed:', err);
            throw err;
        }
    }

    /**
     * Process an element to convert HTML to plain text equivalents
     * @param {HTMLElement} element - The element to process
     * @private 
     */
    _processElementForTextCopy(element) {
        if (!element) return;
        
        // Process heading tags to add # symbols
        const headings = element.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach(heading => {
            const level = parseInt(heading.tagName.substring(1));
            const prefix = '#'.repeat(level) + ' ';
            heading.prepend(prefix);
        });
        
        // Process code blocks to preserve formatting
        const codeBlocks = element.querySelectorAll('pre');
        codeBlocks.forEach(block => {
            block.style.whiteSpace = 'pre';
        });
        
        // Process list items to add bullets or numbers
        const lists = element.querySelectorAll('ul, ol');
        lists.forEach(list => {
            const isOrdered = list.tagName.toLowerCase() === 'ol';
            let counter = 1;
            
            Array.from(list.children).forEach(item => {
                if (isOrdered) {
                    item.prepend(`${counter++}. `);
                } else {
                    item.prepend('• ');
                }
            });
        });
        
        // Process blockquotes to add > prefix
        const blockquotes = element.querySelectorAll('blockquote');
        blockquotes.forEach(quote => {
            quote.prepend('> ');
        });
        
        // Make sure links show their URLs
        const links = element.querySelectorAll('a');
        links.forEach(link => {
            if (link.href && link.textContent && !link.textContent.includes(link.href)) {
                link.textContent += ` (${link.href})`;
            }
        });
        
        // Ensure proper line breaks
        const paragraphs = element.querySelectorAll('p');
        paragraphs.forEach(p => {
            if (p.nextElementSibling) {
                p.append(document.createTextNode('\n\n'));
            }
        });
    }

    /**
     * Show a placeholder message with spinning animation
     * @param {string} gerund - The gerund to display (e.g., "Creating", "Analyzing")
     */
    showPlaceholder(gerund = "Thinking") {
        // Clear any existing placeholder
        this.clearCurrentPlaceholder();
        
        // Generate unique message ID for placeholder
        this.currentPlaceholderId = foundry.utils.randomID();
        
        // Add placeholder message using FIMLib's addMessage method
        this.chatWindow.addMessage({
            _id: this.currentPlaceholderId,
            content: `<div class="simulacrum-placeholder"><i class="fas fa-cog fa-spin"></i> ${gerund}...</div>`,
            sender: 'System',
            cornerText: this._getTimestamp(),
            img: "icons/svg/clockwork.svg"
        });
    }
    
    /**
     * Replace current placeholder with a message
     * @param {string} messageContent - HTML content of the message
     */
    replacePlaceholderWithMessage(messageContent) {
        // Remove placeholder element if it exists
        if (this.currentPlaceholderId) {
            const placeholderElement = this.chatWindow.element.find(`[data-message-id="${this.currentPlaceholderId}"]`);
            if (placeholderElement.length) {
                placeholderElement.remove();
            }
            this.currentPlaceholderId = null;
        }
        
        // Add the actual AI response message
        this.chatWindow.addMessage({
            content: messageContent,
            sender: 'Simulacrum',
            cornerText: this._getTimestamp(),
            img: "modules/simulacrum/assets/simulacrum-avatar.png"
        });
    }
    
    /**
     * Update the current placeholder's gerund
     * @param {string} newGerund - The new gerund to display
     */
    updatePlaceholderGerund(newGerund) {
        if (this.currentPlaceholderId) {
            const placeholderElement = this.chatWindow.element.find(`[data-message-id="${this.currentPlaceholderId}"]`);
            if (placeholderElement.length) {
                const placeholderDiv = placeholderElement.find('.simulacrum-placeholder');
                if (placeholderDiv.length) {
                    placeholderDiv.html(`<i class="fas fa-cog fa-spin"></i> ${newGerund}...`);
                }
            }
        }
    }
    
    /**
     * Clear the current placeholder
     */
    clearCurrentPlaceholder() {
        if (this.currentPlaceholderId) {
            const placeholderElement = this.chatWindow.element.find(`[data-message-id="${this.currentPlaceholderId}"]`);
            if (placeholderElement.length) {
                placeholderElement.remove();
            }
            this.currentPlaceholderId = null;
        }
    }

    /**
     * Handle a user message and generate a response
     * @param {string} message - The user's message
     * @private
     */
    async _handleUserMessage(message) {
        try {
            if (this.processing) return;
            this.processing = true;
            
            // Get user info
            const userName = game.user.name;
            const userAvatar = game.user.avatar || 'icons/svg/mystery-man.svg';
            
            // Add user message to visual chat
            this.chatWindow.addMessage({
                content: `<p>${message}</p>`,
                sender: userName,
                cornerText: this._getTimestamp(),
                isCurrentUser: true,
                img: userAvatar
            });
            
            // Add to conversation history
            this.history.push({
                role: 'user',
                content: message
            });
            
            // Initialize AI service if needed
            if (!this.aiService) {
                this.aiService = new SimulacrumAIService(game.simulacrum.toolRegistry);
            }

            // Create abort controller for cancellation
            this.abortController = new AbortController();
            
            // Show initial placeholder
            console.log('Simulacrum | About to show placeholder');
            this.showPlaceholder("Thinking");
            console.log('Simulacrum | Placeholder shown, current placeholder ID:', this.currentPlaceholderId);

            // Send to AI service and get response
            const aiResponse = await this.aiService.sendMessage(
                message,
                null, // onChunk callback not used
                null, // onComplete callback not used  
                this.abortController.signal
            );

            // Add AI response to history
            this.history.push({
                role: 'assistant',
                content: aiResponse
            });

            // Replace placeholder with actual response
            const responseContent = `<div class="simulacrum-response"><p>${aiResponse}</p></div>`;
            
            if (this.currentPlaceholderId) {
                this.replacePlaceholderWithMessage(responseContent);
            } else {
                // Fallback: add as regular message if no placeholder
                this.chatWindow.addMessage({
                    content: responseContent,
                    sender: 'Simulacrum',
                    cornerText: this._getTimestamp(),
                    img: "modules/simulacrum/assets/simulacrum-avatar.png"
                });
            }

        } catch (error) {
            console.error('Error sending message:', error);
            
            // Clear any active placeholder on error
            this.clearCurrentPlaceholder();
            
            // Add error message to chat
            this.chatWindow.addMessage({
                content: `<p class="simulacrum-error">Error: ${error.message}</p>`,
                sender: 'Simulacrum',
                cornerText: this._getTimestamp(),
                img: "modules/simulacrum/assets/simulacrum-avatar.png"
            });
        } finally {
            this.processing = false;
            this.abortController = null;
            // Ensure placeholder is cleared
            this.clearCurrentPlaceholder();
        }
    }

    /**
     * Handle streaming chunks from AI service
     * @param {string} chunk - The content chunk
     * @param {string} type - The type of chunk (text, tool_result, error)
     * @param {Object} messageRef - Object wrapper with current property for assistant message
     * @private
     */
    _onStreamChunk(chunk, type, messageRef) {
        if (type === 'text') {
            // If this is the first text chunk, create the assistant message
            if (!messageRef.current) {
                messageRef.current = this.chatWindow.addMessage({
                    content: `<div class="simulacrum-response">${MarkdownParser.parse(chunk)}</div>`,
                    sender: 'Simulacrum',
                    cornerText: this._getTimestamp(),
                    img: "modules/simulacrum/assets/simulacrum-avatar.png"
                });
            } else {
                // Append to existing message
                const responseDiv = $(messageRef.current).find('.simulacrum-response');
                responseDiv.append(MarkdownParser.parse(chunk));
            }
        } else if (type === 'tool_result') {
            // Display tool execution result
            this._displayToolResult(chunk, messageRef.current);
        } else if (type === 'error') {
            // Display error message
            this.chatWindow.addMessage({
                content: `<p class="simulacrum-error">Error: ${chunk}</p>`,
                sender: 'Simulacrum',
                cornerText: this._getTimestamp(),
                img: "modules/simulacrum/assets/simulacrum-avatar.png"
            });
        }
    }

    /**
     * Handle completion of streaming response
     * @param {string} finalMessage - The complete response message
     * @param {Array} functionCalls - Any function calls that were executed
     * @private
     */
    _onStreamComplete(finalMessage, functionCalls) {
        // Add final message to conversation history
        if (finalMessage) {
            this.history.push({
                role: 'assistant',
                content: finalMessage
            });
        }

        console.log('Stream complete:', { finalMessage, functionCalls });
    }

    /**
     * Display tool execution result
     * @param {Object} result - The tool execution result
     * @param {Object} messageElement - The message element to append to
     * @private
     */
    _displayToolResult(result, messageElement) {
        let resultHtml = '<div class="simulacrum-tool-result">';
        
        if (result.success) {
            resultHtml += `<div class="tool-success">✓ ${result.toolName || 'Tool'} executed successfully</div>`;
            if (result.data) {
                resultHtml += `<pre>${JSON.stringify(result.data, null, 2)}</pre>`;
            }
        } else {
            resultHtml += `<div class="tool-error">✗ ${result.toolName || 'Tool'} execution failed: ${result.error}</div>`;
        }
        
        resultHtml += '</div>';
        
        // Add tool result as a separate message
        this.chatWindow.addMessage({
            content: resultHtml,
            sender: 'Simulacrum',
            cornerText: this._getTimestamp(),
            img: "modules/simulacrum/assets/simulacrum-avatar.png"
        });
    }

    /**
     * Add a FoundryVTT document to the Simulacrum context
     * @param {Document} document - The FoundryVTT document to add
     */
    addDocumentContext(document) {
        if (!document || !(document instanceof foundry.abstract.Document)) {
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
        ui.notifications.info(`Added ${document.name} to context`);
    }

    /**
     * Clear chat history
     */
    clearHistory() {
        this.history = [];
        this.contextDocuments = [];
        
        if (this.aiService) {
            this.aiService.clearHistory();
        }
        
        ui.notifications.info("Chat history cleared");
    }
}