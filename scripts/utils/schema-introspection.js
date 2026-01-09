/**
 * Schema Introspection Utilities
 * Shared helpers for detecting document references in Foundry v13-like schemas.
 */

/**
 * Detect references within a document class' schema.
 * Supports ForeignDocumentField and ArrayField<ForeignDocumentField> under system.*.
 *
 * @param {object} documentClass - Foundry document class (or mock) with schema
 * @returns {object} Map of reference field -> metadata
 */
export function detectDocumentReferences(documentClass) {
  const references = {};
  if (!documentClass?.schema || typeof documentClass.schema.getField !== 'function') {
    return references;
  }

  const systemSchema = documentClass.schema.getField('system');
  const fields = systemSchema && systemSchema.fields ? systemSchema.fields : null;
  if (!fields) return references;

  for (const [fieldName, field] of Object.entries(fields)) {
    const ctor = field?.constructor?.name;

    // Single foreign document reference
    if (ctor === 'ForeignDocumentField') {
      references[fieldName] = {
        field: fieldName,
        documentType: field?.model?.documentName,
        path: `system.${fieldName}`,
        type: 'reference',
        required: Boolean(field?.required),
      };
      continue;
    }

    // Array of foreign document references
    if (ctor === 'ArrayField') {
      const elemCtor = field?.element?.constructor?.name;
      if (elemCtor === 'ForeignDocumentField') {
        references[fieldName] = {
          field: fieldName,
          documentType: field?.element?.model?.documentName,
          path: `system.${fieldName}`,
          type: 'array',
          required: Boolean(field?.required),
        };
      }
    }
  }

  return references;
}

export default { detectDocumentReferences };
