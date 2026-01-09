/**
 * Sidebar State Syncer - Handles conversation state synchronization
 * Extracted from SimulacrumSidebarTab to improve separation of concerns
 */

import { MarkdownRenderer } from '../lib/markdown-renderer.js';
import { transformThinkTags, hasThinkTags } from '../utils/content-processor.js';
import { formatToolCallDisplay, groupConsecutiveMessages } from '../utils/message-utils.js';
import { ChatHandler } from '../core/chat-handler.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('SidebarSync');

/**
 * Process a message for display (markdown, think tags, enrichment)
 * @param {string} content - Raw message content
 * @param {object} options - Processing options
 * @returns {Promise<string>} Processed HTML content
 */
export async function processMessageForDisplay(content, _options = {}) {
    let processedContent = String(content ?? '');

    // Transform <think></think> tags to collapsible spoilers
    if (hasThinkTags(processedContent)) {
        processedContent = transformThinkTags(processedContent);
    }

    // Apply markdown rendering first (Generates HTML structure)
    try {
        processedContent = await MarkdownRenderer.render(processedContent, { force: true });
    } catch (err) {
        logger.warn('Markdown rendering failed; using original content', err);
    }

    // Apply FoundryVTT HTML enrichment second (Operates on TextNodes within HTML)
    try {
        const TextEditorImpl = foundry?.applications?.ux?.TextEditor?.implementation ?? TextEditor;
        processedContent = await TextEditorImpl.enrichHTML(processedContent, {
            secrets: game.user?.isGM ?? false,
            documents: true,
            async: true
        });
    } catch (err) {
        logger.warn('HTML enrichment failed', err);
    }

    return processedContent;
}

/**
 * Create a formatted message object for display
 * @param {string} role - Message role ('user' or 'assistant')
 * @param {string} content - Raw content
 * @param {string} [display] - Pre-processed display content
 * @returns {Promise<object>} Formatted message object
 */
export async function createDisplayMessage(role, content, display = null) {
    const processedDisplay = display || await processMessageForDisplay(content);

    return {
        id: foundry.utils.randomID(),
        role,
        content: String(content ?? ''),
        display: processedDisplay,
        timestamp: Date.now(),
        user: role === 'user' ? game.user : null
    };
}

/**
 * Sync messages from ConversationManager to UI format
 * @param {object} conversationManager - The conversation manager instance
 * @returns {Promise<Array>} Array of formatted messages for UI
 */
export async function syncMessagesFromCore(conversationManager) {
    if (!conversationManager?.messages || !Array.isArray(conversationManager.messages)) {
        return [];
    }

    const filtered = conversationManager.messages.filter(
        m => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
    );

    const messages = [];
    const toolCallNames = new Map();

    for (const m of filtered) {
        // Track tool call IDs from assistant messages to resolve names later
        if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
            for (const tc of m.tool_calls) {
                if (tc.id && (tc.function?.name || tc.name)) {
                    toolCallNames.set(tc.id, tc.function?.name || tc.name);
                }
            }
        }

        if (m.role === 'tool') {
            // Reconstruct tool result display
            const toolName = toolCallNames.get(m.tool_call_id);
            const displayHtml = formatToolCallDisplay(m, toolName);

            // Display tool results as assistant messages (matching ChatHandler behavior)
            const message = await createDisplayMessage('assistant', m.content, displayHtml);
            messages.push(message);
        } else {
            // Normal message processing
            const message = await createDisplayMessage(m.role, m.content);
            messages.push(message);
        }
    }

    // Apply grouping for consecutive assistant messages
    return groupConsecutiveMessages(messages);
}

/**
 * Initialize ChatHandler from SimulacrumCore
 * @returns {Promise<ChatHandler|null>} ChatHandler instance or null
 */
export async function initializeChatHandler() {
    try {
        const { SimulacrumCore } = await import('../core/simulacrum-core.js');
        if (SimulacrumCore?.conversationManager) {
            return new ChatHandler(SimulacrumCore.conversationManager);
        }
    } catch (err) {
        logger.error('Failed to initialize ChatHandler', err);
    }
    return null;
}

/**
 * Create welcome message
 * @returns {object} Welcome message object
 */
export function createWelcomeMessage() {
    return {
        id: foundry.utils.randomID(),
        role: 'assistant',
        content: game.i18n?.localize('SIMULACRUM.WelcomeMessage') ?? 'Welcome to Simulacrum!',
        display: null,
        timestamp: Date.now(),
        timestampLabel: game.i18n?.localize('SIMULACRUM.Welcome') ?? 'Welcome',
        user: null
    };
}
