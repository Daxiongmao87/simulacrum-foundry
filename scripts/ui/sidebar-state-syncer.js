/**
 * Sidebar State Syncer - Handles conversation state synchronization
 * Extracted from SimulacrumSidebarTab to improve separation of concerns
 */

import { MarkdownRenderer } from '../lib/markdown-renderer.js';
import { transformThinkTags, hasThinkTags } from '../utils/content-processor.js';
import { formatToolCallDisplay, groupConsecutiveMessages, getToolDisplayContent } from '../utils/message-utils.js';
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
    processedContent = await MarkdownRenderer.render(processedContent);
  } catch (err) {
    logger.warn('Markdown rendering failed; using original content', err);
  }

  // Apply FoundryVTT HTML enrichment second (Operates on TextNodes within HTML)
  try {
    const TextEditorImpl = foundry?.applications?.ux?.TextEditor?.implementation ?? TextEditor;
    processedContent = await TextEditorImpl.enrichHTML(processedContent, {
      secrets: game.user?.isGM ?? false,
      documents: true,
      async: true,
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
  const processedDisplay = display || (await processMessageForDisplay(content));

  return {
    id: foundry.utils.randomID(),
    role,
    content: String(content ?? ''),
    display: processedDisplay,
    timestamp: Date.now(),
    user: role === 'user' ? game.user : null,
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

  // Filter messages for display:
  // 1. Only user, assistant, tool roles
  // 2. Exclude internal correction messages (AI context, not user-facing)
  const filtered = conversationManager.messages.filter(m => {
    if (!m) return false;
    if (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'tool') return false;

    // Skip internal correction messages added by correction.js
    // These are context for the AI, not meant for user display
    if (m._internal === true) return false;

    // Also detect correction message patterns for backward compatibility
    // with existing stored conversations that don't have the _internal flag
    if (m.role === 'assistant' && typeof m.content === 'string') {
      const content = m.content.trim();
      // Pattern: "(Response rejected: ...)" from appendEmptyContentCorrection
      if (content.startsWith('(Response rejected:')) return false;
      // Pattern: "Previous tool call ... failed" from appendToolFailureCorrection
      if (content.startsWith('Previous tool call') && content.includes('malformed arguments')) return false;
    }

    return true;
  });

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

      // Extract and format justification if present
      const justifications = [];
      for (const tc of m.tool_calls) {
        try {
          const args = typeof tc.function?.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : tc.function?.arguments;

          if (args && args.justification) {
            const toolName = tc.function?.name || tc.name;
            justifications.push(`<strong>${toolName}:</strong> ${args.justification}`);
          }
        } catch (e) {
          // Ignore parsing errors for justification extraction
        }
      }

      if (justifications.length > 0) {
        // Append justification to content for display purposes if not already present
        // (We don't modify m.content directly to avoid persisting duplicates, we modify the display object if we were building it here, 
        // but here we are iterating. syncing messages usually builds display messages.)
        // But wait, 'createDisplayMessage' is called below.
        // We should append it to the content passed to createDisplayMessage, OR modify the loop structure.
        // m.content is the raw content.
        // Let's modify the loop to append justification to the text sent to createDisplayMessage

        const justificationHtml = `\n\n<div class="tool-justification">
          <div class="justification-header"><i class="fas fa-thought"></i> Plan</div>
          <div class="justification-content">${justifications.join('<br>')}</div>
        </div>`;

        // We can't easily append to 'm.content' without side effects if we re-sync many times?
        // Actually syncMessagesFromCore creates NEW display objects.
        // So appending to the string passed to createDisplayMessage is safe.
        m._justificationHtml = justificationHtml;
      }
    }

    if (m.role === 'tool') {
      // Reconstruct tool result display
      const toolName = toolCallNames.get(m.tool_call_id);

      let preRendered = null;
      const rawDisplayContent = getToolDisplayContent(m);
      if (rawDisplayContent) {
        try {
          preRendered = await MarkdownRenderer.render(rawDisplayContent);

          // Task-Fix: Explicitly enrich the content since processMessageForDisplay (which usually does it)
          // is skipped when providing a direct 'display' value.
          const TextEditorImpl = foundry?.applications?.ux?.TextEditor?.implementation ?? TextEditor;
          preRendered = await TextEditorImpl.enrichHTML(preRendered, {
            secrets: game.user?.isGM ?? false,
            documents: true,
            async: true,
          });
        } catch (e) {
          logger.warn('Failed to pre-render or enrich tool content', e);
        }
      }

      const displayHtml = formatToolCallDisplay(m, toolName, preRendered);

      // Display tool results as assistant messages (matching ChatHandler behavior)
      const message = await createDisplayMessage('assistant', m.content, displayHtml);
      messages.push(message);
    } else {
      // Normal message processing
      let contentToDisplay = m.content;
      if (m._justificationHtml) {
        // Append justification HTML to the content for display
        // We append it to the 'content' so processMessageForDisplay sees it?
        // OR we pass it as a separate 'display' argument?
        // processMessageForDisplay transforms <think> tags etc.
        // If we append HTML, markdown renderer might escape it?
        // MarkdownRenderer usually handles HTML if configured.
        // Better to pass it as 'display' overrides if we can, but createDisplayMessage computes display from content.

        // Let's pre-calculate display and append our HTML
        const baseDisplay = await processMessageForDisplay(m.content);
        const finalDisplay = baseDisplay + m._justificationHtml;
        const message = await createDisplayMessage(m.role, m.content, finalDisplay);
        messages.push(message);
      } else {
        const message = await createDisplayMessage(m.role, m.content);
        messages.push(message);
      }
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
    user: null,
  };
}
