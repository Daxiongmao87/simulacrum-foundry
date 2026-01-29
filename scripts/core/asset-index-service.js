/**
 * Asset Index Service - Maintains an index of all files for fast searching
 * 
 * Sync strategy:
 * 1. Build full index on world load
 * 2. Monkey-patch FilePicker.upload and FilePicker.createDirectory for immediate updates
 * 3. Background re-index every 5 minutes to catch external changes
 */

import { createLogger } from '../utils/logger.js';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

class AssetIndexService {
    constructor() {
        this.logger = createLogger('AssetIndexService');
        this.index = []; // Array of { path: string, source: string, filename: string }
        this.isIndexing = false;
        this.lastIndexTime = null;
        this.syncIntervalId = null;
        this.initialized = false;
        this._initialIndexPromise = null;
        this._initialIndexResolve = null;
    }

    /**
     * Initialize the service - build index and set up hooks
     */
    async initialize() {
        if (this.initialized) return;

        this.logger.info('Initializing asset index service...');

        // Create promise for initial index completion
        this._initialIndexPromise = new Promise(resolve => {
            this._initialIndexResolve = resolve;
        });

        // Monkey-patch FilePicker methods for immediate sync
        this._patchFilePicker();

        // Build initial index
        await this.rebuildIndex();

        // Resolve the initial index promise
        this._initialIndexResolve();

        // Start background sync interval
        this._startSyncInterval();

        this.initialized = true;
        this.logger.info('Asset index service initialized');
    }

    /**
     * Monkey-patch FilePicker.upload and FilePicker.createDirectory
     */
    _patchFilePicker() {
        const self = this;

        // Patch upload
        const originalUpload = FilePicker.upload;
        FilePicker.upload = async function(source, path, file, options) {
            const result = await originalUpload.call(this, source, path, file, options);
            
            // Add the uploaded file to index
            if (result?.path) {
                const filename = result.path.split('/').pop().toLowerCase();
                self.index.push({
                    path: result.path,
                    source: source,
                    filename: filename
                });
                self.logger.debug(`Added uploaded file to index: ${result.path}`);
            }
            
            return result;
        };

        // Patch createDirectory
        const originalCreateDirectory = FilePicker.createDirectory;
        FilePicker.createDirectory = async function(source, target, options) {
            const result = await originalCreateDirectory.call(this, source, target, options);
            // Directory itself doesn't need indexing, files within will be caught by upload
            // or next sync cycle
            self.logger.debug(`Directory created: ${target}`);
            return result;
        };

        this.logger.info('FilePicker methods patched for index sync');
    }

    /**
     * Start the background sync interval
     */
    _startSyncInterval() {
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
        }

        this.syncIntervalId = setInterval(() => {
            this.rebuildIndex();
        }, SYNC_INTERVAL_MS);

        this.logger.info(`Background sync scheduled every ${SYNC_INTERVAL_MS / 1000 / 60} minutes`);
    }

    /**
     * Stop the background sync
     */
    stopSync() {
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
            this.syncIntervalId = null;
        }
    }

    /**
     * Rebuild the entire index
     */
    async rebuildIndex() {
        if (this.isIndexing) {
            this.logger.debug('Index rebuild already in progress, skipping');
            return;
        }

        this.isIndexing = true;
        const startTime = Date.now();
        this.logger.info('Starting index rebuild...');

        const newIndex = [];

        // Define roots to index
        const roots = [
            { source: 'data', path: 'assets' },
            { source: 'data', path: 'modules' },
            { source: 'data', path: 'systems' },
            { source: 'data', path: 'worlds' },
            { source: 'public', path: 'icons' },
            { source: 'public', path: 'sounds' },
        ];

        for (const root of roots) {
            try {
                await this._indexRecursive(root.source, root.path, newIndex);
            } catch (err) {
                // Root might not exist, that's fine
                this.logger.debug(`Could not index ${root.source}/${root.path}: ${err.message}`);
            }
        }

        this.index = newIndex;
        this.lastIndexTime = new Date();
        this.isIndexing = false;

        const elapsed = Date.now() - startTime;
        this.logger.info(`Index rebuild complete: ${this.index.length} files indexed in ${elapsed}ms`);
    }

    /**
     * Recursively index a directory - no depth limit
     */
    async _indexRecursive(source, path, index) {
        try {
            const result = await FilePicker.browse(source, path);

            // Index all files in current directory
            for (const file of result.files) {
                const filename = file.split('/').pop().toLowerCase();
                index.push({
                    path: file,
                    source: source,
                    filename: filename
                });
            }

            // Recurse into subdirectories
            for (const dir of result.dirs) {
                const dirname = dir.split('/').pop();
                
                // Skip hidden and huge directories
                if (dirname.startsWith('.')) continue;
                if (dirname === 'node_modules') continue;

                await this._indexRecursive(source, dir, index);
            }
        } catch (err) {
            // Access denied or path invalid - skip silently
        }
    }

    /**
     * Search the index for matching files
     * @param {string} query - Search query (filename or path segment)
     * @param {string} type - File type filter (image, audio, video, text, font, any)
     * @param {string} sourceFilter - Source filter (all, user, core)
     * @param {number} maxResults - Maximum results to return
     * @returns {Promise<string[]>} Array of matching file paths
     */
    async search(query, type = 'any', sourceFilter = 'all', maxResults = 50) {
        // Wait for initial index if not yet complete
        if (this._initialIndexPromise) {
            await this._initialIndexPromise;
        }

        const lowerQuery = query.toLowerCase();
        const results = [];

        const extensions = {
            image: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'],
            audio: ['.mp3', '.ogg', '.wav', '.flac', '.m4a'],
            video: ['.mp4', '.webm', '.mkv'],
            text: ['.txt', '.md', '.json', '.js', '.css'],
            font: ['.ttf', '.otf', '.woff', '.woff2']
        };

        for (const entry of this.index) {
            if (results.length >= maxResults) break;

            // Check source filter
            if (sourceFilter === 'user' && entry.source !== 'data') continue;
            if (sourceFilter === 'core' && entry.source !== 'public') continue;

            // Check query match
            if (!entry.filename.includes(lowerQuery) && !entry.path.toLowerCase().includes(lowerQuery)) {
                continue;
            }

            // Check type filter
            if (type !== 'any') {
                const exts = extensions[type];
                if (exts && !exts.some(ext => entry.filename.endsWith(ext))) {
                    continue;
                }
            }

            results.push(entry.path);
        }

        return results;
    }

    /**
     * Get index stats
     */
    getStats() {
        return {
            fileCount: this.index.length,
            lastIndexTime: this.lastIndexTime,
            isIndexing: this.isIndexing
        };
    }
}

// Singleton instance
export const assetIndexService = new AssetIndexService();
