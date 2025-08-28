/**
 * Safe JSON serialization utility that handles circular references
 * and other problematic objects in FoundryVTT modules.
 */

/**
 * Safely converts an object to a JSON string, handling circular references.
 * @param {any} value - The value to serialize
 * @param {Function} replacer - Optional replacer function
 * @param {string|number} space - Optional space parameter for formatting
 * @returns {string} JSON string or error message if serialization fails
 */
export function safeStringify(value, replacer = null, space = null) {
  try {
    const seen = new WeakSet();

    const circularReplacer = (key, val) => {
      // Apply custom replacer first if provided
      if (replacer && typeof replacer === 'function') {
        val = replacer(key, val);
      }

      // Handle circular references
      if (val !== null && typeof val === 'object') {
        if (seen.has(val)) {
          return '[Circular Reference]';
        }
        seen.add(val);
      }

      // Handle special FoundryVTT objects that can cause issues
      if (val && typeof val === 'object' && val.constructor) {
        const constructorName = val.constructor.name;

        // Handle FoundryVTT field objects that commonly have circular references
        if (
          constructorName.endsWith('Field') ||
          constructorName.includes('Schema')
        ) {
          return {
            type: constructorName,
            fieldType: val.type || 'unknown',
            required: val.required || false,
            nullable: val.nullable || false,
            initial: val.initial,
            // Exclude parent references and other circular properties
            _circular: 'FoundryVTT field object sanitized',
          };
        }

        // Handle Document objects
        if (constructorName.includes('Document')) {
          return {
            type: constructorName,
            id: val.id,
            name: val.name,
            _circular: 'FoundryVTT document object sanitized',
          };
        }
      }

      return val;
    };

    return JSON.stringify(value, circularReplacer, space);
  } catch (error) {
    game.simulacrum?.logger?.warn('Safe JSON serialization failed:', error);
    return `[Serialization Error: ${error.message}]`;
  }
}

/**
 * Safely formats tool results for AI consumption, handling problematic objects.
 * @param {any} result - The result object to format
 * @param {number} maxLength - Maximum length before truncation
 * @returns {string} Formatted result string
 */
export function formatToolResult(result, maxLength = 1000) {
  const resultStr = safeStringify(result);

  if (resultStr.length > maxLength) {
    return resultStr.substring(0, maxLength) + '...[truncated]';
  }

  return resultStr;
}
