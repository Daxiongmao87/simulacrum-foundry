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
                pack_id: {
                    type: 'string',
                    description:
                        'The full compendium pack ID (e.g., "world.my-compendium", "module-name.pack-name"). Use `list_documents` with `documentType` set to "Compendium" to discover available pack IDs.',
                },
                action: {
                    type: 'string',
                    enum: ['lock', 'unlock'],
                    description: 'Whether to lock or unlock the pack. Unlock before modifying pack contents, lock again after modifications are complete.',
                },
            },
            required: ['pack_id', 'action'],
        };

        super(
            'configure_compendium',
            'Lock or unlock a compendium pack. Packs are locked by default and must be unlocked before documents inside them can be created, updated, or deleted via `create_document`, `update_document`, or `delete_document`. Re-lock the pack after modifications are complete to prevent accidental changes.',
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
     * @param {string} params.pack_id - Compendium pack ID
     * @param {string} params.action - 'lock' or 'unlock'
     * @returns {Promise<Object>} Result of the operation
     */
    async execute(params) {
        const { pack_id, action } = params;

        // Validate parameters
        this.validateParameters(params, this.schema);

        // Security check: GM only
        if (!game.user?.isGM) {
            throw new SimulacrumError('Only GMs can configure compendium packs');
        }

        // Get the pack
        const pack = game.packs.get(pack_id);
        if (!pack) {
            // List available packs for helpful error
            const availablePacks = Array.from(game.packs.keys()).slice(0, 10);
            return this.handleError(
                `Compendium pack not found: "${pack_id}". Available packs include: ${availablePacks.join(', ')}${game.packs.size > 10 ? '...' : ''}`,
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

            logger.info(`Compendium pack "${pack_id}" ${action}ed successfully`);

            const msg = `Successfully ${action}ed compendium pack "${pack.metadata.label}" (${pack.index.size} documents)`;
            return this.createSuccessResponse(msg, msg);
        } catch (error) {
            return this.handleError(error.message, error.constructor.name);
        }
    }
}
