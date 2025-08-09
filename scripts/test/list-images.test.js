import { jest } from '@jest/globals';
import './mocks.js'; // FoundryVTT environment mocks

describe('ListImagesTool', () => {
  let ListImagesTool;
  let tool;

  beforeEach(async () => {
    // Clear module cache to get fresh imports
    jest.resetModules();

    // Import after mocks are set up
    const module = await import('../tools/list-images.js');
    ListImagesTool = module.ListImagesTool;

    tool = new ListImagesTool();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Tool Configuration', () => {
    test('should have correct tool name and description', () => {
      expect(tool.name).toBe('list_images');
      expect(tool.description).toContain('Lists available image files');
    });

    test('should not require confirmation for execution', () => {
      expect(tool.shouldConfirmExecute()).toBe(false);
    });

    test('should have correct parameter schema', () => {
      expect(tool.parameterSchema.type).toBe('object');
      expect(tool.parameterSchema.properties).toHaveProperty('keyword');
      expect(tool.parameterSchema.properties).toHaveProperty('directories');
      expect(tool.parameterSchema.properties).toHaveProperty('page');
      expect(tool.parameterSchema.properties).toHaveProperty('pageSize');
    });
  });

  describe('Keyword Matching', () => {
    test('should match wildcard patterns correctly', () => {
      expect(tool.matchesKeyword('dragon_token.png', '*dragon*')).toBe(true);
      expect(tool.matchesKeyword('red_dragon_large.jpg', '*dragon*')).toBe(
        true
      );
      expect(tool.matchesKeyword('wizard.png', '*dragon*')).toBe(false);
    });

    test('should match single character wildcards', () => {
      expect(tool.matchesKeyword('token_a.png', 'token_?.*')).toBe(true);
      expect(tool.matchesKeyword('token_ab.png', 'token_?.*')).toBe(false);
    });

    test('should be case insensitive', () => {
      expect(tool.matchesKeyword('DRAGON.PNG', '*dragon*')).toBe(true);
      expect(tool.matchesKeyword('dragon.png', '*DRAGON*')).toBe(true);
    });

    test('should handle file extensions', () => {
      expect(tool.matchesKeyword('image.png', '*.png')).toBe(true);
      expect(tool.matchesKeyword('image.jpg', '*.png')).toBe(false);
    });

    test('should match all files when no keyword or asterisk only', () => {
      expect(tool.matchesKeyword('anything.png', '*')).toBe(true);
      expect(tool.matchesKeyword('anything.png', '')).toBe(true);
      expect(tool.matchesKeyword('anything.png', undefined)).toBe(true);
    });

    test('should escape regex special characters', () => {
      expect(tool.matchesKeyword('test[1].png', 'test[1].*')).toBe(true);
      expect(tool.matchesKeyword('test.png', 'test.png')).toBe(true);
    });
  });

  describe('File Extension Detection', () => {
    test('should get correct file extensions', () => {
      expect(tool.getFileExtension('image.png')).toBe('png');
      expect(tool.getFileExtension('document.PDF')).toBe('pdf');
      expect(tool.getFileExtension('path/to/file.jpeg')).toBe('jpeg');
    });

    test('should return supported image extensions', () => {
      const extensions = tool.getSupportedImageExtensions();
      expect(extensions).toContain('.png');
      expect(extensions).toContain('.jpg');
      expect(extensions).toContain('.webp');
      expect(extensions).toContain('.svg');
    });
  });

  describe('Search Configurations', () => {
    test('should return correct configs for user directory', () => {
      const configs = tool.getSearchConfigs('user');
      expect(configs).toHaveLength(1);
      expect(configs[0].source).toBe('data');
      expect(configs[0].paths).toContain('worlds');
      expect(configs[0].paths).toContain('assets');
      expect(configs[0].paths).toContain('modules');
      expect(configs[0].paths).toContain('systems');
    });

    test('should return correct configs for core directory', () => {
      const configs = tool.getSearchConfigs('core');
      expect(configs).toHaveLength(1);
      expect(configs[0].source).toBe('public');
      expect(configs[0].paths).toContain('icons');
      expect(configs[0].paths).toContain('ui');
    });

    test('should return empty array for unknown directory', () => {
      const configs = tool.getSearchConfigs('unknown');
      expect(configs).toEqual([]);
    });
  });

  describe('Pagination', () => {
    const sampleImages = Array.from({ length: 125 }, (_, i) => ({
      path: `image${i}.png`,
      filename: `image${i}.png`,
      extension: 'png',
    }));

    test('should paginate results correctly', () => {
      const result = tool.paginateResults(sampleImages, 1, 50);

      expect(result.images).toHaveLength(50);
      expect(result.images[0].filename).toBe('image0.png');
      expect(result.pagination.currentPage).toBe(1);
      expect(result.pagination.totalResults).toBe(125);
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.hasNextPage).toBe(true);
      expect(result.pagination.hasPreviousPage).toBe(false);
    });

    test('should handle last page correctly', () => {
      const result = tool.paginateResults(sampleImages, 3, 50);

      expect(result.images).toHaveLength(25); // 125 - (2 * 50) = 25
      expect(result.pagination.currentPage).toBe(3);
      expect(result.pagination.hasNextPage).toBe(false);
      expect(result.pagination.hasPreviousPage).toBe(true);
    });

    test('should handle empty results', () => {
      const result = tool.paginateResults([], 1, 50);

      expect(result.images).toHaveLength(0);
      expect(result.pagination.totalResults).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
      expect(result.pagination.hasNextPage).toBe(false);
      expect(result.pagination.hasPreviousPage).toBe(false);
    });
  });

  describe('Tool Execution', () => {
    beforeEach(() => {
      // Mock FilePicker.browse
      global.FilePicker = {
        browse: jest.fn().mockResolvedValue({
          files: ['icons/dragon.png', 'icons/wizard.jpg'],
          dirs: [],
        }),
      };
    });

    test('should execute successfully with default parameters', async () => {
      const result = await tool.execute({});

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('images');
      expect(result.data).toHaveProperty('pagination');
      expect(result.message).toContain('Found');
    });

    test('should execute successfully with custom parameters', async () => {
      const params = {
        keyword: '*dragon*',
        directories: ['core'],
        page: 1,
        pageSize: 25,
      };

      const result = await tool.execute(params);

      expect(result.success).toBe(true);
      expect(result.data.pagination.pageSize).toBe(25);
    });

    test('should handle directory errors gracefully and still succeed', async () => {
      global.FilePicker.browse.mockRejectedValue(new Error('Access denied'));

      const result = await tool.execute({});

      // Tool should succeed but with empty results due to graceful error handling
      expect(result.success).toBe(true);
      expect(result.data.images).toHaveLength(0);
      expect(result.message).toContain('Found 0 images');
    });

    test('should respect abort signal', async () => {
      const abortController = new AbortController();
      abortController.abort();

      const result = await tool.execute({}, abortController.signal);

      // Tool should complete quickly when aborted
      expect(result).toBeDefined();
    });

    test('should call output handler for progress updates', async () => {
      const outputHandler = jest.fn();

      await tool.execute({}, null, outputHandler);

      expect(outputHandler).toHaveBeenCalledWith({
        type: 'progress',
        message: expect.stringContaining('Searching for images'),
      });
    });
  });

  describe('Directory Scanning', () => {
    beforeEach(() => {
      global.FilePicker = {
        browse: jest.fn(),
      };
    });

    test('should scan directory and return image info', async () => {
      global.FilePicker.browse.mockResolvedValue({
        files: ['assets/dragon.png', 'assets/wizard.jpg'],
        dirs: [],
      });

      const images = await tool.scanDirectory('data', 'assets', '*', [
        '.png',
        '.jpg',
      ]);

      expect(images).toHaveLength(2);
      expect(images[0]).toHaveProperty('path');
      expect(images[0]).toHaveProperty('filename');
      expect(images[0]).toHaveProperty('extension');
    });

    test('should handle directory access errors gracefully', async () => {
      global.FilePicker.browse.mockRejectedValue(
        new Error('Permission denied')
      );

      const images = await tool.scanDirectory('data', 'restricted', '*', [
        '.png',
      ]);

      expect(images).toHaveLength(0); // Should return empty array, not throw
    });

    test('should filter files by keyword', async () => {
      global.FilePicker.browse.mockResolvedValue({
        files: ['assets/dragon.png', 'assets/wizard.jpg'],
        dirs: [],
      });

      const images = await tool.scanDirectory('data', 'assets', '*dragon*', [
        '.png',
        '.jpg',
      ]);

      expect(images).toHaveLength(1);
      expect(images[0].filename).toBe('dragon.png');
    });
  });
});
