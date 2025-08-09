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
        message: cachedResult.message || 'Cached result',
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
      // Use the existing list_images tool to check if the file exists
      // This leverages the proven multi-source search logic that already works
      const { ListImagesTool } = await import('../tools/list-images.js');
      const listTool = new ListImagesTool();

      const result = await listTool.execute({
        keyword: path, // Use the full path as keyword to search for exact match
        page: 1,
        pageSize: 1, // We only need to know if it exists, not get all results
      });

      return result.success && result.data && result.data.images.length > 0;
    } catch (error) {
      console.error(
        `Simulacrum | ImageValidator | Error checking file existence for ${path}:`,
        error
      );
      return false;
    }
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
