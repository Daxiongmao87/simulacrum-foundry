/**
 * Document Schema Tool - Inspect schema for a specific document type
 */

import { BaseTool } from './base-tool.js';
import { DocumentAPI } from '../core/document-api.js';

class DocumentSchemaTool extends BaseTool {
  constructor() {
    super(
      'inspect_document_schema',
      'Inspect schema for a specific document type. Provide a subtype (e.g., "npc", "weapon") to get system-specific fields. Use list_document_schemas to discover available types and subtypes.',
      {
        type: 'object',
        properties: {
          documentType: {
            type: 'string',
            description: 'Document type to inspect (e.g., Actor, Item, JournalEntry)',
          },
          subtype: {
            type: 'string',
            description: 'Document subtype for system-specific fields (e.g., npc, weapon, spell). Use list_document_schemas to discover available subtypes.',
          },
        },
        required: ['documentType'],
      }
    );
  }

  async execute(params) {
    const schema = DocumentAPI.getDocumentSchema(params.documentType, params.subtype);
    if (!schema) {
      return {
        content: `No schema found for document type: ${params.documentType}${params.subtype ? ` (subtype: ${params.subtype})` : ''}`,
        display: `No schema found for document type: ${params.documentType}`,
      };
    }

    const label = params.subtype
      ? `${params.documentType} (${params.subtype})`
      : params.documentType;

    const fieldCount = schema.fields?.length || 0;
    const systemCount = (schema.systemFields && schema.systemFields[0] !== '$ref')
      ? schema.systemFields.length
      : 0;
    const embeddedCount = schema.embedded?.length || 0;

    let display = `**${label}** — ${fieldCount} fields`;
    if (systemCount > 0) display += `, ${systemCount} system fields`;
    if (embeddedCount > 0) display += `, ${embeddedCount} embedded`;

    return {
      content: `Schema for ${label}:\n${JSON.stringify(schema, null, 2)}`,
      display,
    };
  }
}

export { DocumentSchemaTool };
