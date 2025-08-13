/**
 * @file Integration test for image validation dynamic source discovery
 * @description Tests the new dynamic source discovery implementation without requiring full FoundryVTT
 */

import { ImageValidator } from '../../scripts/core/image-validator.js';

describe('Image Validation Dynamic Source Discovery', () => {
  let mockFilePicker;
  
  beforeEach(() => {
    // Clear any existing FilePicker mock
    global.FilePicker = undefined;
  });

  afterEach(() => {
    // Cleanup
    global.FilePicker = undefined;
  });

  test('should use official FilePicker.sources API when available', async () => {
    // Mock FoundryVTT FilePicker with official sources property
    global.FilePicker = {
      sources: {
        data: { target: '/foundry/data' },
        public: { target: '/foundry/public' },
        s3: { bucket: 'my-bucket', target: 's3://my-bucket' }
      },
      browse: jest.fn().mockImplementation(async (source, directory) => {
        if (source === 'public' && directory === 'icons/commodities/gems') {
          return {
            files: ['icons/commodities/gems/gem-cluster-red.webp'],
            dirs: []
          };
        }
        return { files: [], dirs: [] };
      })
    };

    console.log = jest.fn(); // Mock console.log to capture our logging

    const result = await ImageValidator.fileExists('icons/commodities/gems/gem-cluster-red.webp');

    expect(result).toBe(true);
    expect(console.log).toHaveBeenCalledWith(
      'Simulacrum | ImageValidator | Using official FilePicker.sources API:',
      ['data', 'public', 's3']
    );
    
    // Should call FilePicker.browse for each source until found
    expect(global.FilePicker.browse).toHaveBeenCalledWith('data', 'icons/commodities/gems');
    expect(global.FilePicker.browse).toHaveBeenCalledWith('public', 'icons/commodities/gems');
  });

  test('should fall back to FilePicker instance sources', async () => {
    // Mock FilePicker constructor with instance sources
    global.FilePicker = jest.fn().mockImplementation(() => ({
      sources: {
        data: { target: '/foundry/data' },
        public: { target: '/foundry/public' }
      }
    }));
    
    global.FilePicker.browse = jest.fn().mockImplementation(async (source, directory) => {
      if (source === 'data' && directory === 'worlds/test-world/images') {
        return {
          files: ['worlds/test-world/images/test.png'],
          dirs: []
        };
      }
      return { files: [], dirs: [] };
    });

    console.log = jest.fn();

    const result = await ImageValidator.fileExists('worlds/test-world/images/test.png');

    expect(result).toBe(true);
    expect(console.log).toHaveBeenCalledWith(
      'Simulacrum | ImageValidator | Using FilePicker instance sources:',
      ['data', 'public']
    );
  });

  test('should fall back to trial-and-error with official source names', async () => {
    // Mock FilePicker with no sources property, only browse method
    global.FilePicker = {
      browse: jest.fn().mockImplementation(async (source, directory) => {
        if (source === 'data') {
          throw new Error('Data source not available');
        }
        if (source === 'public' && directory === 'icons') {
          return {
            files: ['icons/test-icon.png'],
            dirs: []
          };
        }
        if (source === 's3') {
          throw new Error('S3 source not configured');
        }
        return { files: [], dirs: [] };
      })
    };

    console.log = jest.fn();
    console.debug = jest.fn();

    const result = await ImageValidator.fileExists('icons/test-icon.png');

    expect(result).toBe(true);
    expect(console.log).toHaveBeenCalledWith(
      'Simulacrum | ImageValidator | Using trial-and-error discovery with official source names'
    );
    expect(console.log).toHaveBeenCalledWith(
      'Simulacrum | ImageValidator | Discovered available sources:',
      ['public']
    );

    // Should try all official sources: data, public, s3
    expect(global.FilePicker.browse).toHaveBeenCalledWith('data', '');
    expect(global.FilePicker.browse).toHaveBeenCalledWith('public', '');
    expect(global.FilePicker.browse).toHaveBeenCalledWith('s3', '');
  });

  test('should handle complete FilePicker API failure gracefully', async () => {
    // Mock FilePicker that throws on all operations
    global.FilePicker = {
      browse: jest.fn().mockRejectedValue(new Error('FilePicker not available'))
    };

    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
    console.debug = jest.fn();

    const result = await ImageValidator.fileExists('any/path.png');

    expect(result).toBe(false);
    
    // Should warn about using emergency fallback when source discovery fails
    expect(console.warn).toHaveBeenCalledWith(
      'Simulacrum | ImageValidator | No FilePicker sources discovered, using emergency fallback'
    );
    
    // Should gracefully handle source failures without throwing errors
    // This is CORRECT behavior - individual source failures should be handled gracefully
    expect(global.FilePicker.browse).toHaveBeenCalledWith('data', ''); // Source discovery attempt
    expect(global.FilePicker.browse).toHaveBeenCalledWith('public', ''); // Source discovery attempt
    
    // After emergency fallback, tries to browse the actual file path with fallback sources
    expect(global.FilePicker.browse).toHaveBeenCalledWith('data', 'any'); // File existence check
    expect(global.FilePicker.browse).toHaveBeenCalledWith('public', 'any'); // File existence check
    
    // Should NOT call console.error - graceful failure is the correct behavior
    expect(console.error).not.toHaveBeenCalled();
  });

  test('should demonstrate the GitHub Issue #21 fix', async () => {
    // Mock the exact scenario from GitHub Issue #21
    global.FilePicker = {
      sources: {
        data: { target: '/foundry/data' },
        public: { target: '/foundry/public' }
      },
      browse: jest.fn().mockImplementation(async (source, directory) => {
        // Simulate that icons/ paths are in 'public' source, not 'data'
        if (source === 'data' && directory === 'icons/commodities/gems') {
          return { files: [], dirs: [] }; // Not found in data source
        }
        if (source === 'public' && directory === 'icons/commodities/gems') {
          return {
            files: ['icons/commodities/gems/gem-cluster-red.webp'],
            dirs: []
          };
        }
        return { files: [], dirs: [] };
      })
    };

    console.log = jest.fn();

    // Test the specific path from the GitHub issue
    const testPath = 'icons/commodities/gems/gem-cluster-red.webp';
    const result = await ImageValidator.fileExists(testPath);

    expect(result).toBe(true);
    expect(console.log).toHaveBeenCalledWith(
      'Simulacrum | ImageValidator | Using official FilePicker.sources API:',
      ['data', 'public']
    );

    // Verify it tries both sources dynamically
    expect(global.FilePicker.browse).toHaveBeenCalledWith('data', 'icons/commodities/gems');
    expect(global.FilePicker.browse).toHaveBeenCalledWith('public', 'icons/commodities/gems');

    // Test validation as well
    const validation = await ImageValidator.validateImagePath(testPath, { required: true });
    expect(validation.isValid).toBe(true);
    expect(validation.message).toBe('Image path is valid.');
  });
});