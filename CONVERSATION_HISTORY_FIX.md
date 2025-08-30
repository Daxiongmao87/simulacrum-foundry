# Conversation History Corruption Fix

## Problem Summary

The conversation history was being corrupted during agentic loops (when `continuation.in_progress = true`) due to incorrect handling in the `AIService.sendWithContext()` method.

### Example of the Issue

**Expected conversation flow:**
1. User: "Find the Celestial Serenade of the Ethereal Blade"
2. AI: "I need to know what type of item this is."
3. User: "it's a weapon"
4. AI: [searches and finds weapon]

**What was happening:**
The conversation history became corrupted with repeated "it's a weapon" entries:
```json
{
  "messages": [
    {"role": "user", "content": "it's a weapon"},
    {"role": "user", "content": "it's a weapon"},
    {"role": "user", "content": "it's a weapon"},
    // ... original context lost
  ]
}
```

## Root Cause Analysis

### Issue 1: Incorrect Message Extraction
In `AIService.sendWithContext()` (lines 314-332), the method was:

1. **Extracting only the last user message** from the agentic context
2. **Calling `sendMessage()` with just that message** 
3. **`sendMessage()` was adding it to `conversationHistory`** as if it were a new conversation

This caused follow-up messages like "it's a weapon" to be treated as standalone conversation starters instead of part of the ongoing agentic context.

### Issue 2: Duplicate History Updates
The original implementation was calling `sendMessage()` from within `sendWithContext()`, which:
- Added messages to the main `conversationHistory` during intermediate agentic loop steps
- Caused the agentic context to pollute the main conversation history
- Lost the original conversation context

## The Solution

### 1. Fixed `sendWithContext()` Method
**File: `scripts/chat/ai-service.js`**

**Before (lines 314-332):**
```javascript
async sendWithContext(context, abortSignal) {
  // Get the last user message from context
  const contextMessages = context.toMessagesArray();
  const lastUserMessage = [...contextMessages]
    .reverse()
    .find((msg) => msg.role === 'user');
  
  // Just send the message normally - let sendMessage handle the conversation history
  return this.sendMessage(
    lastUserMessage.content,  // ❌ Only sending last user message
    null,
    null,
    abortSignal,
    true
  );
}
```

**After (lines 314-493):**
```javascript
async sendWithContext(context, abortSignal) {
  // Get the context messages - do NOT extract just the last user message
  const contextMessages = context.toMessagesArray();
  
  // Build messages array with system prompt and agentic context
  const messages = [
    { role: 'system', content: defaultPrompt + userAdditions },
    ...contextMessages, // ✅ Use the full agentic context
  ];
  
  // Make API call directly without modifying conversationHistory
  // ... (full API call implementation)
  
  // CRITICAL: Do NOT add to conversationHistory
  // The agentic loop manages its own context via AgenticContext
  return aiResponse;
}
```

### 2. Enhanced Agentic Loop Completion
**File: `scripts/core/agentic-loop-controller.js`**

Added logic to properly update the main conversation history when the agentic loop completes (lines 292-324):

```javascript
if (!parsed.continuation.in_progress) {
  // Update main conversation history with final result
  const contextMessages = context.toMessagesArray();
  const firstUserMessage = contextMessages.find(msg => msg.role === 'user');
  
  if (firstUserMessage) {
    // Add the original user message and final AI response to main history
    this.aiService.conversationHistory.push({
      role: 'user',
      content: firstUserMessage.content
    });
    this.aiService.conversationHistory.push({
      role: 'assistant', 
      content: parsed.message
    });
  }
  
  return; // Complete
}
```

## Key Principles of the Fix

1. **Agentic Context Isolation**: During agentic loops, maintain separate context (`AgenticContext`) from main conversation history
2. **No Intermediate Updates**: Don't modify main `conversationHistory` during agentic loop iterations
3. **Complete Context Passing**: Send the full agentic context to the AI, not just the last message
4. **Final Consolidation**: Only update main conversation history when the entire workflow completes

## Testing

Created comprehensive test in `tests/unit/v13/conversation-history-agentic-loop.test.js` that:
- Demonstrates the exact corruption issue
- Verifies the fix prevents corruption
- Shows conversation history preservation

**Test Results:**
- ✅ "sendWithContext should not corrupt conversation history after fix" - PASSES
- ❌ Previous behavior tests fail as expected (demonstrating the bug exists)

## Impact

This fix ensures that:
1. **Original conversation context is preserved** throughout agentic loops
2. **No duplicate or corrupted messages** are added to conversation history
3. **Follow-up messages during agentic loops** are properly contextualized
4. **Main conversation history remains clean** and reflects the actual user-AI conversation flow

The user will no longer see corrupted conversation histories like repeated "it's a weapon" messages, and the original question will be preserved properly.