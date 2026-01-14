/**
 * Content Processing Utilities for Simulacrum
 * Handles transformation of AI response content for proper HTML rendering
 */

import { createLogger } from './logger.js';

/**
 * Transforms <think></think> tags into collapsible HTML details/summary elements
 *
 * @param {string} content - The raw content containing think tags
 * @returns {string} Content with think tags transformed to collapsible spoilers
 */
export function transformThinkTags(content) {
  if (!content || typeof content !== 'string') {
    return content;
  }

  try {
    // Handle both HTML-escaped and literal think tags
    // Pattern 1: HTML-escaped tags &lt;think&gt;...&lt;/think&gt;
    const escapedPattern = /&lt;think&gt;([\s\S]*?)&lt;\/think&gt;/gi;

    // Pattern 2: Literal tags <think>...</think>
    const literalPattern = /<think>([\s\S]*?)<\/think>/gi;

    let processedContent = content;

    // Process HTML-escaped think tags first
    processedContent = processedContent.replace(escapedPattern, (match, thinkContent) => {
      return transformThinkBlock(thinkContent.trim());
    });

    // Process literal think tags
    processedContent = processedContent.replace(literalPattern, (match, thinkContent) => {
      return transformThinkBlock(thinkContent.trim());
    });

    return processedContent;
  } catch (error) {
    // Graceful fallback - return original content if transformation fails
    try {
      createLogger('ContentProcessor').warn('Failed to transform think tags:', error);
    } catch (e) {
      // Fallback if logger fails
    }
    return content;
  }
}

/**
 * Transforms a single think block content into collapsible HTML
 *
 * @param {string} thinkContent - The content inside the think tags
 * @returns {string} HTML details/summary structure
 * @private
 */
function transformThinkBlock(thinkContent) {
  if (!thinkContent) {
    return '';
  }

  // Escape any remaining HTML in the think content to prevent injection
  const escapedContent = thinkContent
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Convert line breaks to HTML breaks for proper formatting
  const formattedContent = escapedContent.replace(/\n/g, '<br>');

  return `<details class="simulacrum-thoughts">
    <summary>🤔 Thoughts</summary>
    <div class="think-content">${formattedContent}</div>
  </details>`;
}

/**
 * Check if content contains think tags (for performance optimization)
 *
 * @param {string} content - Content to check
 * @returns {boolean} True if content contains think tags
 */
export function hasThinkTags(content) {
  if (!content || typeof content !== 'string') {
    return false;
  }

  return /(&lt;think&gt;|<think>)/i.test(content);
}
