# Bug Fixes for Document Update Tool

## Issue 1: AI Using Document Name Instead of ID

### Problem
The AI was using the document name ("Ornate Longsword") instead of the document ID for update operations. This caused the update to fail because the DocumentAPI.updateDocument method expects the actual document ID.

### Root Cause
The search tool's formatSearchResults method was only displaying the document name and type, but not the document ID. When the AI saw the search results, it tried to use the document name as the ID for the update operation.

### Solution
Modified the search tool's formatSearchResults method to include the document ID in its output:

**File:** `/scripts/tools/document-search.js`

```javascript
// Before
return '- **' + name + '** (' + type + ')';

// After
return '- **' + name + '** (ID: ' + id + ', Type: ' + type + ')';
```

This change makes it clear to the AI which value is the document ID that should be used for update operations.

## Issue 2: Error Handling in Document Update Tool

### Problem
When the update tool failed, the error was not being properly handled and returned as a tool call result. Instead, it was throwing an exception that wasn't being caught properly by the tool loop handler.

### Root Cause
The document update tool was throwing a SimulacrumError instead of returning an error object like the list tool does. This prevented the tool loop handler from properly processing the error and providing feedback to the AI.

### Solution
Modified the document update tool to return errors in the same format as the list tool:

**File:** `/scripts/tools/document-update.js`

```javascript
// Before
throw new SimulacrumError(`Failed to update ${params.documentType}:${params.documentId}: ${error.message}`, 'UPDATE_FAILED');

// After
return {
  content: `Failed to update ${params.documentType}:${params.documentId}: ${error.message}`,
  display: `❌ Failed to update **${params.documentId}** (${params.documentType}): ${error.message}`,
  error: { message: error.message, type: 'UPDATE_FAILED' }
};
```

Also removed the unused SimulacrumError import since we're no longer throwing that error.

## Testing
After these changes, the AI should:
1. Be able to see the document ID in search results
2. Use the correct document ID for update operations
3. Receive proper error feedback when operations fail

These changes align the behavior of the update tool with other tools in the system, particularly the list tool, which already had proper error handling.