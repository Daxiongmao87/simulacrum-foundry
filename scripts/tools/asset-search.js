/**
 * Asset Search Tool - Search for files in User/Core data using indexed search
 */

import { BaseTool } from './base-tool.js';
import { assetIndexService } from '../core/asset-index-service.js';

export class AssetSearchTool extends BaseTool {
    constructor() {
        super(
            'search_assets',
            'Search for files (images, audio, etc.) in User Data (assets, modules, worlds) and Core Data.',
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

        this.MAX_RESULTS = 50;
    }

    async execute(params) {
        const { query, type = 'any', source = 'all' } = params;

        try {
            // Use the indexed search (awaits initial index if needed)
            const results = await assetIndexService.search(query, type, source, this.MAX_RESULTS);
            const stats = assetIndexService.getStats();

            return this._formatResults(results, query, stats);

        } catch (error) {
            return {
                content: `Failed to search assets: ${error.message}`,
                display: `Error searching assets: ${error.message}`,
                error: { message: error.message, type: 'SEARCH_FAILED' }
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
