/**
 * Document Schema List Tool - List all document types with subtypes and counts
 */

import { BaseTool } from './base-tool.js';

class DocumentSchemaListTool extends BaseTool {
  constructor() {
    super(
      'list_document_schemas',
      'List all available document types with their subtypes and document counts. Returns each type\'s name, available subtypes (e.g., "npc", "weapon"), world document count, and compendium pack count. Use this as the starting point to discover what types and subtypes exist before calling `inspect_document_schema` for detailed field information.',
      { type: 'object', properties: {} }
    );
  }

  async execute() {
    const types = this.#getAllDocumentTypesWithSubtypes();
    return {
      content: `Available document types:\n${JSON.stringify(types, null, 2)}`,
      display: `Found **${types.length}** document types`,
    };
  }

  #getAllDocumentTypesWithSubtypes() {
    return Object.keys(game?.documentTypes || {})
      .filter(type => game?.collections?.get(type) !== undefined)
      .sort()
      .map(type => {
        const subtypes = game.documentTypes[type] || [];
        const world = game.collections.get(type)?.size || 0;
        const compendiums = game.packs?.filter(p => p.documentName === type).length ?? 0;
        return { name: type, subtypes, world, compendiums };
      });
  }

}

export { DocumentSchemaListTool };
