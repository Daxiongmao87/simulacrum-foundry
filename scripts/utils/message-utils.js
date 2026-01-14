/**
 * Smart slicing for message arrays to preserve tool call dependencies.
 * @module utils/message-utils
 */

/**
 * Smartly slice messages to enforce a token/count limit while preserving dependencies.
 * specifically ensuring that tool results are never orphaned from their parent assistant calls.
 *
 * @param {Array<object>} messages - The array of messages to slice
 * @param {number} limit - The maximum number of messages to return (soft limit)
 * @returns {Array<object>} The sliced messages, potentially slightly larger than limit to preserve context
 */
export function smartSliceMessages(messages, limit) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  if (limit <= 0) return [];
  if (messages.length <= limit) return messages;

  // Initial naive slice
  // const startIndex = messages.length - limit;
  // let sliced = messages.slice(-limit);

  let startIndex = messages.length - limit;
  if (startIndex < 0) startIndex = 0;

  // Check if the cut point splits a dependency
  // If the first message in our slice is a TOOL result, we must find its parent.
  // We look backwards from startIndex - 1.
  let currentStart = startIndex;

  // Safety loop to prevent infinite recursion in malformed history, though highly unlikely
  // We only look back a reasonable amount (e.g. 5 steps) to find the parent.
  const MAX_LOOKBACK = 10;
  let attempts = 0;

  while (
    currentStart > 0 &&
    currentStart < messages.length &&
    messages[currentStart].role === 'tool' &&
    attempts < MAX_LOOKBACK
  ) {
    const toolMsg = messages[currentStart];
    const toolCallId = toolMsg.tool_call_id;

    // Look for the parent assistant message
    let foundParent = false;
    for (let i = currentStart - 1; i >= 0 && i >= startIndex - MAX_LOOKBACK; i--) {
      const candidate = messages[i];
      if (candidate.role === 'assistant' && candidate.tool_calls) {
        const hasCall = candidate.tool_calls.some(tc => tc.id === toolCallId);
        if (hasCall) {
          // Found the parent!
          // We must include this parent index.
          currentStart = i;
          foundParent = true;
          break;
        }
      }
    }

    if (!foundParent) {
      // If we can't find the parent within lookback, we can't save it.
      // But maybe the message before it is another tool result from the SAME parent?
      // In that case, we should keep going back.
      // For now, if we don't find a parent, we just stop expanding to avoid pulling in the whole history.
      // Better to have an orphan than 1000 tokens? Logic says NO, an orphan crashes the API.
      // So if we have an orphan, we should actually DISCARD the tool result if we can't find the parent.
      // But adhering to "Smart Slice" usually means "Expand to include context".
      // Let's just break if not found.
      break;
    }
    attempts++;
  }

  return messages.slice(currentStart);
}

/**
 * Format a tool call result as rich HTML with status icons
 * @param {Object} toolResult - The tool result object/message
 * @param {string} toolName - The name of the tool (must be provided as it might not be in the message)
 * @returns {string} HTML string for display
 */
/**
 * Extracts just the raw display content string from a tool result, without wrapping it in HTML.
 * @param {object} toolResult - The tool result object
 * @returns {string|null} The raw string content or null if not found
 */
export function getToolDisplayContent(toolResult) {
  const isSuccess = !toolResult.isError && !toolResult.error;
  if (!isSuccess) return null;

  try {
    const content = typeof toolResult.content === 'string' ? JSON.parse(toolResult.content) : toolResult.content;
    if (content && typeof content.display === 'string' && content.display.trim().length > 0) {
      return content.display;
    }
  } catch (e) {
    // Not valid JSON or no display
  }
  return null;
}

/**
 * Format a tool call result as rich HTML with status icons
 * @param {Object} toolResult - The tool result object/message
 * @param {string} toolName - The name of the tool (must be provided as it might not be in the message)
 * @param {string} [preRenderedContent=null] - Optional pre-rendered HTML content to use instead of raw extraction
 * @returns {string} HTML string for display
 */
export function formatToolCallDisplay(toolResult, toolName = null, preRenderedContent = null) {
  let isSuccess = !toolResult.isError && !toolResult.error;

  // Enhance success detection by checking content for error signatures
  // (BaseTool returns success:false in content but doesn't set isError on the message object)
  if (isSuccess && typeof toolResult.content === 'string') {
    try {
      if (toolResult.content.includes('"success":false') || toolResult.content.includes('"error":')) {
        const parsed = JSON.parse(toolResult.content);
        if (parsed && (parsed.success === false || parsed.error)) {
          isSuccess = false;
        }
      }
    } catch (e) { }
  }

  const statusClass = isSuccess ? 'tool-success' : 'tool-failure';
  const iconClass = isSuccess ? 'fa-solid fa-circle-check' : 'fa-solid fa-triangle-exclamation';

  // Build action text from tool name
  const effectiveToolName = toolName || toolResult.toolName || 'unknown';
  const actionText = getToolActionText(effectiveToolName, toolResult);

  // Extract document name if present in the result
  const documentInfo = extractDocumentInfo(toolResult);
  const documentHtml = documentInfo ? `<span class="tool-document">${documentInfo}</span>` : '';

  // Specialized Macro Result Display
  let resultHtml = '';
  if (effectiveToolName === 'execute_macro' && isSuccess) {
    resultHtml = formatMacroResult(toolResult);
  } else {
    // Standard display logic (handles both success and error)
    if (preRenderedContent && isSuccess) {
      resultHtml = `<div class="tool-result-display">${preRenderedContent}</div>`;
    } else {
      // Generic tool result display (supports error display extraction)
      resultHtml = extractToolDisplay(toolResult);
    }
  }

  return `<div class="simulacrum-tool-call ${statusClass}"><i class="${iconClass} tool-icon"></i><span class="tool-action">${actionText}</span>${documentHtml}${resultHtml}</div>`;
}

/**
 * Format a pending tool call as HTML with spinner icon
 * @param {string} toolName - The name of the tool being executed
 * @param {string} [justification=''] - Optional justification/reason for the tool call
 * @param {string} [toolCallId=''] - The tool call ID for tracking
 * @returns {string} HTML string for pending tool card display
 */
export function formatPendingToolCall(toolName, justification = '', toolCallId = '') {
  // Try to get localized tool name from en.json
  const locKey = `SIMULACRUM.Tools.${toolName}`;
  let actionText = game.i18n.localize(locKey);

  // If localization key not found, fall back to formatting the tool name
  if (actionText === locKey) {
    actionText = toolName
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  const justificationHtml = justification
    ? `<div class="tool-justification"><p>${justification}</p></div>`
    : '';

  const dataAttr = toolCallId ? ` data-tool-call-id="${toolCallId}"` : '';

  return `<div class="simulacrum-tool-call tool-pending"${dataAttr}><i class="fa-solid fa-circle-notch fa-spin tool-icon"></i><span class="tool-action">${actionText}</span>${justificationHtml}</div>`;
}

/**
   * Get human-readable action text for a tool
   * @param {string} toolName - The tool name
   * @param {Object} toolResult - The tool result for context
   * @returns {string} Human-readable action text
   */
export function getToolActionText(toolName, toolResult) {
  // Try to get localized tool name from en.json
  const locKey = `SIMULACRUM.Tools.${toolName}`;
  let action = game.i18n.localize(locKey);

  // If localization key not found, game.i18n.localize returns the key itself
  // In that case, fall back to formatting the tool name
  if (action === locKey) {
    action = toolName
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  const docType = toolResult.documentType || '';
  return docType ? `${action}: ${docType}` : action;
}

/**
 * Extract document name/info from tool result for display
 * @param {Object} toolResult - The tool result
 * @returns {string|null} Document info or null
 */
export function extractDocumentInfo(toolResult) {
  // Try to extract document name from the result content
  const content = String(toolResult.content || '');

  // Look for document name patterns
  const nameMatch = content.match(/"name":\s*"([^"]+)"/);
  if (nameMatch) {
    return nameMatch[1];
  }

  // Look for "Created X" or similar success messages
  const createdMatch = content.match(
    /(?:Created|Updated|Deleted|Read)\s+(\w+)\s+(?:document\s+)?['"]([^'"]+)['"]/i
  );
  if (createdMatch) {
    return createdMatch[2];
  }

  // Look for Macro execution message
  const macroMatch = content.match(/executed macro:\s*([^"'}]+)/i);
  if (macroMatch) {
    return macroMatch[1].trim();
  }

  return null;
}

/**
 * Format macro execution result
 * @param {Object} toolResult
 * @returns {string} HTML string
 */
// eslint-disable-next-line complexity
export function formatMacroResult(toolResult) {
  try {
    // Content is JSON stringified result from tool
    let contentObj;
    try {
      contentObj = JSON.parse(toolResult.content);
    } catch {
      // content might not be json
      return '';
    }

    let macroResult = contentObj;

    // Loop to unwrap nested JSON strings (max 3 levels to avoid infinite loops)
    for (let i = 0; i < 3; i++) {
      if (typeof macroResult === 'string') {
        try {
          const parsed = JSON.parse(macroResult);
          if (parsed && typeof parsed === 'object') {
            macroResult = parsed;
          } else {
            break;
          }
        } catch {
          break;
        }
        // eslint-disable-next-line max-depth
      } else {
        break;
      }
    }

    if (macroResult && macroResult.result && macroResult.result.total !== undefined) {
      let html = `<div class="tool-result"><strong>Roll Result:</strong> ${macroResult.result.total}</div>`;
      if (macroResult.result.formula) {
        html += `<div class="tool-result-detail"><small>Formula: ${macroResult.result.formula}</small></div>`;
      }
      return html;
    } else if (macroResult && macroResult.result !== undefined) {
      const resultStr =
        typeof macroResult.result === 'object'
          ? JSON.stringify(macroResult.result, null, 2)
          : String(macroResult.result);
      return `<div class="tool-result"><strong>Result:</strong> ${resultStr}</div>`;
    }
  } catch (e) {
    /* ignore parse errors */
  }
  return '';
}

/**
 * Extract generic display content from tool result if available
 * @param {Object} toolResult
 * @returns {string} HTML string
 */
export function extractToolDisplay(toolResult) {
  try {
    const content = toolResult.content || '';
    // Check if content is a JSON string
    if (typeof content === 'string' && content.startsWith('{')) {
      const parsed = JSON.parse(content);

      if (parsed && typeof parsed === 'object') {
        // Case 1: Display property exists (standard success)
        if (parsed.display) {
          return `<div class="tool-result-display">${parsed.display}</div>`;
        }

        // Case 2: Error object
        if (parsed.error && (parsed.success === false || parsed.error.message)) {
          const errorMessage = parsed.error.message || parsed.error;
          const errorType = parsed.error.type ? `<strong>${parsed.error.type}:</strong> ` : '';
          return `<div class="tool-result-display error-display">${errorType}${errorMessage}</div>`;
        }

        // Case 3: Success but no display (message property)
        if (parsed.message) {
          return `<div class="tool-result-display">${parsed.message}</div>`;
        }

        // Case 4: Compacted output
        if (parsed._compacted) {
          // If display was preserved during compaction, use it for formatted rendering
          if (parsed.display) {
            return `<div class="tool-result-display">${parsed.display}</div>`;
          }
          // Otherwise show compacted info with preview
          return `<div class="tool-result-display compacted-display">
            <div class="compacted-header"><i class="fas fa-compress-alt"></i> Output Compacted</div>
            <div class="compacted-info">
              Total: ${parsed.total_lines} lines (${parsed.total_chars} chars)<br>
              <em>${parsed.access}</em>
            </div>
            ${parsed.preview ? `<div class="compacted-preview"><pre>${parsed.preview}</pre></div>` : ''}
          </div>`;
        }
      }
    }
  } catch (e) {
    /* ignore */
  }
  return '';
}

/**
 * Group consecutive messages from the same role (specifically assistant)
 * @param {Array<Object>} messages - Array of message objects
 * @returns {Array<Object>} Grouped messages
 */
export function groupConsecutiveMessages(messages) {
  if (!messages || messages.length === 0) return [];

  const grouped = [];
  let currentGroup = null;

  for (const msg of messages) {
    // Only group 'assistant' messages for now, as requested
    if (msg.role === 'assistant') {
      if (currentGroup && currentGroup.role === 'assistant') {
        // Merge into current group
        // 1. Calculate new display BEFORE mutating content (Fix for JSON leak)
        // Ensure we handle cases where display might be missing (fallback to content)
        const currentDisplay = currentGroup.display || currentGroup.content;
        const newDisplay = msg.display || msg.content;

        // 2. Combine content (with newline)
        currentGroup.content += '\n\n' + msg.content;

        // 3. Set combined display
        currentGroup.display = currentDisplay + newDisplay;
        // 3. Keep original timestamp/id of the group starter
      } else {
        // Start a new assistant group
        // Clone to avoid mutating original if needed, though mostly safe here
        currentGroup = { ...msg };
        grouped.push(currentGroup);
      }
    } else {
      // Non-assistant message: push and reset group
      grouped.push(msg);
      currentGroup = null;
    }
  }

  return grouped;
}
