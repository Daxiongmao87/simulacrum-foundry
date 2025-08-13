/**
 * @file Image validation utilities for FoundryVTT documents.
 * @module Simulacrum.ImageValidator
 */

/**
 * Provides static methods for validating image paths and document image fields within FoundryVTT.
 * This class ensures that image paths are valid, exist within the FoundryVTT data directory,
 * and adhere to supported image formats. It also enforces the 'img' field as required for documents.
 */
export class ImageValidator {
  /**
   * Cache for validation results to improve performance.
   * @type {Map<string, {isValid: boolean, timestamp: number}>}
   * @private
   */
  static #validationCache = new Map();

  /**
   * The duration in milliseconds for which validation results are cached.
   * @type {number}
   * @private
   */
  static #CACHE_DURATION = 30 * 1000; // 30 seconds

  /**
   * Clears the validation cache.
   * This method is primarily for testing purposes.
   */
  static clearCache() {
    ImageValidator.#validationCache.clear();
  }

  /**
   * Validates a single image path.
   * @param {string} imagePath - The image path to validate.
   * @param {object} [options={}] - Optional validation settings.
   * @param {boolean} [options.required=false] - Whether the image path is strictly required.
   * @returns {Promise<{isValid: boolean, message: string}>} - A promise that resolves to an object indicating validity and a message.
   */
  static async validateImagePath(imagePath, options = {}) {
    const { required = false } = options;
    const cacheKey = `${imagePath}-${required}`;
    const cachedResult = ImageValidator.#validationCache.get(cacheKey);
    const now = Date.now();

    if (
      cachedResult &&
      now - cachedResult.timestamp < ImageValidator.#CACHE_DURATION
    ) {
      return {
        isValid: cachedResult.isValid,
        message: 'Cached result',
      };
    }

    if (required && (!imagePath || imagePath.trim() === '')) {
      const result = {
        isValid: false,
        message: 'Image path is required and cannot be empty.',
      };
      ImageValidator.#validationCache.set(cacheKey, {
        ...result,
        timestamp: now,
      });
      return result;
    }

    if (!imagePath || imagePath.trim() === '') {
      const result = {
        isValid: true,
        message: 'Image path is optional and not provided.',
      };
      ImageValidator.#validationCache.set(cacheKey, {
        ...result,
        timestamp: now,
      });
      return result;
    }

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error('Image path validation timed out after 30 seconds.')
            ),
          30000
        )
      );

      const validationPromise = (async () => {
        if (!ImageValidator.isValidImageFormat(imagePath)) {
          return {
            isValid: false,
            message: `Invalid image format for path: ${imagePath}. Supported formats: .webp, .png, .jpg, .jpeg, .gif, .svg.`,
          };
        }

        const exists = await ImageValidator.fileExists(imagePath);
        if (!exists) {
          return {
            isValid: false,
            message: `Image file does not exist at path: ${imagePath}.`,
          };
        }

        return { isValid: true, message: 'Image path is valid.' };
      })();

      const result = await Promise.race([validationPromise, timeoutPromise]);
      ImageValidator.#validationCache.set(cacheKey, {
        ...result,
        timestamp: now,
      });
      return result;
    } catch (error) {
      const result = {
        isValid: false,
        message: `Validation error for image path '${imagePath}': ${error.message}`,
      };
      ImageValidator.#validationCache.set(cacheKey, {
        ...result,
        timestamp: now,
      });
      return result;
    }
  }

  /**
   * Validates all image fields within a given document's data.
   * Specifically enforces the 'img' field as required.
   * @param {object} documentData - The data object of the FoundryVTT document.
   * @param {string} documentType - The type of the document (e.g., 'Actor', 'Item', 'Scene').
   * @returns {Promise<{isValid: boolean, errors: string[]}>} - A promise that resolves to an object indicating overall validity and a list of errors.
   */
  static async validateDocumentImages(documentData, documentType) {
    const errors = [];
    const imageFields = Object.keys(documentData).filter(
      ImageValidator.isImageField
    );

    // Ensure 'img' field is always treated as required
    if (!imageFields.includes('img')) {
      imageFields.push('img');
    }

    for (const fieldName of imageFields) {
      const imagePath = documentData[fieldName];
      const isRequired = fieldName === 'img'; // 'img' is always required

      const { isValid, message } = await ImageValidator.validateImagePath(
        imagePath,
        { required: isRequired }
      );
      if (!isValid) {
        errors.push(
          `Document ${documentType} | Field '${fieldName}': ${message}`
        );
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Determines if a given field name is typically associated with an image path.
   * @param {string} fieldName - The name of the field.
   * @returns {boolean} - True if the field name suggests an image path, false otherwise.
   */
  static isImageField(fieldName) {
    const imageFieldNames = [
      'img',
      'thumbnail',
      'icon',
      'portrait',
      'tokenImg',
      'avatar',
    ];
    return imageFieldNames.includes(fieldName);
  }

  /**
   * Checks if a file exists at the given path within the FoundryVTT data directory.
   * This uses FoundryVTT's built-in file management capabilities.
   * @param {string} path - The file path to check.
   * @returns {Promise<boolean>} - A promise that resolves to true if the file exists, false otherwise.
   */
  static async fileExists(path) {
    try {
      // Dynamically discover all available FilePicker sources
      const availableSources =
        await ImageValidator.#discoverAvailableFileSources();
      const directoryPath = path.substring(0, path.lastIndexOf('/'));

      // Try each available source to find where this path exists
      for (const source of availableSources) {
        try {
          // Check if the exact directory path exists in this source
          const browseResult = await FilePicker.browse(source, directoryPath);
          if (browseResult.files.includes(path)) {
            return true;
          }
        } catch {
          // Directory doesn't exist in this source, try next source
          continue;
        }
      }

      return false;
    } catch (error) {
      console.error(
        `Simulacrum | ImageValidator | Error checking file existence for ${path}:`,
        error
      );
      return false;
    }
  }

  /**
   * Dynamically discovers all available FilePicker sources in the current FoundryVTT environment
   * Uses official FoundryVTT API when available, per documentation:
   * https://foundryvtt.com/api/classes/foundry.applications.apps.FilePicker.html
   *
   * @returns {Promise<string[]>} Array of available source names
   * @private
   */
  static async #discoverAvailableFileSources() {
    // Method 1: Use official FoundryVTT FilePicker.sources API
    // Reference: https://foundryvtt.com/api/classes/foundry.applications.apps.FilePicker.html#sources
    try {
      if (
        typeof FilePicker?.sources === 'object' &&
        FilePicker.sources !== null
      ) {
        const sourceNames = Object.keys(FilePicker.sources);
        console.log(
          'Simulacrum | ImageValidator | Using official FilePicker.sources API:',
          sourceNames
        );
        return sourceNames;
      }
    } catch (error) {
      console.debug(
        'Simulacrum | ImageValidator | FilePicker.sources access failed:',
        error.message
      );
    }

    // Method 2: Check FilePicker instance sources property
    try {
      const tempFilePicker = new FilePicker();
      if (
        typeof tempFilePicker.sources === 'object' &&
        tempFilePicker.sources !== null
      ) {
        const sourceNames = Object.keys(tempFilePicker.sources);
        console.log(
          'Simulacrum | ImageValidator | Using FilePicker instance sources:',
          sourceNames
        );
        return sourceNames;
      }
    } catch (error) {
      console.debug(
        'Simulacrum | ImageValidator | FilePicker instance sources access failed:',
        error.message
      );
    }

    // Method 3: Check CONFIG.FilePicker configuration objects
    try {
      if (typeof window !== 'undefined' && window.CONFIG?.FilePicker?.sources) {
        const sourceNames = Object.keys(window.CONFIG.FilePicker.sources);
        console.log(
          'Simulacrum | ImageValidator | Using CONFIG.FilePicker.sources:',
          sourceNames
        );
        return sourceNames;
      }
    } catch (error) {
      console.debug(
        'Simulacrum | ImageValidator | CONFIG.FilePicker access failed:',
        error.message
      );
    }

    // Fallback: Trial-and-error discovery with official FoundryVTT source names
    // Based on v13 API documentation: "data" | "public" | "s3"
    console.log(
      'Simulacrum | ImageValidator | Using trial-and-error discovery with official source names'
    );
    const officialSources = ['data', 'public', 's3']; // Official FoundryVTT v13 sources
    const availableSources = [];

    for (const source of officialSources) {
      try {
        // Test if this source is accessible by trying to browse its root
        await FilePicker.browse(source, '');
        availableSources.push(source);
        console.debug(
          `Simulacrum | ImageValidator | Source '${source}' is available`
        );
      } catch (error) {
        // Source not available in this environment, skip it
        console.debug(
          `Simulacrum | ImageValidator | Source '${source}' not available:`,
          error.message
        );
      }
    }

    if (availableSources.length === 0) {
      console.warn(
        'Simulacrum | ImageValidator | No FilePicker sources discovered, using emergency fallback'
      );
      return ['data', 'public']; // Should never happen with properly configured FoundryVTT
    }

    console.log(
      'Simulacrum | ImageValidator | Discovered available sources:',
      availableSources
    );
    return availableSources;
  }

  /**
   * Validates if the given path has a supported image file extension.
   * @param {string} path - The file path to validate.
   * @returns {boolean} - True if the extension is supported, false otherwise.
   */
  static isValidImageFormat(path) {
    const supportedExtensions = [
      '.webp',
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.svg',
    ];
    const lowerCasePath = path.toLowerCase();
    return supportedExtensions.some((ext) => lowerCasePath.endsWith(ext));
  }
}
