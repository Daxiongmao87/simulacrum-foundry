/**
 * Document Ownership Tool - Set ownership permissions on documents
 * Allows the AI to manage document permissions for players
 */

import { BaseTool } from './base-tool.js';
import { SimulacrumError } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('DocumentOwnershipTool');

/**
 * Foundry VTT ownership levels
 * @enum {number}
 */
const OWNERSHIP_LEVELS = {
    NONE: 0,      // No access
    LIMITED: 1,   // Limited access (can see name, basic info)
    OBSERVER: 2,  // Can view but not edit
    OWNER: 3,     // Full control
};

/**
 * Tool for setting document ownership permissions
 */
export class DocumentOwnershipTool extends BaseTool {
    constructor() {
        const schema = {
            type: 'object',
            properties: {
                document_type: {
                    type: 'string',
                    description:
                        'The document type (e.g., "Actor", "Item", "JournalEntry", "Scene", "RollTable", "Playlist", "Macro", "Cards")',
                },
                document_id: {
                    type: 'string',
                    description: 'The document ID to set ownership for',
                },
                ownership: {
                    type: 'object',
                    description:
                        'Ownership object mapping user IDs to permission levels. Use "default" key for default permission level. Permission levels: 0=None, 1=Limited, 2=Observer, 3=Owner. Example: {"default": 1, "userId123": 3}',
                },
            },
            required: ['document_type', 'document_id', 'ownership'],
        };

        super(
            'set_document_ownership',
            'Set ownership permissions for a Foundry VTT document. Controls which players can view/edit the document. Use permission levels: 0=None, 1=Limited, 2=Observer, 3=Owner.',
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
     * Execute the ownership update
     * @param {Object} params - Tool parameters
     * @param {string} params.document_type - Document type
     * @param {string} params.document_id - Document ID
     * @param {Object} params.ownership - Ownership mapping
     * @returns {Promise<Object>} Result of the operation
     */
    async execute(params) {
        const { document_type, document_id, ownership } = params;

        // Validate parameters
        this.validateParameters(params, this.schema);

        // Security check: GM only
        if (!game.user?.isGM) {
            throw new SimulacrumError('Only GMs can set document ownership');
        }

        // Validate document type
        this.validateParams({ documentType: document_type });

        // Get the collection
        const collection = game.collections.get(document_type);
        if (!collection) {
            return this.handleError(
                new SimulacrumError(`Invalid document type: "${document_type}"`),
                { document_type, document_id }
            );
        }

        // Get the document
        const doc = collection.get(document_id);
        if (!doc) {
            return this.handleError(
                new SimulacrumError(`Document not found: "${document_id}" of type "${document_type}"`),
                { document_type, document_id }
            );
        }

        // Validate ownership values
        if (!ownership || typeof ownership !== 'object') {
            return this.handleError(
                new SimulacrumError('Ownership must be an object mapping user IDs to permission levels'),
                { document_type, document_id }
            );
        }

        const validationErrors = this._validateOwnershipObject(ownership);
        if (validationErrors.length > 0) {
            return this.handleError(
                new SimulacrumError(`Invalid ownership values: ${validationErrors.join(', ')}`),
                { document_type, document_id, ownership }
            );
        }

        try {
            // Store previous ownership for reporting
            const previousOwnership = foundry.utils.deepClone(doc.ownership);

            // Update the document
            await doc.update({ ownership });

            logger.info(`Ownership updated for ${document_type} "${doc.name}" (${document_id})`);

            // Build user-friendly ownership report
            const ownershipReport = this._buildOwnershipReport(doc.ownership);

            return this.createSuccessResponse({
                document_type,
                document_id,
                document_name: doc.name,
                status: 'success',
                message: `Successfully updated ownership for "${doc.name}"`,
                previous_ownership: previousOwnership,
                current_ownership: doc.ownership,
                ownership_report: ownershipReport,
            });
        } catch (error) {
            return this.handleError(error, { document_type, document_id, ownership });
        }
    }

    /**
     * Validate ownership object values
     * @param {Object} ownership - Ownership object to validate
     * @returns {Array<string>} Array of error messages
     * @private
     */
    _validateOwnershipObject(ownership) {
        const errors = [];
        const validLevels = Object.values(OWNERSHIP_LEVELS);

        for (const [key, value] of Object.entries(ownership)) {
            // Check if value is a valid ownership level
            if (!Number.isInteger(value) || !validLevels.includes(value)) {
                errors.push(`"${key}": ${value} is not a valid permission level (must be 0, 1, 2, or 3)`);
                continue;
            }

            // Check if key is 'default' or a valid user ID
            if (key !== 'default') {
                const user = game.users.get(key);
                if (!user) {
                    errors.push(`"${key}": not a valid user ID or "default"`);
                }
            }
        }

        return errors;
    }

    /**
     * Build a human-readable ownership report
     * @param {Object} ownership - Ownership object
     * @returns {Array<Object>} Array of {user, level_name, level}
     * @private
     */
    _buildOwnershipReport(ownership) {
        const levelNames = ['None', 'Limited', 'Observer', 'Owner'];
        const report = [];

        for (const [userId, level] of Object.entries(ownership)) {
            if (userId === 'default') {
                report.push({
                    user: 'Default (All Players)',
                    user_id: 'default',
                    level_name: levelNames[level] || 'Unknown',
                    level,
                });
            } else {
                const user = game.users.get(userId);
                report.push({
                    user: user?.name || 'Unknown User',
                    user_id: userId,
                    level_name: levelNames[level] || 'Unknown',
                    level,
                });
            }
        }

        return report;
    }
}
