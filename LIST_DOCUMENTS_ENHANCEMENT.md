# list_documents Tool Enhancement

## Problem Summary

The `list_documents` tool previously required a `documentType` parameter, making it impossible to get an overview of all available documents in the world. This was inconsistent with the `list_images` tool, which allows browsing all images without specifying a type.

## Solution Implemented

### Schema Changes
**File: `scripts/tools/list-documents.js`**

**Before:**
```javascript
{
  type: 'object',
  properties: {
    documentType: {
      type: 'string',
      description: 'Type of documents to list',
    },
    // ... other properties
  },
  required: ['documentType'], // ❌ Required
}
```

**After:**
```javascript
{
  type: 'object',
  properties: {
    documentType: {
      type: 'string',
      description: 'Optional: Type of documents to list (e.g., "Actor", "Item", "Scene"). If not specified, lists all document types.',
    },
    // ... other properties
  },
  required: [], // ✅ No required parameters
}
```

### Functional Changes

#### 1. Updated Tool Name and Description
- Changed name from `'list_document_types'` to `'list_documents'` for consistency
- Updated description to clarify optional nature of documentType

#### 2. Enhanced Execute Method
The tool now supports two modes:

**Mode 1: Specific Document Type (Backward Compatible)**
```javascript
// Example: list_documents({ documentType: "Item", limit: 10 })
{
  "success": true,
  "result": {
    "documentType": "Item",
    "totalFound": 3,
    "returned": 3,
    "documents": [
      { "id": "item1", "name": "Sword", "type": "weapon", "folder": "Weapons" },
      // ... more items
    ]
  }
}
```

**Mode 2: All Documents (New Feature)**
```javascript
// Example: list_documents({ limit: 20 })
{
  "success": true,
  "result": {
    "documentType": "all",
    "availableTypes": ["Actor", "Item", "Scene", "JournalEntry"],
    "totalFound": 9,
    "returned": 9,
    "byType": {
      "Actor": { "count": 3, "items": [...] },
      "Item": { "count": 3, "items": [...] },
      "Scene": { "count": 2, "items": [...] },
      "JournalEntry": { "count": 1, "items": [...] }
    },
    "documents": [
      { "id": "actor1", "name": "Hero", "documentType": "Actor", ... },
      { "id": "item1", "name": "Sword", "documentType": "Item", ... },
      // ... all documents from all collections
    ]
  }
}
```

### Key Features

1. **Backward Compatibility**: All existing calls with `documentType` work exactly as before
2. **Comprehensive Overview**: When called without parameters, provides a complete inventory of all documents
3. **Summary by Type**: Includes `byType` breakdown showing counts and sample items from each collection
4. **Consistent Pagination**: Same `limit` and `offset` parameters work for both modes
5. **Unified Filtering**: The `filter` parameter works across all document types when listing everything

### Usage Examples

**List all documents (paginated):**
```javascript
await tool.execute({ limit: 50, offset: 0 });
```

**List all documents with name filter:**
```javascript
await tool.execute({ filter: { name: "sword" }, limit: 20 });
```

**List specific document type (original behavior):**
```javascript
await tool.execute({ documentType: "Actor", limit: 10 });
```

**List specific type with filtering:**
```javascript
await tool.execute({ 
  documentType: "Item", 
  filter: { type: "weapon" },
  limit: 5 
});
```

## Benefits

1. **Enhanced Discovery**: AI can now explore all available documents without knowing specific types
2. **Better User Experience**: Users can browse their entire world inventory
3. **Consistent API**: Matches the pattern established by `list_images` tool
4. **System Agnostic**: Works with any FoundryVTT game system's document collections
5. **Efficient Pagination**: Handles large world databases gracefully

## Implementation Notes

- Uses `game.collections` to dynamically discover all available document collections
- Maintains the existing `DocumentDiscovery.findCollection()` pattern for specific types
- Includes `documentType` field in results when listing all documents to identify source collection
- Provides both detailed pagination and summary statistics for optimal AI context
- Preserves all existing error handling and edge case management