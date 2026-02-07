/**
 * Asset Search Tool - Search for files in User/Core data using indexed search
 */

import { BaseTool } from './base-tool.js';
import { assetIndexService } from '../core/asset-index-service.js';

const BASE_DESCRIPTION =
    'Search for files (images, audio, etc.) in User Data (assets, modules, worlds) and Core Data.';

export class AssetSearchTool extends BaseTool {
    constructor() {
        super(
            'search_assets',
            BASE_DESCRIPTION, // Will be overridden by getter
            {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Filename or path segment to search for (e.g. "potion", "sword.png")',
                    },
                    type: {
                        type: 'string',
                        enum: ['image', 'audio', 'video', 'text', 'font', 'any'],
                        default: 'any',
                        description: 'Type of file to search for (filters by extension)',
                    },
                    source: {
                        type: 'string',
                        enum: ['all', 'user', 'core'],
                        default: 'all',
                        description: 'Where to search: "user" (Use Data), "core" (Foundry Core), or "all"',
                    },
                },
                required: ['query'],
            }
        );

    }

    /**
     * Dynamic description based on index availability
     */
    get description() {
        const availability = assetIndexService.getAvailability();
        if (!availability.available) {
            return `[UNAVAILABLE: ${availability.reason}] ${BASE_DESCRIPTION}`;
        }
        const stats = assetIndexService.getStats();
        return `${BASE_DESCRIPTION} Index contains ${stats.fileCount} files.`;
    }

    // Prevent setting description (it's computed)
    set description(_value) {
        // no-op
    }

    async execute(params) {
        const { query, type = 'any', source = 'all' } = params;

        // Check availability before searching
        const availability = assetIndexService.getAvailability();
        if (!availability.available) {
            return {
                content: `Asset search unavailable: ${availability.reason}`,
                display: `Asset search unavailable: ${availability.reason}`,
                error: { message: availability.reason, type: 'INDEX_UNAVAILABLE' },
            };
        }

        try {
            const results = await assetIndexService.search(query, type, source);
            const stats = assetIndexService.getStats();

            return this._formatResults(results, query, stats);
        } catch (error) {
            return {
                content: `Failed to search assets: ${error.message}`,
                display: `Error searching assets: ${error.message}`,
                error: { message: error.message, type: 'SEARCH_FAILED' },
            };
        }
    }

    _formatResults(results, query, stats) {
        if (results.length === 0) {
            return {
                content: `No assets found matching "${query}".`,
                display: `No assets found matching "${query}". (Index: ${stats.fileCount} files)`
            };
        }

        const count = results.length;
        // Display just shows count - AI gets full list in content
        const display = `Found ${count} asset${count !== 1 ? 's' : ''} matching "${query}"`;

        return {
            content: JSON.stringify(results, null, 2),
            display: display
        };
    }
}
