/**
 * Asset Search Tool - Search for files in User/Core data
 */

import { BaseTool } from './base-tool.js';

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

        // Limits to prevent freezing
        this.MAX_DEPTH = 4;
        this.MAX_RESULTS = 50;

        // Extensions mapping
        this.EXTENSIONS = {
            image: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'],
            audio: ['.mp3', '.ogg', '.wav', '.flac', '.m4a'],
            video: ['.mp4', '.webm', '.mkv'],
            text: ['.txt', '.md', '.json', '.js', '.css'],
            font: ['.ttf', '.otf', '.woff', '.woff2']
        };
    }

    async execute(params) {
        const { query, type = 'any', source = 'all' } = params;
        const lowerQuery = query.toLowerCase();

        try {
            const results = [];

            // Define roots to search
            const roots = [];
            if (source === 'all' || source === 'user') {
                roots.push({ source: 'data', path: 'assets' });
                roots.push({ source: 'data', path: 'modules' });
                roots.push({ source: 'data', path: 'systems' });
                roots.push({ source: 'data', path: 'worlds' });
            }
            if (source === 'all' || source === 'core') {
                roots.push({ source: 'public', path: 'icons' }); // V10+ uses 'public' usually, or try 'core' if fails
                roots.push({ source: 'public', path: 'sounds' });
            }

            for (const root of roots) {
                if (results.length >= this.MAX_RESULTS) break;
                try {
                    await this._searchRecursive(root.source, root.path, lowerQuery, type, 0, results);
                } catch (err) {
                    // Ignore errors for specific roots (e.g. if 'assets' doesn't exist)
                    this.logger.warn(`Failed to search ${root.path}`, err);
                }
            }

            return this._formatResults(results, query);

        } catch (error) {
            return {
                content: `Failed to search assets: ${error.message}`,
                display: `❌ Error searching assets: ${error.message}`,
                error: { message: error.message, type: 'SEARCH_FAILED' }
            };
        }
    }

    async _searchRecursive(source, path, query, type, depth, results) {
        if (results.length >= this.MAX_RESULTS) return;
        if (depth > this.MAX_DEPTH) return;

        try {
            const result = await FilePicker.browse(source, path);

            // Check files in current directory
            for (const file of result.files) {
                if (results.length >= this.MAX_RESULTS) return;

                // File is a full URL/Path string
                const filename = file.split('/').pop().toLowerCase();

                // Check match
                if (filename.includes(query)) {
                    // Check Type
                    if (this._matchesType(filename, type)) {
                        results.push(file);
                    }
                }
            }

            // Recurse into subdirectories
            for (const dir of result.dirs) {
                if (results.length >= this.MAX_RESULTS) return;

                // Skip hidden folders and potentially huge ones if needed
                const dirname = dir.split('/').pop();
                if (dirname.startsWith('.')) continue; // Skip hidden
                if (dirname === 'node_modules') continue; // Skip huge dep folders

                // FilePicker browse expects the path relative to source root usually
                // but result.dirs returns full paths usually decoded.
                // We need to be careful with paths. FilePicker returns decoded URL paths?
                // Usually FilePicker.browse returns `dirs` as array of strings which are paths relative to source if source=data?
                // Actually it varies. Best to use the string provided in `dirs` but we might need to verify format.
                // In Foundry V10, `result.dirs` are paths (e.g. "modules/simulacrum").

                await this._searchRecursive(source, dir, query, type, depth + 1, results);
            }

        } catch (err) {
            // Access denied or path invalid - skip
        }
    }

    _matchesType(filename, type) {
        if (type === 'any') return true;
        const exts = this.EXTENSIONS[type];
        if (!exts) return true;
        return exts.some(ext => filename.endsWith(ext));
    }

    _formatResults(results, query) {
        if (results.length === 0) {
            return {
                content: `No assets found matching "${query}".`,
                display: `No assets found matching "${query}".`
            };
        }

        const count = results.length;
        const display = `**Found ${count} assets matching "${query}"**\n` +
            results.map(path => `- [${path.split('/').pop()}](${path})`).join('\n');

        return {
            content: JSON.stringify(results, null, 2),
            display: display
        };
    }
}
