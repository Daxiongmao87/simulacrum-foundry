import { SimulacrumHooks, emitProcessCancelled } from '../core/hook-manager.js';
import { createLogger } from '../utils/logger.js';

/**
 * Manages the queue of chat messages that are intercepted while the AI is processing.
 */
class MessageQueueManager {
    constructor() {
        this.logger = createLogger('MessageQueue');
        this.queue = [];
        this.isProcessing = false;
        this.isPaused = false; // Internal pause to allow authorized sends
    }

    /**
     * Initialize the manager: hooks and listeners
     */
    init() {
        // Listen for AI process status
        Hooks.on(SimulacrumHooks.PROCESS_STATUS, this._onProcessStatus.bind(this));

        // Listen for chat message interception
        Hooks.on('chatMessage', this._onChatMessage.bind(this));

        // Register global listener for queue actions (using jQuery for easy delegation)
        $(document).on('click', '.queue-action, .batch-action', this._onQueueAction.bind(this));

        // Rerender chat log when it's rendered to ensure queue persists
        Hooks.on('renderChatLog', this._renderQueue.bind(this));

        this.logger.info('MessageQueueManager initialized');
    }

    /**
     * Handle process status updates to toggle processing state
     * @param {object} payload 
     */
    _onProcessStatus(payload) {
        if (payload.state === 'start') {
            this.isProcessing = true;
        } else {
            this.isProcessing = false;
            // If we stop processing naturally, what happens to the queue?
            // Design decision: We keep it until manually handled, OR we could auto-send.
            // For now, based on requirements, we keep the ephemeral UI until acted upon,
            // but "isProcessing" stops blocking new messages.
            // However, if the user wanted to "force" send, they would have likely done so.
            // If the AI finishes, the user might still want those messages sent.
            // Let's NOT clear queue automatically, but we should update UI to reflect "Ready" state if desired.
            // Actually, if processing ends, we should probably allow the user to send the queued messages easily.
            this._renderQueue();
        }
    }

    /**
     * Intercept chat messages
     * @param {ChatLog} chatLog 
     * @param {string} message 
     * @param {object} chatData 
     */
    _onChatMessage(chatLog, message, chatData) {
        // If we are not processing, or if we are internally paused (allowing a force send), do nothing.
        if (!this.isProcessing || this.isPaused) return;

        // Ignore empty messages
        if (!message || message.trim() === '') return;

        // Queue the message
        this.queue.push({
            id: foundry.utils.randomID(),
            content: message,
            timestamp: Date.now(),
            chatData: chatData // Preserve any extra data if needed
        });

        this.logger.info('Message queued', { message });

        // Update UI
        this._renderQueue();

        // Prevent default handling
        return false;
    }

    /**
     * Render the queue UI into the Chat Log
     */
    async _renderQueue() {
        // If queue is empty, remove the container if it exists
        const container = $('#simulacrum-message-queue');
        if (this.queue.length === 0) {
            container.remove();
            return;
        }

        // Render logic
        const html = await foundry.applications.handlebars.renderTemplate('modules/simulacrum/templates/simulacrum/message-queue.hbs', {
            messages: this.queue,
            isProcessing: this.isProcessing
        });

        // Check if container exists
        if (container.length) {
            container.replaceWith(html);
        } else {
            // Append to chat log - strict placement at bottom
            // We append to #chat-log or the active tab content
            const chatLog = $('#chat-log');
            if (chatLog.length) {
                chatLog.append(html);
            }
        }

        // Scroll chat to bottom to ensure queue is visible? 
        // Maybe best to just let it sit there. 
    }

    /**
     * Handle clicks on queue actions
     * @param {Event} event 
     */
    async _onQueueAction(event) {
        event.preventDefault();
        const target = $(event.currentTarget);
        const action = target.data('action');
        const id = target.closest('.simulacrum-queued-message').data('id');

        switch (action) {
            case 'cancel':
                this._removeMessage(id);
                break;
            case 'force':
                await this._forceSend(id);
                break;
            case 'cancel-all':
                this._clearQueue();
                break;
            case 'force-all':
                await this._forceSendAll();
                break;
        }
    }

    /**
     * Remove a single message from the queue
     * @param {string} id 
     */
    _removeMessage(id) {
        this.queue = this.queue.filter(m => m.id !== id);
        this._renderQueue();
    }

    /**
     * Clear the entire queue
     */
    _clearQueue() {
        this.queue = [];
        this._renderQueue();
    }

    /**
     * Force send a message: Cancel AI, then send message
     * @param {string} id 
     */
    async _forceSend(id) {
        const message = this.queue.find(m => m.id === id);
        if (!message) return;

        // 1. Cancel AI
        emitProcessCancelled();
        // Also cancel locally immediately to prevent race conditions
        this.isProcessing = false;

        // 2. Remove from queue
        this._removeMessage(id);

        // 3. Send message (bypass hook)
        this._sendMessageBypass(message.content);
    }

    /**
     * Force send all messages
     */
    async _forceSendAll() {
        if (this.queue.length === 0) return;

        // 1. Cancel AI
        emitProcessCancelled();
        this.isProcessing = false;

        // 2. Snapshot queue and clear it
        const messagesToSend = [...this.queue];
        this._clearQueue();

        // 3. Send all messages
        for (const msg of messagesToSend) {
            this._sendMessageBypass(msg.content);
        }
    }

    /**
     * Send a message to chat, bypassing our own interception
     * @param {string} content 
     */
    _sendMessageBypass(content) {
        this.isPaused = true; // Disable interception
        try {
            ui.chat.processMessage(content);
        } finally {
            this.isPaused = false; // Re-enable interception (though isProcessing might be false now)
        }
    }
}

// Singleton instance
export const messageQueueManager = new MessageQueueManager();
