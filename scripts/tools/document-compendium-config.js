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
                        'The full compendium pack ID (e.g., "world.my-compendium" or "module-name.pack-name"). Use list_documents with document_type="Compendium" to discover available packs.',
                },
                action: {
                    type: 'string',
                    enum: ['lock', 'unlock'],
                    description: 'Whether to lock or unlock the compendium pack',
                },
            },
            required: ['pack_id', 'action'],
        };

        super(
            'configure_compendium',
            'Lock or unlock a compendium pack. Locked packs cannot be modified until unlocked. Use this before/after modifying compendium contents.',
            schema,
            true // requiresConfirmation
        );
    }

    /**
     * Get parameter schema for this tool
     * @returns {Object} Parameter schema
     */
    getParameterSchema() {
        return this.schema;
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
                new SimulacrumError(
                    `Compendium pack not found: "${pack_id}". Available packs include: ${availablePacks.join(', ')}${game.packs.size > 10 ? '...' : ''}`
                ),
                { pack_id, action }
            );
        }

        // Determine target lock state
        const targetLocked = action === 'lock';

        // Check if already in desired state
        if (pack.locked === targetLocked) {
            return this.createSuccessResponse({
                pack_id,
                action,
                status: 'no_change',
                message: `Pack "${pack.metadata.label}" is already ${action}ed`,
                locked: pack.locked,
            });
        }

        try {
            // Configure the pack
            await pack.configure({ locked: targetLocked });

            logger.info(`Compendium pack "${pack_id}" ${action}ed successfully`);

            return this.createSuccessResponse({
                pack_id,
                pack_label: pack.metadata.label,
                action,
                status: 'success',
                message: `Successfully ${action}ed compendium pack "${pack.metadata.label}"`,
                locked: pack.locked,
                document_count: pack.index.size,
            });
        } catch (error) {
            return this.handleError(error, { pack_id, action });
        }
    }
}
