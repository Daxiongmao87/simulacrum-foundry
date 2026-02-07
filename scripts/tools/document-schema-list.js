/**
 * Document Schema List Tool - List all document types with subtypes and counts
 */

import { BaseTool } from './base-tool.js';

class DocumentSchemaListTool extends BaseTool {
  constructor() {
    super(
      'list_document_schemas',
      'List all available document types, their subtypes, and document counts. Use this to discover what document types and subtypes are available before inspecting a specific schema.',
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
        const compendiums = game.packs.filter(p => p.documentName === type).length;
        return { name: type, subtypes, world, compendiums };
      });
  }

}

export { DocumentSchemaListTool };
