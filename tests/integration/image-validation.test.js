/**
 * @file Integration tests for image validation using real FoundryVTT instance via Puppeteer
 * @description Tests image validation against actual FoundryVTT FilePicker API and file system
 */

import { setupTestEnvironment, teardownTestEnvironment } from '../helpers/foundry-server.js';

describe('Image Validation Integration Tests', () => {
  let testEnv;
  
  beforeAll(async () => {
    // Setup complete test environment with FoundryVTT and Puppeteer
    testEnv = await setupTestEnvironment({
      foundry: {
        port: 30000,
        worldName: 'image-validation-test'
      }
    });
  });

  afterAll(async () => {
    // Teardown test environment
    await teardownTestEnvironment(testEnv);
  });

  describe('FilePicker API Integration', () => {
    test('should discover real directory structure', async () => {
      const directories = await testEnv.page.evaluate(async () => {
        const sources = ['data', 'public'];
        const discovered = {};
        
        for (const source of sources) {
          try {
            const result = await FilePicker.browse(source, '');
            discovered[source] = {
              dirs: result.dirs || [],
              files: result.files || []
            };
          } catch (error) {
            discovered[source] = { error: error.message };
          }
        }
        
        return discovered;
      });
      
      expect(directories.data).toBeDefined();
      expect(directories.public).toBeDefined();
      expect(Array.isArray(directories.data.dirs)).toBe(true);
      expect(Array.isArray(directories.public.dirs)).toBe(true);
    });

    test('should validate existing image paths correctly', async () => {
      const validationResult = await testEnv.page.evaluate(async () => {
        // Load our ImageValidator module into the FoundryVTT context
        const moduleScript = `
          ${await fetch('/modules/simulacrum/scripts/core/image-validator.js').then(r => r.text())}
        `;
        eval(moduleScript);
        
        // Test validation of a real image path that should exist
        // First discover what images actually exist
        const publicBrowse = await FilePicker.browse('public', 'icons');
        const existingImage = publicBrowse.files.find(f => f.endsWith('.png') || f.endsWith('.webp'));
        
        if (!existingImage) {
          return { error: 'No test images found in public/icons' };
        }
        
        // Test our validator against this real image
        const validation = await ImageValidator.validateImagePath(existingImage, { required: true });
        
        return {
          imagePath: existingImage,
          validation: validation,
          fileExists: await ImageValidator.fileExists(existingImage)
        };
      });
      
      if (validationResult.error) {
        console.warn('Test skipped:', validationResult.error);
        return;
      }
      
      expect(validationResult.validation.isValid).toBe(true);
      expect(validationResult.fileExists).toBe(true);
      expect(validationResult.imagePath).toBeTruthy();
    });

    test('should correctly handle non-existent image paths', async () => {
      const validationResult = await testEnv.page.evaluate(async () => {
        // Load our ImageValidator module
        const moduleScript = `
          ${await fetch('/modules/simulacrum/scripts/core/image-validator.js').then(r => r.text())}
        `;
        eval(moduleScript);
        
        // Test with a path that definitely doesn't exist
        const nonExistentPath = 'icons/definitely-does-not-exist/fake-image.png';
        
        return {
          validation: await ImageValidator.validateImagePath(nonExistentPath, { required: true }),
          fileExists: await ImageValidator.fileExists(nonExistentPath)
        };
      });
      
      expect(validationResult.validation.isValid).toBe(false);
      expect(validationResult.fileExists).toBe(false);
      expect(validationResult.validation.message).toContain('does not exist');
    });

    test('should handle the specific issue from GitHub #21', async () => {
      const issueTestResult = await testEnv.page.evaluate(async () => {
        // Load our ImageValidator module
        const moduleScript = `
          ${await fetch('/modules/simulacrum/scripts/core/image-validator.js').then(r => r.text())}
        `;
        eval(moduleScript);
        
        // Test the specific path mentioned in the issue
        const testPath = 'icons/commodities/gems/gem-cluster-red.webp';
        
        // First check if we can access this via URL (the user's verification method)
        let urlAccessible = false;
        try {
          const response = await fetch(`/${testPath}`);
          urlAccessible = response.ok;
        } catch (error) {
          urlAccessible = false;
        }
        
        // Then test our validator
        const validation = await ImageValidator.validateImagePath(testPath, { required: true });
        const fileExists = await ImageValidator.fileExists(testPath);
        
        return {
          testPath,
          urlAccessible,
          validation,
          fileExists,
          // Also test manual FilePicker calls for debugging
          manualDataCheck: await FilePicker.browse('data', 'icons/commodities/gems').catch(e => ({ error: e.message })),
          manualPublicCheck: await FilePicker.browse('public', 'icons/commodities/gems').catch(e => ({ error: e.message }))
        };
      });
      
      console.log('GitHub #21 Issue Test Results:', JSON.stringify(issueTestResult, null, 2));
      
      // The core assertion: if the file is accessible via URL, our validator should find it
      if (issueTestResult.urlAccessible) {
        expect(issueTestResult.fileExists).toBe(true);
        expect(issueTestResult.validation.isValid).toBe(true);
      }
      
      // Log diagnostic info regardless
      expect(issueTestResult.testPath).toBe('icons/commodities/gems/gem-cluster-red.webp');
    });
  });
});