/**
 * @file validation-error-recovery.test.js
 * @description Tests for the AI retry mechanism when FoundryVTT document validation fails,
 *              including comprehensive image validation tests.
 */

import { FoundrySchemaExtractor } from '../core/foundry-schema-extractor.js';
import { ValidationErrorRecovery } from '../tools/validation-error-recovery.js';
import { GenericCRUDTools } from '../core/generic-crud-tools.js';
import { DocumentDiscoveryEngine } from '../core/document-discovery-engine.js';
import { ImageValidator } from '../core/image-validator.js'; // Import ImageValidator
import { mockFilePicker, mockCONFIG, mockGame } from './mocks.js';

/**
 * Mock AI service for testing
 */
class MockAIService {
  constructor() {
    this.lastPrompt = null;
  }

  async sendMessage(prompt) {
    this.lastPrompt = prompt;
    return { content: 'Mock AI response with corrected data' };
  }
}

describe('ValidationErrorRecovery and Image Validation', () => {
  console.log('Simulacrum | Running ValidationErrorRecovery tests...');

  test('FoundrySchemaExtractor', async () => {
    console.log('Testing FoundrySchemaExtractor...');

    // Test basic schema extraction structure
    const extractor = FoundrySchemaExtractor;

    // Test that methods exist
    expect(typeof extractor.getDocumentSchema).toBe('function');
    expect(typeof extractor.convertFoundrySchemaToJSONSchema).toBe('function');

    console.log('✓ FoundrySchemaExtractor tests passed');
  });

  test('ValidationErrorRecovery', async () => {
    console.log('Testing ValidationErrorRecovery...');

    const mockAI = new MockAIService();
    const recovery = new ValidationErrorRecovery(mockAI);

    // Test basic methods exist
    expect(typeof recovery.buildValidationErrorPrompt).toBe('function');
    expect(typeof recovery.formatSchemaForAI).toBe('function');
    expect(typeof recovery.analyzeErrorPatterns).toBe('function');

    // Test error pattern analysis (doesn't require FoundryVTT)
    const errorMessage = "Validation failed: required field 'name' missing";
    const analysis = recovery.analyzeErrorPatterns(errorMessage, null);
    expect(analysis).toContain('required');

    // Test schema formatting
    const mockSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', required: true },
        type: { type: 'string', enum: ['character', 'npc'] },
      },
    };

    const formattedSchema = recovery.formatSchemaForAI(mockSchema);
    expect(formattedSchema).toBeDefined();
    expect(formattedSchema).toContain('type');
    expect(formattedSchema).toContain('properties');
    expect(formattedSchema).toContain('String');
    expect(formattedSchema).toContain('Object');

    console.log('✓ ValidationErrorRecovery tests passed');
  });

  test('GenericCRUDTools integration', async () => {
    console.log('Testing GenericCRUDTools integration...');

    // Test constructor and basic integration without requiring FoundryVTT globals
    const discoveryEngine = new DocumentDiscoveryEngine();
    const mockAI = new MockAIService();

    // Test constructor with AI service
    const crudToolsWithAI = new GenericCRUDTools(discoveryEngine, mockAI);

    // Test that validation error recovery is properly initialized
    expect(crudToolsWithAI.validationErrorRecovery).toBeDefined();
    expect(crudToolsWithAI.aiService).toBeDefined();

    // Test constructor without AI service
    const crudToolsNoAI = new GenericCRUDTools(discoveryEngine);

    expect(crudToolsNoAI.validationErrorRecovery).toBeNull();
    expect(crudToolsNoAI.aiService).toBeNull();

    // Test validation error detection
    const validationError = new Error(
      'Validation failed: required field missing'
    );
    expect(crudToolsWithAI.isValidationError(validationError)).toBe(true);

    const regularError = new Error('Network timeout');
    expect(crudToolsWithAI.isValidationError(regularError)).toBe(false);

    console.log('✓ GenericCRUDTools integration tests passed');
  });

  test('ImageValidator and image-related ValidationErrorRecovery', async () => {
    console.log(
      'Testing ImageValidator and image-related ValidationErrorRecovery...'
    );

    // Clear mock files before each test suite
    mockFilePicker.clearFiles();
    mockFilePicker.setDelay(0);
    mockFilePicker.setError(null);

    // --- ImageValidator.isValidImageFormat() tests ---
    console.log('  Testing ImageValidator.isValidImageFormat()...');
    expect(ImageValidator.isValidImageFormat('path/to/image.webp')).toBe(true);
    expect(ImageValidator.isValidImageFormat('path/to/image.PNG')).toBe(true);
    expect(ImageValidator.isValidImageFormat('path/to/image.JpG')).toBe(true);
    expect(ImageValidator.isValidImageFormat('path/to/image.jpeg')).toBe(true);
    expect(ImageValidator.isValidImageFormat('path/to/image.gif')).toBe(true);
    expect(ImageValidator.isValidImageFormat('path/to/image.svg')).toBe(true);
    expect(ImageValidator.isValidImageFormat('path/to/document.txt')).toBe(
      false
    );
    expect(ImageValidator.isValidImageFormat('path/to/document.pdf')).toBe(
      false
    );
    expect(ImageValidator.isValidImageFormat('no_extension')).toBe(false);
    console.log('  ✓ ImageValidator.isValidImageFormat() tests passed.');

    // --- ImageValidator.isImageField() tests ---
    console.log('  Testing ImageValidator.isImageField()...');
    expect(ImageValidator.isImageField('img')).toBe(true);
    expect(ImageValidator.isImageField('thumbnail')).toBe(true);
    expect(ImageValidator.isImageField('icon')).toBe(true);
    expect(ImageValidator.isImageField('portrait')).toBe(true);
    expect(ImageValidator.isImageField('tokenImg')).toBe(true);
    expect(ImageValidator.isImageField('avatar')).toBe(true);
    expect(ImageValidator.isImageField('name')).toBe(false);
    expect(ImageValidator.isImageField('description')).toBe(false);
    console.log('  ✓ ImageValidator.isImageField() tests passed.');

    // --- ImageValidator.validateImagePath() tests ---
    console.log('  Testing ImageValidator.validateImagePath()...');
    const validImagePath =
      'modules/simulacrum/assets/icons/simulacrum-icon.webp';
    const nonExistentPath = 'modules/simulacrum/assets/non-existent.png';
    const invalidFormatPath = 'modules/simulacrum/assets/document.txt';

    mockFilePicker.addFile(validImagePath);

    // Valid path, not required
    let result = await ImageValidator.validateImagePath(validImagePath);
    expect(result.isValid).toBe(true);
    expect(result.message).toBe('Image path is valid.');

    // Non-existent path
    result = await ImageValidator.validateImagePath(nonExistentPath);
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('Image file does not exist');

    // Invalid format path
    result = await ImageValidator.validateImagePath(invalidFormatPath);
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('Invalid image format');

    // Empty path, not required
    result = await ImageValidator.validateImagePath('');
    expect(result.isValid).toBe(true);
    expect(result.message).toBe('Image path is optional and not provided.');

    // Null path, not required
    result = await ImageValidator.validateImagePath(null);
    expect(result.isValid).toBe(true);
    expect(result.message).toBe('Image path is optional and not provided.');

    // Empty path, required
    result = await ImageValidator.validateImagePath('', { required: true });
    expect(result.isValid).toBe(false);
    expect(result.message).toContain(
      'Image path is required and cannot be empty.'
    );

    // Null path, required
    result = await ImageValidator.validateImagePath(null, { required: true });
    expect(result.isValid).toBe(false);
    expect(result.message).toContain(
      'Image path is required and cannot be empty.'
    );

    // Whitespace path, required
    result = await ImageValidator.validateImagePath('   ', { required: true });
    expect(result.isValid).toBe(false);
    expect(result.message).toContain(
      'Image path is required and cannot be empty.'
    );

    // Test caching behavior
    ImageValidator.clearCache(); // Clear cache for fresh test
    const cacheTestPath = 'modules/simulacrum/assets/cache-test.png';
    mockFilePicker.addFile(cacheTestPath);

    result = await ImageValidator.validateImagePath(cacheTestPath);
    expect(result.isValid).toBe(true);

    // Simulate a short delay, but within cache duration
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = await ImageValidator.validateImagePath(cacheTestPath);
    expect(result.isValid).toBe(true);
    expect(result.message).toBe('Image path is valid.');

    // Simulate a delay beyond cache duration
    ImageValidator.clearCache(); // Clear cache for fresh test
    mockFilePicker.setDelay(50); // Add a small delay to mock browse
    result = await ImageValidator.validateImagePath(cacheTestPath);
    expect(result.isValid).toBe(true);
    expect(result.message).toBe('Image path is valid.');
    mockFilePicker.setDelay(0); // Reset delay

    // Test timeout behavior
    ImageValidator.clearCache(); // Clear cache for fresh test
    const timeoutPath = 'modules/simulacrum/assets/timeout.png';
    mockFilePicker.addFile(timeoutPath);
    mockFilePicker.setDelay(35000); // Set a delay longer than the 30-second timeout

    result = await ImageValidator.validateImagePath(timeoutPath);
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('timed out');
    mockFilePicker.setDelay(0); // Reset delay
    console.log('  ✓ ImageValidator.validateImagePath() tests passed.');

    // --- ImageValidator.validateDocumentImages() tests ---
    console.log('  Testing ImageValidator.validateDocumentImages()...');
    const validDocPath = 'modules/simulacrum/assets/valid-doc-img.png';
    const invalidDocPath = 'modules/simulacrum/assets/invalid-doc-img.txt';
    const nonExistentDocPath =
      'modules/simulacrum/assets/non-existent-doc-img.png';

    mockFilePicker.clearFiles();
    mockFilePicker.addFile(validDocPath);

    // Valid document with 'img'
    let docData = { name: 'Test Actor', img: validDocPath };
    let validationResult = await ImageValidator.validateDocumentImages(
      docData,
      'Actor'
    );
    expect(validationResult.isValid).toBe(true);
    expect(validationResult.errors.length).toBe(0);

    // Document with missing 'img' field
    docData = { name: 'Test Actor' };
    validationResult = await ImageValidator.validateDocumentImages(
      docData,
      'Actor'
    );
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errors[0]).toContain(
      "Field 'img': Image path is required"
    );

    // Document with 'img' pointing to non-existent file
    docData = { name: 'Test Actor', img: nonExistentDocPath };
    validationResult = await ImageValidator.validateDocumentImages(
      docData,
      'Actor'
    );
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errors[0]).toContain(
      "Field 'img': Image file does not exist"
    );

    // Document with 'img' pointing to invalid format
    docData = { name: 'Test Actor', img: invalidDocPath };
    validationResult = await ImageValidator.validateDocumentImages(
      docData,
      'Actor'
    );
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errors[0]).toContain(
      "Field 'img': Invalid image format"
    );

    // Document with multiple image fields, some valid, some invalid
    const validThumbnailPath = 'modules/simulacrum/assets/valid-thumbnail.png';
    mockFilePicker.addFile(validThumbnailPath);
    docData = {
      name: 'Test Item',
      img: validDocPath,
      thumbnail: validThumbnailPath,
      icon: nonExistentDocPath, // Invalid
      portrait: invalidDocPath, // Invalid
    };
    validationResult = await ImageValidator.validateDocumentImages(
      docData,
      'Item'
    );
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.errors.length).toBe(2);
    expect(validationResult.errors[0]).toContain(
      "Field 'icon': Image file does not exist"
    );
    expect(validationResult.errors[1]).toContain(
      "Field 'portrait': Invalid image format"
    );
    console.log('  ✓ ImageValidator.validateDocumentImages() tests passed.');

    // --- ValidationErrorRecovery.detectImageValidationError() tests ---
    console.log(
      '  Testing ValidationErrorRecovery.detectImageValidationError()...'
    );
    const mockAI = new MockAIService();
    const recovery = new ValidationErrorRecovery(mockAI);

    expect(
      recovery.detectImageValidationError(
        'Image validation failed: Image path is required.'
      )
    ).toBe(true);
    expect(
      recovery.detectImageValidationError(
        'Image file does not exist at path: /invalid.png'
      )
    ).toBe(true);
    expect(
      recovery.detectImageValidationError(
        'Invalid image format for path: /doc.txt'
      )
    ).toBe(true);
    expect(
      recovery.detectImageValidationError('Validation failed: name is missing.')
    ).toBe(false);
    console.log(
      '  ✓ ValidationErrorRecovery.detectImageValidationError() tests passed.'
    );

    // --- ValidationErrorRecovery.buildImageValidationPrompt() tests ---
    console.log(
      '  Testing ValidationErrorRecovery.buildImageValidationPrompt()...'
    );
    const imageErrorMsg = 'Image path is required and cannot be empty.';
    const originalDocData = { name: 'Broken Doc', img: '' };
    const docType = 'Scene';
    const prompt = await recovery.buildImageValidationPrompt(
      imageErrorMsg,
      originalDocData,
      docType
    );

    expect(prompt).toContain(
      `You attempted to create or update a ${docType} document but encountered an image validation error.`
    );
    expect(prompt).toContain(`Error: ${imageErrorMsg}`);
    expect(prompt).toContain(
      `Original data: ${JSON.stringify(originalDocData, null, 2)}`
    );
    expect(prompt).toContain(
      '- The image path is correct and the file exists.'
    );
    expect(prompt).toContain(
      '- Image paths use forward slashes (/) and start from the FoundryVTT data directory'
    );
    expect(prompt).toContain(
      '- Supported image formats are .webp, .png, .jpg, .jpeg, .gif, and .svg.'
    );
    expect(prompt).toContain('Example valid image paths:');
    expect(prompt).toContain(
      'Please provide corrected data with a valid image path and explain the changes you made.'
    );
    console.log(
      '  ✓ ValidationErrorRecovery.buildImageValidationPrompt() tests passed.'
    );

    console.log('✓ All Image Validation tests passed!');
  }, 40000);

  describe('GenericCRUDTools Image Validation Enforcement', () => {
    let discoveryEngine;
    let crudTools;
    let mockAI;

    beforeEach(() => {
      mockFilePicker.clearFiles();
      mockFilePicker.setDelay(0);
      mockFilePicker.setError(null);
      ui.notifications.info.mockClear();
      ui.notifications.warn.mockClear();
      ui.notifications.error.mockClear();

      discoveryEngine = new DocumentDiscoveryEngine();
      mockAI = new MockAIService();
      crudTools = new GenericCRUDTools(discoveryEngine, mockAI);

      // Mock CONFIG and game globals for GenericCRUDTools
      global.CONFIG = mockCONFIG;
      global.game = mockGame;

      // Spy on the static create method of MockDocument
      jest.spyOn(mockCONFIG.Actor.documentClass, 'create');
      jest.spyOn(mockCONFIG.Item.documentClass, 'create');
      jest.spyOn(mockCONFIG.Scene.documentClass, 'create');
    });

    afterEach(() => {
      // Restore original implementations after each test
      jest.restoreAllMocks();
    });

    test('should prevent document creation with invalid image path', async () => {
      console.log(
        '  Testing GenericCRUDTools preventing creation with invalid image...'
      );
      const invalidImagePath = 'modules/simulacrum/assets/invalid.txt'; // Invalid format
      const docData = { name: 'Invalid Actor', img: invalidImagePath };

      await expect(crudTools.createDocument('Actor', docData)).rejects.toThrow(
        /Image validation failed for Actor: .*Invalid image format/
      );
      expect(ui.notifications.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to create Actor: Image validation failed for Actor:'
        )
      );
      // Verify that DocumentClass.create was NOT called
      expect(mockCONFIG.Actor.documentClass.create).not.toHaveBeenCalled();
      console.log('  ✓ Prevented document creation with invalid image path.');
    });

    test('should prevent document update with invalid image path', async () => {
      console.log(
        '  Testing GenericCRUDTools preventing update with invalid image...'
      );
      const validImagePath = 'modules/simulacrum/assets/valid.png';
      const invalidImagePath = 'modules/simulacrum/assets/non-existent.png'; // Non-existent

      mockFilePicker.addFile(validImagePath); // Add a valid image for initial document

      // Mock a document that can be "read"
      const mockDocument = new mockCONFIG.Actor.documentClass({
        _id: 'testId',
        name: 'Original Actor',
        img: validImagePath,
      });
      jest.spyOn(crudTools, 'readDocument').mockResolvedValue(mockDocument);
      jest.spyOn(mockDocument, 'update'); // Spy on the update method of the mock document

      const updates = { img: invalidImagePath };

      await expect(
        crudTools.updateDocument('Actor', 'testId', updates)
      ).rejects.toThrow(
        /Image validation failed for Actor update: .*Image file does not exist/
      );
      expect(ui.notifications.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to update Actor with ID testId: Image validation failed for Actor update:'
        )
      );
      // Verify that document.update was NOT called
      expect(mockDocument.update).not.toHaveBeenCalled();
      console.log('  ✓ Prevented document update with invalid image path.');
    });

    test('should allow document creation with valid image path', async () => {
      console.log(
        '  Testing GenericCRUDTools allowing creation with valid image...'
      );
      const validImagePath = 'modules/simulacrum/assets/valid-new.png';
      mockFilePicker.addFile(validImagePath);
      const docData = { name: 'Valid Actor', img: validImagePath };

      const createdDoc = await crudTools.createDocument('Actor', docData);
      expect(createdDoc).toBeDefined();
      expect(createdDoc.name).toBe('Valid Actor');
      expect(createdDoc.data.img).toBe(validImagePath);
      expect(ui.notifications.info).toHaveBeenCalledWith(
        expect.stringContaining('Created Actor: Valid Actor')
      );
      expect(mockCONFIG.Actor.documentClass.create).toHaveBeenCalledWith(
        docData
      );
      console.log('  ✓ Allowed document creation with valid image path.');
    });

    test('should allow document update with valid image path', async () => {
      console.log(
        '  Testing GenericCRUDTools allowing update with valid image...'
      );
      const originalImagePath = 'modules/simulacrum/assets/original.png';
      const newValidImagePath = 'modules/simulacrum/assets/new-valid.png';
      mockFilePicker.addFile(originalImagePath);
      mockFilePicker.addFile(newValidImagePath);

      const mockDocument = new mockCONFIG.Actor.documentClass({
        _id: 'updateId',
        name: 'Original Actor',
        img: originalImagePath,
      });
      jest.spyOn(crudTools, 'readDocument').mockResolvedValue(mockDocument);
      jest.spyOn(mockDocument, 'update'); // Spy on the update method of the mock document

      const updates = { img: newValidImagePath, name: 'Updated Actor' };

      const updatedDoc = await crudTools.updateDocument(
        'Actor',
        'updateId',
        updates
      );
      expect(updatedDoc).toBeDefined();
      expect(updatedDoc.name).toBe('Updated Actor');
      expect(updatedDoc.data.img).toBe(newValidImagePath);
      expect(ui.notifications.info).toHaveBeenCalledWith(
        expect.stringContaining('Updated Actor: Updated Actor')
      );
      expect(mockDocument.update).toHaveBeenCalledWith(updates);
      console.log('  ✓ Allowed document update with valid image path.');
    });
  });
});
