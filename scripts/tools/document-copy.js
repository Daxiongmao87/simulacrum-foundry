import { BaseTool } from './base-tool.js';

export class DocumentCopyTool extends BaseTool {
  constructor() {
    super(
      'document_copy',
      'Create a duplicate of a document in a target location (world, folder, compendium, or embedded parent).',
      DocumentCopyTool._buildSchema(),
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
          description: 'The ID of the document to copy.',
        },
        sourceLocation: DocumentCopyTool._getLocationSchema('The location of the source document.'),
        targetLocation: DocumentCopyTool._getLocationSchema('The destination for the copied document.'),
        newName: {
          type: 'string',
          description: 'Optional new name for the copied document.',
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

    try {
      const sourceData = await this._resolveSource(documentType, sourceId, sourceLocation);
      if (!sourceData) {
        return this.createErrorResponse(`Source document not found: ${sourceId}`);
      }

      const cloneData = this._prepareClone(sourceData, newName, targetLocation);
      
      const { createdDoc, targetDesc } = await this._createTarget(
        documentType, 
        cloneData, 
        targetLocation
      );

      return this.createSuccessResponse(
        `{ "message": "Successfully copied ${documentType} to ${targetDesc}", ` +
        `"newId": "${createdDoc._id}", "name": "${createdDoc.name}" }`,
        `<p>Copied <strong>${createdDoc.name}</strong> to <em>${targetDesc}</em></p>`
      );
    } catch (e) {
      return this.createErrorResponse(`Copy failed: ${e.message}`);
    }
  }

  async _resolveSource(documentType, sourceId, location) {
    if (location.type === 'world') {
      return await this.documentAPI.getDocument(documentType, sourceId);
    } 
    if (location.type === 'compendium') {
      if (!location.pack) throw new Error('sourceLocation.pack is required');
      return await this.documentAPI.getDocument(documentType, sourceId, { pack: location.pack });
    } 
    if (location.type === 'embedded') {
      if (!location.parentId || !location.parentType) {
        throw new Error('sourceLocation parentId and parentType required');
      }
      const pType = location.parentType;
      const parentDoc = await this.documentAPI.getDocumentInstance(pType, location.parentId);
      const embeddedCollection = parentDoc.getEmbeddedCollection(documentType);
      if (!embeddedCollection) {
        throw new Error(`Parent lacks collection '${documentType}'`);
      }
      const embeddedDoc = embeddedCollection.get(sourceId);
      if (!embeddedDoc) {
        throw new Error(`Embedded doc ${sourceId} not found in parent`);
      }
      return embeddedDoc.toObject();
    }
    throw new Error(`Unknown source location type: ${location.type}`);
  }

  _prepareClone(sourceData, newName, targetLocation) {
    const cloneData = foundry.utils.deepClone(sourceData);
    delete cloneData._id;
    if (cloneData.ownership) delete cloneData.ownership;
    if (cloneData.folder) delete cloneData.folder;
    if (newName) cloneData.name = newName;
    if (targetLocation.folder) cloneData.folder = targetLocation.folder;
    return cloneData;
  }

  async _createTarget(documentType, cloneData, location) {
    if (location.type === 'world') {
      const createdDoc = await this.documentAPI.createDocument(documentType, cloneData);
      return { createdDoc, targetDesc: 'World' };
    } 
    
    if (location.type === 'compendium') {
      if (!location.pack) throw new Error('targetLocation.pack is required');
      const packCollection = game.packs.get(location.pack);
      if (!packCollection) throw new Error(`Target pack not found: ${location.pack}`);
      if (packCollection.locked) throw new Error(`Target pack is locked: ${location.pack}`);
      const created = await CONFIG[documentType].documentClass.create(cloneData, { 
        pack: location.pack 
      });
      return { createdDoc: created.toObject(), targetDesc: `Compendium (${location.pack})` };
    } 
    
    if (location.type === 'embedded') {
      if (!location.parentId || !location.parentType) {
        throw new Error('targetLocation parentId and parentType required');
      }
      await this.documentAPI.applyEmbeddedOperations(location.parentType, location.parentId, [{
         embeddedName: documentType,
         action: 'insert',
         data: cloneData
      }]);
      const targetDesc = `Embedded (${location.parentType}: ${location.parentId})`;
      const createdDoc = { name: cloneData.name, _id: "embedded_copied", ...cloneData };
      return { createdDoc, targetDesc };
    }
    
    throw new Error(`Unknown target location type: ${location.type}`);
  }
}
