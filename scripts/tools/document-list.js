/**
 * Document List Tool - List documents of any type available in current system
 */

import { BaseTool } from './base-tool.js';
import { DocumentAPI } from '../core/document-api.js';

class DocumentListTool extends BaseTool {
  /**
   * Create a new Document List Tool
   */
  constructor() {
    super(
      'list_documents',
      'List documents by type, returning names, IDs, and UUID references. Use this to browse or inventory documents when you do not have a specific search term — for targeted text searches, use `search_documents` instead. Omit `documentType` to list all available document types with counts. Pass `documentType` as "Compendium" to list available compendium packs.',
      {
        type: 'object',
        properties: {
          documentType: {
            type: 'string',
            description: 'The document class to list (e.g., Actor, Item, JournalEntry, RollTable, Folder). Omit to list all available document types with counts. Pass "Compendium" to list compendium packs.',
          },
          filters: {
            type: 'object',
            description: 'An object of filter criteria to narrow results (e.g., `{"name": "Goblin", "folder": "folderId"}`). Applied as field-level matches.',
          },
          includeCompendiums: {
            type: 'boolean',
            default: false,
            description: 'Whether to also include documents from compendium packs in the results. Defaults to false. Prefer using the `pack` parameter to target a specific compendium.',
          },
          pack: {
            type: 'string',
            description: 'A specific compendium pack ID to list documents from (e.g., "dnd5e.monsters"). When set, only documents from this pack are returned.',
          },
        },
      }
    );
  }

  /**
   * Execute the tool
   * @param {Object} params - Tool parameters
   * @returns {Object} Tool result
   */
  async execute(params) {
    // If no documentType specified, list all available document types
    if (!params.documentType) {
      return this.listAllDocumentTypes();
    }

    // If documentType is "Compendium", list available packs
    if (params.documentType === 'Compendium') {
      const packs = DocumentAPI.listPacks();
      return {
        content: this.formatPackList(packs),
        display: `Found **${packs.length}** Compendium Packs`,
      };
    }

    // Validate document type exists in current system (unless reading from a pack, which might have its own types)
    // Actually, even in packs, types should be valid.
    if (params.documentType && !this.isValidDocumentType(params.documentType) && !params.pack) {
      return {
        content: 'Document type "' + params.documentType + '" not available in current system',
        display: 'Unknown document type: ' + params.documentType,
        error: { message: 'Invalid document type', type: 'UNKNOWN_DOCUMENT_TYPE' },
      };
    }

    try {
      const documents = await DocumentAPI.listDocuments(params.documentType, {
        filters: params.filters,
        pack: params.pack
      });

      return {
        content: this.formatDocumentList(documents, params.documentType),
        display: `Found **${documents.length}** ${params.documentType || ''} documents`,
      };
    } catch (error) {
      return {
        content: 'Failed to list documents: ' + error.message,
        display: 'Error listing documents: ' + error.message,
        error: { message: error.message, type: 'LIST_FAILED' },
      };
    }
  }

  /**
   * List all available document types
   * @returns {Object} Tool result with document types
   */
  listAllDocumentTypes() {
    try {
      const documentTypes = DocumentAPI.getAllDocumentTypes();

      if (documentTypes.length === 0) {
        return {
          content: 'No document types available',
          display: 'No document types available in current system',
        };
      }

      // Try to get sample documents for each type to show names
      const typeInfo = documentTypes.map(type => {
        try {
          const collection = game.collections.get(type);
          if (collection && collection.contents && collection.contents.length > 0) {
            // Get a few sample document names
            const samples = collection.contents.slice(0, 3).map(doc => {
              const obj = doc.toObject ? doc.toObject() : doc;
              return obj.name || obj._id || 'Unnamed';
            });
            return type + ' (' + collection.contents.length + ' documents): ' + samples.join(', ');
          } else {
            return type + ' (0 documents)';
          }
        } catch (e) {
          return type + ' (Unknown)';
        }
      });

      return {
        content: '**Available Document Types**\n' + typeInfo.join('\n'),
        display: `Found **${documentTypes.length}** document types`,
      };
    } catch (error) {
      return {
        content: 'Failed to list document types: ' + error.message,
        display: 'Error listing document types: ' + error.message,
        error: { message: error.message, type: 'LIST_TYPES_FAILED' },
      };
    }
  }

  /**
   * Format document list for display
   * @param {Array} documents - Documents to format
   * @param {string} documentType - Document type
   * @returns {string} Formatted document list
   */
  formatDocumentList(documents, documentType) {
    if (documents.length === 0) {
      return 'No ' + (documentType || '') + ' documents found';
    }

    // Format each document with its name and UUID
    const formattedDocs = documents.map(doc => {
      const name = doc.name || 'Unnamed';
      const id = doc.id || doc._id || 'Unknown ID';
      let uuid = doc.uuid;

      // Construct UUID if missing (e.g. from plain objects)
      if (!uuid) {
        if (doc.pack) {
          uuid = `Compendium.${doc.pack}.${id}`;
        } else {
          // Document types in Foundry are generally the constructor name
          // But here we likely have the type name passed in params or need to guess
          const type = doc.documentName || documentType;
          if (type) {
            uuid = `${type}.${id}`;
          }
        }
      }

      // Fallback if we still can't determine UUID
      if (uuid) {
        return `@UUID[${uuid}]{${name}} (id: ${id})`;
      } else {
        return `${name} (id: ${id})`;
      }
    });

    const docsToShow = formattedDocs.slice(0, 20);
    const moreText =
      formattedDocs.length > 20 ? '\n... and ' + (formattedDocs.length - 20) + ' more' : '';
    return (
      '**' +
      documentType +
      ' Documents** (' +
      documents.length +
      ' total):\n' +
      docsToShow.join('\n') +
      moreText
    );
  }

  /**
   * Group documents by type
   * @param {Array} documents - Documents to group
   * @returns {Object} Grouped documents
   */
  groupByType(documents) {
    const grouped = {};
    documents.forEach(doc => {
      const type = doc.documentName || doc.type || 'Unknown';
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(doc);
    });
    return grouped;
  }

  /**
   * Format pack list for display
   * @param {Array} packs - Packs to format
   * @returns {string} Formatted pack list
   */
  formatPackList(packs) {
    if (packs.length === 0) return 'No Compendium Packs found.';

    const lines = packs.map(p => {
      return `- **${p.title}** (${p.id}) [${p.documentName}, ${p.count} docs]`;
    });

    return '**Available Compendium Packs**:\n' + lines.join('\n');
  }
}

// Export the DocumentListTool class
export { DocumentListTool };
