import { Tool } from './tool-registry.js';

/**
 * Tool for discovering and listing available image files in FoundryVTT data directories.
 * Supports keyword filtering with wildcards and pagination for large results.
 * Uses dynamic directory discovery instead of hardcoded paths.
 *
 * @extends Tool
 */
export class ListImagesTool extends Tool {
  constructor() {
    super(
      'list_images',
      'Lists available image files from all FoundryVTT directories (user data and core system assets). Supports keyword filtering and pagination.',
      {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description:
              "Keyword filter. Automatically searches for partial matches (e.g., 'greatsword' finds 'greatsword-blue.webp'). Use wildcards for precise patterns: '*great*sword*', '*.png', 'token_?'",
          },
          page: {
            type: 'integer',
            minimum: 1,
            description:
              'Page number (1-based). Each page has up to 50 results.',
          },
          pageSize: {
            type: 'integer',
            minimum: 10,
            maximum: 100,
            description: 'Results per page (10-100). Default: 50.',
          },
        },
        required: [],
      }
    );
  }

  /**
   * Execute the list_images tool.
   * @param {object} params - Tool parameters
   * @param {AbortSignal} abortSignal - Signal to abort operation
   * @param {function} outputHandler - Handler for progress updates
   * @returns {Promise<object>} Tool result
   */
  async execute(params, abortSignal, outputHandler) {
    try {
      const { keyword = '*', page = 1, pageSize = 50 } = params;

      outputHandler?.({
        type: 'progress',
        message: `Searching for images: ${keyword}`,
      });

      // Dynamically discover all accessible directories instead of hardcoding
      const allSourcePaths = await this.discoverAllSourcesAndDirectories(
        abortSignal,
        outputHandler
      );
      const images = await this.discoverImages(
        allSourcePaths,
        keyword,
        abortSignal,
        outputHandler
      );
      const paginatedResult = this.paginateResults(images, page, pageSize);

      return {
        success: true,
        data: paginatedResult,
        message: `Found ${images.length} images total, showing page ${page}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to list images',
      };
    }
  }

  /**
   * Dynamically discovers all accessible directories under 'data' and 'public' FilePicker sources.
   * @param {AbortSignal} abortSignal - Signal to abort operation
   * @param {function} outputHandler - Handler for progress updates
   * @returns {Promise<Array<{source: string, path: string, category: string}>>} Array of discovered source paths
   */
  async discoverAllSourcesAndDirectories(abortSignal, outputHandler) {
    const discoveredPaths = [];
    const sources = ['data', 'public']; // FoundryVTT's main FilePicker sources

    for (const source of sources) {
      if (abortSignal?.aborted) break;

      outputHandler?.({
        type: 'progress',
        message: `Discovering directories in source: ${source}`,
      });

      try {
        // Start recursive discovery from the root of each source
        const rootBrowse = await FilePicker.browse(source, '', {});
        const initialDirs = rootBrowse.dirs || [];

        for (const dir of initialDirs) {
          if (abortSignal?.aborted) break;
          await this._recursivelyDiscoverDirectories(
            source,
            dir,
            discoveredPaths,
            abortSignal,
            outputHandler
          );
        }
      } catch (error) {
        console.warn(
          `Simulacrum | Error browsing root of source ${source}:`,
          error
        );
      }
    }
    return discoveredPaths;
  }

  /**
   * Recursively discovers directories within a given source and base path.
   * @param {string} source - FilePicker source ('data', 'public')
   * @param {string} basePath - Current base path to scan
   * @param {Array<{source: string, path: string, category: string}>} discoveredPaths - Array to accumulate results
   * @param {AbortSignal} abortSignal - Signal to abort operation
   * @param {function} outputHandler - Handler for progress updates
   */
  async _recursivelyDiscoverDirectories(
    source,
    basePath,
    discoveredPaths,
    abortSignal,
    outputHandler
  ) {
    if (abortSignal?.aborted) return;

    // Determine a category for the path (e.g., 'user', 'modules', 'systems', 'core')
    let category = 'user'; // Default category
    if (basePath.startsWith('modules/')) {
      category = 'modules';
    } else if (basePath.startsWith('systems/')) {
      category = 'systems';
    } else if (source === 'public') {
      category = 'core'; // Public source typically contains core FoundryVTT assets
    }

    discoveredPaths.push({ source, path: basePath, category });

    try {
      const browseResult = await FilePicker.browse(source, basePath, {});
      const subDirs = browseResult.dirs || [];

      for (const subDir of subDirs) {
        if (abortSignal?.aborted) break;
        await this._recursivelyDiscoverDirectories(
          source,
          subDir,
          discoveredPaths,
          abortSignal,
          outputHandler
        );
      }
    } catch (error) {
      // Log but don't throw - some directories might not be accessible (e.g., permissions)
      console.warn(
        `Simulacrum | Cannot recursively scan ${source}/${basePath}:`,
        error
      );
    }
  }

  /**
   * Discover images in specified source paths.
   * @param {Array<{source: string, path: string, category: string}>} allSourcePaths - Source paths to search
   * @param {string} keyword - Keyword filter
   * @param {AbortSignal} abortSignal - Abort signal
   * @param {function} outputHandler - Progress handler
   * @returns {Promise<object[]>} Array of image objects
   */
  async discoverImages(allSourcePaths, keyword, abortSignal, outputHandler) {
    const images = [];
    const imageExtensions = this.getSupportedImageExtensions();

    for (const { source, path: searchPath, category } of allSourcePaths) {
      if (abortSignal?.aborted) break;

      try {
        const foundImages = await this.scanDirectory(
          source,
          searchPath,
          keyword,
          imageExtensions,
          abortSignal
        );
        images.push(
          ...foundImages.map((img) => ({
            ...img,
            category: category,
          }))
        );
      } catch (error) {
        console.warn(
          `Simulacrum | Error scanning ${source}/${searchPath}:`,
          error
        );
      }

      outputHandler?.({
        type: 'progress',
        message: `Scanned ${source}/${searchPath}`,
      });
    }

    return images.sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Get supported image file extensions.
   * @returns {string[]} Array of supported extensions
   */
  getSupportedImageExtensions() {
    return [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.bmp',
      '.tiff',
      '.tif',
      '.webp',
      '.svg',
      '.ico',
      '.apng',
      '.avif',
      '.jxl',
    ];
  }

  /**
   * Recursively scan directory for image files.
   * @param {string} source - FilePicker source ('data', 'public', etc.)
   * @param {string} basePath - Base path to scan
   * @param {string} keyword - Keyword filter
   * @param {string[]} imageExtensions - Supported extensions
   * @param {AbortSignal} abortSignal - Abort signal
   * @returns {Promise<object[]>} Array of image objects
   */
  async scanDirectory(source, basePath, keyword, imageExtensions, abortSignal) {
    if (abortSignal?.aborted) return [];

    const images = [];

    try {
      // Use FoundryVTT's FilePicker API to scan directories
      const files = await FilePicker.browse(source, basePath, {
        extensions: imageExtensions,
      });

      // Process files in current directory
      for (const file of files.files) {
        if (abortSignal?.aborted) break;

        // FilePicker.browse returns complete paths, so we use 'file' directly.
        const fullPath = file;

        if (this.matchesKeyword(fullPath, keyword)) {
          const imageInfo = {
            path: fullPath, // Store the full path
            filename: file.split('/').pop(),
            extension: this.getFileExtension(file),
            size: 'unknown', // FoundryVTT FilePicker doesn't provide size
            lastModified: 'unknown', // FoundryVTT FilePicker doesn't provide modified date
          };
          images.push(imageInfo);
        }
      }

      // Recursively scan subdirectories
      for (const folder of files.dirs || []) {
        if (abortSignal?.aborted) break;

        const subImages = await this.scanDirectory(
          source,
          folder,
          keyword,
          imageExtensions,
          abortSignal
        );
        images.push(...subImages);
      }
    } catch (error) {
      // Log but don't throw - some directories might not be accessible
      console.warn(`Simulacrum | Cannot scan ${basePath}:`, error);
    }

    return images;
  }

  /**
   * Check if filename matches keyword with wildcard support.
   * @param {string} filename - Filename to test
   * @param {string} keyword - Keyword with wildcards
   * @returns {boolean} True if matches
   */
  matchesKeyword(filename, keyword) {
    if (!keyword || keyword === '*') return true;

    // Auto-wrap with wildcards unless already present
    let searchPattern = keyword;
    if (!keyword.includes('*') && !keyword.includes('?')) {
      searchPattern = `*${keyword}*`;
    }

    // Convert wildcard pattern to regex
    // First escape all regex special characters except * and ?
    let regexPattern = searchPattern.replace(/[|\\{}()[\]^$+.]/g, '\\$&');

    // Then convert wildcards to regex equivalents
    regexPattern = regexPattern.replace(/\*/g, '.*'); // * matches any characters
    regexPattern = regexPattern.replace(/\?/g, '.'); // ? matches single character

    // Anchor the pattern to match the entire filename
    regexPattern = '^' + regexPattern + '$';

    const regex = new RegExp(regexPattern, 'i'); // Case insensitive
    return regex.test(filename);
  }

  /**
   * Paginate results array.
   * @param {object[]} images - All images
   * @param {number} page - Page number (1-based)
   * @param {number} pageSize - Items per page
   * @returns {object} Paginated result with metadata
   */
  paginateResults(images, page, pageSize) {
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageImages = images.slice(startIndex, endIndex);

    const totalPages = Math.ceil(images.length / pageSize);
    const hasMore = page < totalPages;

    return {
      images: pageImages,
      pagination: {
        currentPage: page,
        pageSize: pageSize,
        totalResults: images.length,
        totalPages: totalPages,
        hasNextPage: hasMore,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Get file extension from filename.
   * @param {string} filename - Filename
   * @returns {string} Extension in lowercase
   */
  getFileExtension(filename) {
    return filename.split('.').pop().toLowerCase();
  }

  /**
   * Override to make this tool generally safe (read-only operation).
   * @returns {boolean} False - no confirmation needed
   */
  shouldConfirmExecute() {
    return false;
  }
}
