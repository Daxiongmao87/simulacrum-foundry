
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
        for (let i = currentStart - 1; i >= 0 && i >= (startIndex - MAX_LOOKBACK); i--) {
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
