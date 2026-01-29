/**
 * Browse Folders Tool - Browse folder contents and search for folders
 */

import { BaseTool } from './base-tool.js';
import { assetIndexService } from '../core/asset-index-service.js';

export class BrowseFoldersTool extends BaseTool {
    constructor() {
        super(
            'browse_folders',
            'Browse folder contents or search for folders by name. Use to explore file structure and find asset directories.',
            {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['browse', 'search'],
                        description: '"browse" lists contents of a specific folder, "search" finds folders by name',
                    },
                    path: {
                        type: 'string',
                        description: 'For browse: folder path to list (e.g. "assets/tokens"). For search: folder name to search for.',
                    },
                    source: {
                        type: 'string',
                        enum: ['data', 'public', 'all'],
                        default: 'data',
                        description: 'Source to browse/search: "data" (User Data), "public" (Core), "all" (search only)',
                    },
                },
                required: ['action', 'path'],
            }
        );

        this.MAX_RESULTS = 50;
    }

    async execute(params) {
        const { action, path, source = 'data' } = params;

        try {
            if (action === 'browse') {
                return await this._browse(path, source);
            } else if (action === 'search') {
                return await this._search(path, source);
            } else {
                return {
                    content: `Unknown action: ${action}`,
                    display: `Unknown action: ${action}`,
                    error: { message: `Unknown action: ${action}`, type: 'INVALID_ACTION' }
                };
            }
        } catch (error) {
            return {
                content: `Failed to ${action} folders: ${error.message}`,
                display: `Error: ${error.message}`,
                error: { message: error.message, type: 'BROWSE_FAILED' }
            };
        }
    }

    async _browse(path, source) {
        const result = await assetIndexService.browseFolder(path, source === 'all' ? 'data' : source);
        
        const folderCount = result.folders.length;
        const fileCount = result.files.length;

        if (folderCount === 0 && fileCount === 0) {
            return {
                content: `Folder "${path}" is empty.`,
                display: `Folder "${path}" is empty`
            };
        }

        // Format for AI - full details
        const content = {
            path: path,
            folders: result.folders,
            files: result.files
        };

        // Format for user - just counts
        const display = `${folderCount} folder${folderCount !== 1 ? 's' : ''}, ${fileCount} file${fileCount !== 1 ? 's' : ''} in "${path}"`;

        return {
            content: JSON.stringify(content, null, 2),
            display: display
        };
    }

    async _search(query, source) {
        const sourceFilter = source === 'all' ? 'all' : (source === 'public' ? 'core' : 'user');
        const results = await assetIndexService.searchFolders(query, sourceFilter, this.MAX_RESULTS);
        const stats = assetIndexService.getStats();

        if (results.length === 0) {
            return {
                content: `No folders found matching "${query}".`,
                display: `No folders found matching "${query}". (Index: ${stats.folderCount} folders)`
            };
        }

        const count = results.length;
        const display = `Found ${count} folder${count !== 1 ? 's' : ''} matching "${query}"`;

        return {
            content: JSON.stringify(results, null, 2),
            display: display
        };
    }
}
