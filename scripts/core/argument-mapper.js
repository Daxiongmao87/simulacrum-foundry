/**
 * Argument compatibility mapper for fallback tool calls
 * Converts various argument patterns to proper tool schemas
 */

/**
 * Map fallback tool arguments to proper tool schema format
 */
export function mapFallbackArguments(toolName, originalArgs) {
  if (!originalArgs || typeof originalArgs !== 'object') {
    return originalArgs;
  }

  // Handle create_document schema compatibility
  if (toolName === 'create_document') {
    // Pattern 1: {document_name, content} → {documentType, data}
    if ('document_name' in originalArgs && 'content' in originalArgs) {
      const documentType = guessDocumentType(originalArgs);
      return {
        documentType,
        data: {
          name: originalArgs.document_name,
          content: originalArgs.content,
          ...(originalArgs.folder && { folder: originalArgs.folder })
        },
        // Preserve other args like process_label
        ...Object.fromEntries(
          Object.entries(originalArgs).filter(([key]) => 
            !['document_name', 'content', 'folder'].includes(key)
          )
        )
      };
    }
    
    // Pattern 2: {name, description, type} → {documentType, data}
    if ('name' in originalArgs && 'type' in originalArgs) {
      return {
        documentType: originalArgs.type,
        data: {
          name: originalArgs.name,
          ...(originalArgs.description && { description: originalArgs.description }),
          ...(originalArgs.img && { img: originalArgs.img })
        },
        // Preserve other args
        ...Object.fromEntries(
          Object.entries(originalArgs).filter(([key]) => 
            !['name', 'description', 'type', 'img'].includes(key)
          )
        )
      };
    }
  }

  // Handle other tool compatibility patterns as needed
  return originalArgs;
}

/**
 * Intelligently guess document type based on content and context
 */
export function guessDocumentType(args) {
  const content = String(args.content || args.description || '').toLowerCase();
  const name = String(args.document_name || args.name || '').toLowerCase();
  
  // Try to determine document type from content patterns
  const patterns = [
    { keywords: ['damage:', 'weapon', 'sword', 'dagger'], type: 'Item' },
    { keywords: ['spell', 'magic'], type: 'Item' },
    { keywords: ['character', 'npc'], type: 'Actor' },
    { keywords: ['scene', 'location'], type: 'Scene' },
    { keywords: ['journal', 'lore', 'note'], type: 'JournalEntry' }
  ];
  
  for (const pattern of patterns) {
    if (pattern.keywords.some(keyword => 
      content.includes(keyword) || name.includes(keyword)
    )) {
      return pattern.type;
    }
  }
  
  // Default fallback - try to use a common document type
  try {
    const availableTypes = Object.keys(CONFIG?.Document?.documentTypes || {});
    const preferredTypes = ['Item', 'Actor', 'JournalEntry'];
    
    for (const preferred of preferredTypes) {
      if (availableTypes.includes(preferred)) {
        return preferred;
      }
    }
    
    return availableTypes[0] || 'Item'; // Fallback to first available or Item
  } catch (_e) {
    return 'Item'; // Ultimate fallback
  }
}