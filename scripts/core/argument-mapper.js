/* eslint-disable complexity */
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
      const documentType = getDefaultDocumentType();
      return {
        documentType,
        data: {
          name: originalArgs.document_name,
          content: originalArgs.content,
          ...(originalArgs.folder && { folder: originalArgs.folder }),
        },
        // Preserve other args like process_label
        ...Object.fromEntries(
          Object.entries(originalArgs).filter(
            ([key]) => !['document_name', 'content', 'folder'].includes(key)
          )
        ),
      };
    }

    // Pattern 2: {name, description, type} → {documentType, data}
    if ('name' in originalArgs && 'type' in originalArgs) {
      return {
        documentType: originalArgs.type,
        data: {
          name: originalArgs.name,
          ...(originalArgs.description && { description: originalArgs.description }),
          ...(originalArgs.img && { img: originalArgs.img }),
        },
        // Preserve other args
        ...Object.fromEntries(
          Object.entries(originalArgs).filter(
            ([key]) => !['name', 'description', 'type', 'img'].includes(key)
          )
        ),
      };
    }
  }

  // Handle other tool compatibility patterns as needed
  return originalArgs;
}

/**
 * Get the first available manipulable document type as fallback
 */
export function getDefaultDocumentType() {
  const availableTypes = Object.keys(game?.documentTypes || {}).filter(type => {
    const collection = game?.collections?.get(type);
    return collection !== undefined;
  });

  return availableTypes[0] || null;
}
