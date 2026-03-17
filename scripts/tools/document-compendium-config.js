/**
 * Document Compendium Config Tool - Lock/unlock compendium packs
 * Allows the AI to configure compendium pack settings
 */

import { BaseTool } from './base-tool.js';
import { SimulacrumError } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('DocumentCompendiumConfigTool');

/**
 * Tool for locking and unlocking compendium packs
 */
export class DocumentCompendiumConfigTool extends BaseTool {
  constructor() {
    const schema = {
      type: 'object',
      properties: {
        packId: {
          type: 'string',
          description:
            'The full compendium pack ID (e.g., "world.my-compendium", "module-name.pack-name"). Use `list_documents` with `documentType` set to "Compendium" to discover available pack IDs. For the `create` action, provide the target pack name consisting only of lowercase letters and hyphens (e.g. "my-custom-items").',
        },
        action: {
          type: 'string',
          enum: ['lock', 'unlock', 'create'],
          description:
            'Whether to lock, unlock, or create the pack. Unlock before modifying pack contents, lock again after modifications are complete. Create builds a new compendium directory entirely.',
        },
        documentType: {
          type: 'string',
          enum: ['Actor', 'Item', 'JournalEntry', 'Macro', 'Cards', 'RollTable', 'Scene'],
          description:
            'The type of document the pack will store. Required only when `action` is "create".',
        },
        label: {
          type: 'string',
          description:
            'A human-readable label for the new compendium. Required only when `action` is "create".',
        },
      },
      required: ['packId', 'action'],
    };

    super(
      'configure_compendium',
      'Lock, unlock, or create a compendium pack. Packs are locked by default and must be unlocked before documents inside them can be created, updated, or deleted via `create_document`, `update_document`, or `delete_document`. Re-lock the pack after modifications are complete to prevent accidental changes. You can also create new world compendium packs using the `create` action.',
      schema,
      true // requiresConfirmation
    );
  }

  /**
   * Get parameter schema for this tool
   * @returns {Object} Parameter schema
   */
  getParameterSchema() {
    return this._addResponseParam(this.schema);
  }

  /**
   * Execute the compendium configuration
   * @param {Object} params - Tool parameters
   * @param {string} params.packId - Compendium pack ID
   * @param {string} params.action - 'lock' or 'unlock'
   * @returns {Promise<Object>} Result of the operation
   */
  async execute(params) {
    const { packId, action, documentType, label } = params;

    // Validate parameters
    this.validateParameters(params, this.schema);

    // Security check: GM only
    if (!game.user?.isGM) {
      throw new SimulacrumError('Only GMs can configure compendium packs');
    }

    if (action === 'create') {
      return this._handleCreate(packId, documentType, label);
    }

    // Get the pack for lock/unlock
    const pack = game.packs.get(packId);
    if (!pack) {
      // List available packs for helpful error
      const availablePacks = Array.from(game.packs.keys()).slice(0, 10);
      return this.handleError(
        `Compendium pack not found: "${packId}". Available packs include: ${availablePacks.join(', ')}${game.packs.size > 10 ? '...' : ''}`,
        'NotFoundError'
      );
    }

    // Determine target lock state
    const targetLocked = action === 'lock';

    // Check if already in desired state
    if (pack.locked === targetLocked) {
      const msg = `Pack "${pack.metadata.label}" is already ${action}ed`;
      return this.createSuccessResponse(msg, msg);
    }

    try {
      // Configure the pack
      await pack.configure({ locked: targetLocked });

      logger.info(`Compendium pack "${packId}" ${action}ed successfully`);

      const msg = `Successfully ${action}ed compendium pack "${pack.metadata.label}" (${pack.index.size} documents)`;
      return this.createSuccessResponse(msg, msg);
    } catch (error) {
      return this.handleError(error.message, error.constructor.name);
    }
  }

  /**
   * Helper to execute compendium creation
   * @private
   */
  async _handleCreate(packId, documentType, label) {
    if (!documentType || !label) {
      throw new SimulacrumError('documentType and label are required when creating a compendium');
    }

    // Check if pack already exists
    const fullPackId = packId.includes('.') ? packId : `world.${packId}`;
    if (game.packs.has(fullPackId)) {
      return this.handleError(`Compendium pack "${fullPackId}" already exists`, 'ConflictError');
    }

    try {
      const packName = packId.includes('.') ? packId.split('.')[1] : packId;
      // @ts-ignore
      const newPack = await CompendiumCollection.createCompendium({
        name: packName,
        type: documentType,
        label: label,
        packageType: 'world',
      });

      logger.info(`Compendium pack "${newPack.metadata.id}" created successfully`);
      const msg = `Successfully created compendium pack "${newPack.metadata.label}" (${newPack.metadata.id}) for ${documentType} documents.`;
      return this.createSuccessResponse(msg, msg);
    } catch (error) {
      return this.handleError(error.message, error.constructor.name);
    }
  }
}
