import { BaseTool } from './base-tool.js';

export class DocumentMoveTool extends BaseTool {
  constructor() {
    super(
      'document_move',
      'Move a document to a new location (world, folder, compendium, or embedded parent). This effectively creates a copy in the target location and deletes the original.',
      DocumentMoveTool._buildSchema(),
      true, // requires confirmation
      true  // requires response
    );
  }

  static _getLocationSchema(description) {
    return {
      type: 'object',
      description,
      properties: {
        type: {
          type: 'string',
          enum: ['world', 'compendium', 'embedded'],
          description: 'The type of location.',
        },
        pack: {
          type: 'string',
          description: 'The compendium pack ID (required if type is "compendium").',
        },
        folder: {
          type: 'string',
          description: 'The target folder ID (optional for world/compendium).',
        },
        parentId: {
          type: 'string',
          description: 'The target parent document ID (required if type is "embedded").',
        },
        parentType: {
          type: 'string',
          description: 'The type of the target parent document (required if type is "embedded").',
        },
      },
      required: ['type'],
    };
  }

  static _buildSchema() {
    return {
      type: 'object',
      properties: {
        documentType: {
          type: 'string',
          description: 'The document type (e.g., "Actor", "Item", "JournalEntry").',
        },
        sourceId: {
          type: 'string',
          description: 'The ID of the document to move.',
        },
        sourceLocation: DocumentMoveTool._getLocationSchema('The current location of the source document.'),
        targetLocation: DocumentMoveTool._getLocationSchema('The destination for the moved document.'),
        newName: {
          type: 'string',
          description: 'Optional new name for the moved document.',
        },
      },
      required: ['documentType', 'sourceId', 'sourceLocation', 'targetLocation'],
    };
  }

  async execute(args) {
    if (!this.documentAPI) {
      throw new Error('DocumentAPI not available to Tool');
    }

    const { documentType, sourceId, sourceLocation, targetLocation, newName } = args;

    if (sourceLocation.type === 'world' && targetLocation.type === 'world') {
      return this._handleWorldFolderMove(documentType, sourceId, targetLocation, newName);
    }

    const { toolRegistry } = await import('../core/tool-registry.js');
    const copyTool = toolRegistry.getTool('document_copy');
    if (!copyTool) {
       return this.createErrorResponse('Internal Error: document_copy tool not found.');
    }

    try {
      const copyResult = await copyTool.execute(args);
      if (copyResult.error) {
        return this.createErrorResponse(`Copy phase failed: ${copyResult.error}`);
      }

      await this._deleteOriginal(documentType, sourceId, sourceLocation);

      const parsed = this._parseCopyResult(copyResult, documentType);
      return this.createSuccessResponse(
        `{ "message": "Successfully moved ${documentType}", "newId": "${parsed.newId}" }`,
        `<p>Moved <strong>${parsed.docName}</strong> successfully.</p>`
      );
    } catch (e) {
      return this.createErrorResponse(`Move failed: ${e.message}`);
    }
  }

  async _handleWorldFolderMove(documentType, sourceId, targetLocation, newName) {
    try {
      const updates = {};
      if (newName) updates.name = newName;
      if (targetLocation.folder !== undefined) updates.folder = targetLocation.folder;
      
      if (Object.keys(updates).length > 0) {
          const updatedDoc = await this.documentAPI.updateDocument(
            documentType, 
            sourceId, 
            updates
          );
          return this.createSuccessResponse(
            `{ "message": "Moved ${documentType}", "id": "${updatedDoc._id}" }`,
            `<p>Moved <strong>${updatedDoc.name || 'document'}</strong></p>`
          );
      }
      return this.createSuccessResponse(
        `{ "message": "No changes made to ${documentType}" }`,
        `<p>No changes needed.</p>`
      );
    } catch(e) {
      return this.createErrorResponse(`Failed to move world document: ${e.message}`);
    }
  }

  async _deleteOriginal(documentType, sourceId, location) {
    if (location.type === 'world') {
      await this.documentAPI.deleteDocument(documentType, sourceId);
    } else if (location.type === 'compendium') {
      const packCollection = game.packs.get(location.pack);
      if (!packCollection) throw new Error(`Target pack not found: ${location.pack}`);
      if (packCollection.locked) throw new Error(`Target pack is locked: ${location.pack}`);
      const doc = await packCollection.getDocument(sourceId);
      if (doc) await doc.delete();
    } else if (location.type === 'embedded') {
      await this.documentAPI.applyEmbeddedOperations(location.parentType, location.parentId, [{
         embeddedName: documentType,
         action: 'delete',
         targetId: sourceId
      }]);
    }
  }

  _parseCopyResult(copyResult, documentType) {
    let newId = "unknown";
    let docName = documentType;
    try {
       const parsedCopy = JSON.parse(copyResult.content);
       if (parsedCopy.newId) newId = parsedCopy.newId;
       if (parsedCopy.name) docName = parsedCopy.name;
    } catch (e) {
       // Ignore parsing errors
    }
    return { newId, docName };
  }
}
