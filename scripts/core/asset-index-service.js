/**
 * Asset Index Service - Maintains an index of all files for fast searching
 *
 * Storage: IndexedDB for large dataset support without RAM pressure
 * Data: Lean index storing only paths (filename/source derived at query time)
 *
 * Sync strategy:
 * 1. Build full index on world load (writes to IndexedDB)
 * 2. Monkey-patch getFilePicker().upload for immediate updates
 * 3. Background re-index every 5 minutes to catch external changes
 */

import { createLogger } from '../utils/logger.js';
import { emitIndexStatus } from './hook-manager.js';

const DB_NAME = 'simulacrum-asset-index';
const DB_VERSION = 2; // v2: added meta store for completion tracking
const PROGRESS_LOG_INTERVAL = 10000; // Log progress every N files
const STALENESS_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_INTERVAL_MS = 10 * 1000; // 10 seconds

// Roots that map to 'public' source, everything else is 'data'
const PUBLIC_ROOTS = ['icons', 'sounds'];

/**
 * Get the FilePicker class (handles v13+ namespacing)
 * @returns {typeof FilePicker}
 */
function getFilePicker() {
    return foundry?.applications?.apps?.FilePicker?.implementation ?? FilePicker;
}

class AssetIndexService {
    constructor() {
        this.logger = createLogger('AssetIndexService');
        this.db = null;
        this.isIndexing = false;
        this.lastIndexTime = null;
        this.heartbeatId = null;
        this.initialized = false;
        this._initialIndexPromise = null;
        this._initialIndexResolve = null;
        this._initialIndexComplete = false; // True after first full index completes
        this._fileCount = 0;
        this._folderCount = 0;
    }

    /**
     * Initialize the service - open DB, set up hooks, start heartbeat
     */
    async initialize() {
        if (this.initialized) return;

        this.logger.info('Initializing asset index service...');

        // Create promise for initial readiness
        this._initialIndexPromise = new Promise((resolve) => {
            this._initialIndexResolve = resolve;
        });

        // Open IndexedDB
        try {
            this.db = await this._openDB();
            this.logger.info('IndexedDB opened successfully');
        } catch (err) {
            this.logger.error('Failed to open IndexedDB, falling back to memory-only mode', err);
            this.db = null;
        }

        // Check if we have existing cached data
        const hasExistingData = await this._checkExistingIndex();

        if (hasExistingData) {
            // Existing index found - service is immediately ready
            this.logger.info(
                `Using cached index: ${this._fileCount} files, ${this._folderCount} folders`
            );
            this._initialIndexComplete = true;
            this._initialIndexResolve();
        } else {
            this.logger.info('No cached index found, waiting for first index...');
        }

        // Monkey-patch FilePicker methods for immediate sync
        this._patchFilePicker();

        // Start staleness heartbeat - handles both initial and periodic sync
        this._startHeartbeat();

        this.initialized = true;
        this.logger.info('Asset index service initialized');
    }

    /**
     * Check if IndexedDB has a complete index from a previous session
     * @returns {Promise<boolean>}
     */
    async _checkExistingIndex() {
        if (!this.db) return false;

        try {
            // Check for stored lastIndexTime - only exists after successful complete index
            const storedTime = await new Promise((resolve, reject) => {
                const tx = this.db.transaction('meta', 'readonly');
                const request = tx.objectStore('meta').get('lastIndexTime');
                request.onsuccess = () => resolve(request.result?.value);
                request.onerror = () => reject(request.error);
            });

            if (!storedTime) {
                this.logger.debug('No lastIndexTime found - index incomplete or never finished');
                return false;
            }

            this.lastIndexTime = new Date(storedTime);

            // Get counts for stats
            const counts = await new Promise((resolve, reject) => {
                const tx = this.db.transaction(['files', 'folders'], 'readonly');
                let fileCount = 0;
                let folderCount = 0;

                const fileRequest = tx.objectStore('files').count();
                fileRequest.onsuccess = () => {
                    fileCount = fileRequest.result;
                };

                const folderRequest = tx.objectStore('folders').count();
                folderRequest.onsuccess = () => {
                    folderCount = folderRequest.result;
                };

                tx.oncomplete = () => resolve({ fileCount, folderCount });
                tx.onerror = () => reject(tx.error);
            });

            this._fileCount = counts.fileCount;
            this._folderCount = counts.folderCount;

            return true;
        } catch (err) {
            this.logger.debug(`Failed to check existing index: ${err.message}`);
            return false;
        }
    }

    /**
     * Open IndexedDB database
     * @returns {Promise<IDBDatabase>}
     */
    _openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Files store - keyed by path
                if (!db.objectStoreNames.contains('files')) {
                    const fileStore = db.createObjectStore('files', { keyPath: 'path' });
                    fileStore.createIndex('filename', 'filename', { unique: false });
                }

                // Folders store - keyed by path
                if (!db.objectStoreNames.contains('folders')) {
                    const folderStore = db.createObjectStore('folders', { keyPath: 'path' });
                    folderStore.createIndex('name', 'name', { unique: false });
                }

                // Metadata store - for tracking index state
                if (!db.objectStoreNames.contains('meta')) {
                    db.createObjectStore('meta', { keyPath: 'key' });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Derive source from path prefix
     * @param {string} path
     * @returns {'data'|'public'}
     */
    _getSourceFromPath(path) {
        const root = path.split('/')[0];
        return PUBLIC_ROOTS.includes(root) ? 'public' : 'data';
    }

    /**
     * Monkey-patch getFilePicker().upload for immediate index updates
     */
    _patchFilePicker() {
        const self = this;

        // Patch upload
        const originalUpload = getFilePicker().upload;
        getFilePicker().upload = async function (source, path, file, options) {
            const result = await originalUpload.call(this, source, path, file, options);

            // Add the uploaded file to index
            if (result?.path && self.db) {
                const filename = result.path.split('/').pop().toLowerCase();
                try {
                    const tx = self.db.transaction('files', 'readwrite');
                    const store = tx.objectStore('files');
                    store.put({ path: result.path, filename });
                    self._fileCount++;
                    self.logger.debug(`Added uploaded file to index: ${result.path}`);
                } catch (err) {
                    self.logger.debug(`Failed to add uploaded file to index: ${err.message}`);
                }
            }

            return result;
        };

        // Patch createDirectory
        const originalCreateDirectory = getFilePicker().createDirectory;
        getFilePicker().createDirectory = async function (source, target, options) {
            const result = await originalCreateDirectory.call(this, source, target, options);

            // Add folder to index
            if (self.db) {
                const name = target.split('/').pop().toLowerCase();
                try {
                    const tx = self.db.transaction('folders', 'readwrite');
                    const store = tx.objectStore('folders');
                    store.put({ path: target, name });
                    self._folderCount++;
                    self.logger.debug(`Added created folder to index: ${target}`);
                } catch (err) {
                    self.logger.debug(`Failed to add folder to index: ${err.message}`);
                }
            }

            return result;
        };

        this.logger.info('FilePicker methods patched for index sync');
    }

    /**
     * Start the staleness heartbeat
     */
    _startHeartbeat() {
        if (this.heartbeatId) {
            clearInterval(this.heartbeatId);
        }

        // Run immediately on start, then every HEARTBEAT_INTERVAL_MS
        this._checkStaleness();

        this.heartbeatId = setInterval(() => {
            this._checkStaleness();
        }, HEARTBEAT_INTERVAL_MS);

        this.logger.info(
            `Staleness heartbeat started (every ${HEARTBEAT_INTERVAL_MS / 1000}s, threshold ${STALENESS_THRESHOLD_MS / 1000 / 60}m)`
        );
    }

    /**
     * Check if index is stale and trigger rebuild if needed
     */
    _checkStaleness() {
        // Skip if already indexing
        if (this.isIndexing) return;

        const now = Date.now();
        const isStale =
            !this.lastIndexTime || now - this.lastIndexTime.getTime() > STALENESS_THRESHOLD_MS;

        if (isStale) {
            this.logger.debug('Index is stale, triggering rebuild...');
            this.rebuildIndex();
        }
    }

    /**
     * Stop the heartbeat
     */
    stopSync() {
        if (this.heartbeatId) {
            clearInterval(this.heartbeatId);
            this.heartbeatId = null;
        }
    }

    /**
     * Rebuild the entire index (streaming writes to IndexedDB)
     */
    async rebuildIndex() {
        if (this.isIndexing) {
            this.logger.debug('Index rebuild already in progress, skipping');
            return;
        }

        this.isIndexing = true;
        const startTime = Date.now();
        const isInitialIndex = !this._initialIndexComplete;
        this.logger.info('Starting index rebuild...');

        // Emit start hook for initial index (UI status indicator)
        if (isInitialIndex) {
            emitIndexStatus('start');
        }

        // Clear stores before streaming new data
        if (this.db) {
            try {
                await this._clearStores();
            } catch (err) {
                this.logger.error('Failed to clear IndexedDB stores', err);
            }
        }

        // Reset counts and progress tracking
        this._fileCount = 0;
        this._folderCount = 0;
        this._lastProgressLog = 0;

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
                await this._indexRecursive(root.source, root.path);
            } catch (err) {
                // Root might not exist, that's fine
                this.logger.debug(`Could not index ${root.source}/${root.path}: ${err.message}`);
            }
        }

        this.lastIndexTime = new Date();

        // Store timestamp to IndexedDB (marks index as complete)
        if (this.db) {
            try {
                await this._storeTimestamp(this.lastIndexTime);
            } catch (err) {
                this.logger.error('Failed to store index timestamp', err);
            }
        }

        this.isIndexing = false;

        // Mark initial index as complete and resolve promise
        if (!this._initialIndexComplete) {
            this._initialIndexComplete = true;
            if (this._initialIndexResolve) {
                this._initialIndexResolve();
                this._initialIndexResolve = null;
            }

            // Emit complete hook (UI status indicator)
            emitIndexStatus('complete', {
                fileCount: this._fileCount,
                folderCount: this._folderCount,
            });
        }

        const elapsed = Date.now() - startTime;
        this.logger.info(
            `Index rebuild complete: ${this._fileCount} files, ${this._folderCount} folders indexed in ${elapsed}ms`
        );
    }

    /**
     * Store lastIndexTime in IndexedDB
     */
    async _storeTimestamp(timestamp) {
        await new Promise((resolve, reject) => {
            const tx = this.db.transaction('meta', 'readwrite');
            tx.objectStore('meta').put({ key: 'lastIndexTime', value: timestamp.getTime() });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Clear IndexedDB stores and timestamp (marks index as incomplete)
     */
    async _clearStores() {
        await new Promise((resolve, reject) => {
            const tx = this.db.transaction(['files', 'folders', 'meta'], 'readwrite');
            tx.objectStore('files').clear();
            tx.objectStore('folders').clear();
            tx.objectStore('meta').delete('lastIndexTime');
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Write a batch of files and folders to IndexedDB
     * @param {Array<{path: string, filename: string}>} files
     * @param {Array<{path: string, name: string}>} folders
     */
    async _writeBatch(files, folders) {
        if (!this.db || (files.length === 0 && folders.length === 0)) return;

        await new Promise((resolve, reject) => {
            const tx = this.db.transaction(['files', 'folders'], 'readwrite');
            const fileStore = tx.objectStore('files');
            const folderStore = tx.objectStore('folders');

            for (const file of files) {
                fileStore.put(file);
            }
            for (const folder of folders) {
                folderStore.put(folder);
            }

            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Recursively index a directory - streams writes per directory
     */
    async _indexRecursive(source, path) {
        try {
            const result = await getFilePicker().browse(source, path);

            // Collect files and folders for this directory
            const files = [];
            const folders = [];

            // Index all files in current directory
            for (const file of result.files) {
                const filename = file.split('/').pop().toLowerCase();
                files.push({ path: file, filename });
            }

            // Collect subdirectories to recurse into
            const dirsToRecurse = [];
            for (const dir of result.dirs) {
                const dirname = dir.split('/').pop();

                // Skip hidden and huge directories
                if (dirname.startsWith('.')) continue;
                if (dirname === 'node_modules') continue;

                // Index the folder itself
                folders.push({ path: dir, name: dirname.toLowerCase() });
                dirsToRecurse.push(dir);
            }

            // Write this directory's contents to IndexedDB immediately
            await this._writeBatch(files, folders);
            this._fileCount += files.length;
            this._folderCount += folders.length;

            // Log progress periodically
            const totalItems = this._fileCount + this._folderCount;
            if (totalItems - this._lastProgressLog >= PROGRESS_LOG_INTERVAL) {
                this.logger.info(`Indexing progress: ${this._fileCount} files, ${this._folderCount} folders...`);
                this._lastProgressLog = totalItems;

                // Emit progress hook for initial index (UI status indicator)
                if (!this._initialIndexComplete) {
                    emitIndexStatus('progress', {
                        fileCount: this._fileCount,
                        folderCount: this._folderCount,
                    });
                }
            }

            // Recurse into subdirectories (after writing, so memory is freed)
            for (const dir of dirsToRecurse) {
                await this._indexRecursive(source, dir);
            }
        } catch {
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

        if (!this.db) {
            return [];
        }

        const lowerQuery = query.toLowerCase();
        const results = [];

        const extensions = {
            image: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'],
            audio: ['.mp3', '.ogg', '.wav', '.flac', '.m4a'],
            video: ['.mp4', '.webm', '.mkv'],
            text: ['.txt', '.md', '.json', '.js', '.css'],
            font: ['.ttf', '.otf', '.woff', '.woff2'],
        };

        return new Promise((resolve) => {
            const tx = this.db.transaction('files', 'readonly');
            const store = tx.objectStore('files');
            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = event.target.result;

                if (!cursor || results.length >= maxResults) {
                    resolve(results);
                    return;
                }

                const { path, filename } = cursor.value;

                // Check source filter
                const source = this._getSourceFromPath(path);
                if (sourceFilter === 'user' && source !== 'data') {
                    cursor.continue();
                    return;
                }
                if (sourceFilter === 'core' && source !== 'public') {
                    cursor.continue();
                    return;
                }

                // Check query match
                if (!filename.includes(lowerQuery) && !path.toLowerCase().includes(lowerQuery)) {
                    cursor.continue();
                    return;
                }

                // Check type filter
                if (type !== 'any') {
                    const exts = extensions[type];
                    if (exts && !exts.some((ext) => filename.endsWith(ext))) {
                        cursor.continue();
                        return;
                    }
                }

                results.push(path);
                cursor.continue();
            };

            request.onerror = () => {
                this.logger.error('IndexedDB cursor error during search');
                resolve(results);
            };
        });
    }

    /**
     * Search the index for matching folders
     * @param {string} query - Search query (folder name or path segment)
     * @param {string} sourceFilter - Source filter (all, user, core)
     * @param {number} maxResults - Maximum results to return
     * @returns {Promise<string[]>} Array of matching folder paths
     */
    async searchFolders(query, sourceFilter = 'all', maxResults = 50) {
        // Wait for initial index if not yet complete
        if (this._initialIndexPromise) {
            await this._initialIndexPromise;
        }

        if (!this.db) {
            return [];
        }

        const lowerQuery = query.toLowerCase();
        const results = [];

        return new Promise((resolve) => {
            const tx = this.db.transaction('folders', 'readonly');
            const store = tx.objectStore('folders');
            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = event.target.result;

                if (!cursor || results.length >= maxResults) {
                    resolve(results);
                    return;
                }

                const { path, name } = cursor.value;

                // Check source filter
                const source = this._getSourceFromPath(path);
                if (sourceFilter === 'user' && source !== 'data') {
                    cursor.continue();
                    return;
                }
                if (sourceFilter === 'core' && source !== 'public') {
                    cursor.continue();
                    return;
                }

                // Check query match
                if (!name.includes(lowerQuery) && !path.toLowerCase().includes(lowerQuery)) {
                    cursor.continue();
                    return;
                }

                results.push(path);
                cursor.continue();
            };

            request.onerror = () => {
                this.logger.error('IndexedDB cursor error during folder search');
                resolve(results);
            };
        });
    }

    /**
     * Browse a folder - list immediate contents (files and subfolders)
     * @param {string} path - Folder path to browse
     * @param {string} source - Source (data or public)
     * @returns {Promise<{files: string[], folders: string[]}>}
     */
    async browseFolder(path, source = 'data') {
        // Wait for initial index if not yet complete
        if (this._initialIndexPromise) {
            await this._initialIndexPromise;
        }

        try {
            const result = await getFilePicker().browse(source, path);
            return {
                files: result.files || [],
                folders: result.dirs || [],
            };
        } catch (err) {
            throw new Error(`Cannot browse folder "${path}": ${err.message}`);
        }
    }

    /**
     * Get index stats
     */
    getStats() {
        return {
            fileCount: this._fileCount,
            folderCount: this._folderCount,
            lastIndexTime: this.lastIndexTime,
            isIndexing: this.isIndexing,
        };
    }

    /**
     * Check if the index is ready for searching
     * @returns {boolean}
     */
    isReady() {
        return this.db !== null && this._initialIndexComplete;
    }

    /**
     * Get availability status for dynamic tool descriptions
     * @returns {{available: boolean, reason?: string}}
     */
    getAvailability() {
        if (!this.db) {
            return { available: false, reason: 'IndexedDB not available' };
        }
        if (!this._initialIndexComplete) {
            return { available: false, reason: 'Initial indexing in progress' };
        }
        if (this._fileCount === 0 && this._folderCount === 0) {
            return { available: false, reason: 'No files indexed' };
        }
        return { available: true };
    }
}

// Singleton instance
export const assetIndexService = new AssetIndexService();
