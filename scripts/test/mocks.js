// Mock FoundryVTT APIs for testing

export const mockCONST = {
  USER_ROLES: {
    GM: 3,
    ASSISTANT_GM: 2,
    USER: 0,
  },
};

// Mock Document Class for CONFIG
class MockDocument {
  constructor(data) {
    this.data = data;
    this.name = data.name;
    this.id = data._id || 'mockId';
  }

  async update(updates) {
    // Simulate document update
    Object.assign(this.data, updates);
    this.name = this.data.name; // Update name if it's changed
    return this;
  }

  static async create(data) {
    // Simulate document creation
    return new MockDocument(data);
  }

  async delete() {
    // Simulate document deletion
    return this;
  }
}

export const mockCONFIG = {
  Actor: {
    documentClass: MockDocument,
  },
  Item: {
    documentClass: MockDocument,
  },
  Scene: {
    documentClass: MockDocument,
  },
  // Add other document types as needed for testing
};

export const mockGame = {
  user: { isGM: true, role: mockCONST.USER_ROLES.GM },
  settings: {
    get: (module, key) => {
      const defaults = {
        simulacrum: {
          permission: 'GM',
          apiEndpoint: 'https://api.openai.com/v1',
        },
      };
      return defaults[module]?.[key];
    },
  },
  collections: {
    _collections: new Map([
      [
        'Actor',
        {
          get: (id) => ({
            id,
            name: 'MockActor',
            type: 'Actor',
            update: async (updates) => {
              // Simulate update on retrieved document
              Object.assign(this, updates);
              return this;
            },
          }),
          values: () => [
            { id: '1', name: 'Doc1', type: 'Actor' },
            { id: '2', name: 'Doc2', type: 'Actor' },
          ],
        },
      ],
      [
        'Item',
        {
          get: (id) => ({
            id,
            name: 'MockItem',
            type: 'Item',
            update: async (updates) => {
              // Simulate update on retrieved document
              Object.assign(this, updates);
              return this;
            },
          }),
          values: () => [
            { id: '3', name: 'Doc3', type: 'Item' },
            { id: '4', name: 'Doc4', type: 'Item' },
          ],
        },
      ],
      [
        'Scene',
        {
          get: (id) => ({
            id,
            name: 'MockScene',
            type: 'Scene',
            update: async (updates) => {
              // Simulate update on retrieved document
              Object.assign(this, updates);
              return this;
            },
          }),
          values: () => [
            { id: '5', name: 'Doc5', type: 'Scene' },
            { id: '6', name: 'Doc6', type: 'Scene' },
          ],
        },
      ],
    ]),
    get: function (name) {
      return this._collections.get(name);
    },
    entries: function () {
      return this._collections.entries();
    },
    values: function () {
      return this._collections.values();
    },
  },
  simulacrum: {
    toolRegistry: null,
  },
};

/**
 * Mock FilePicker for controlled testing of file existence.
 * @type {Object}
 */
export const mockFilePicker = {
  _mockFiles: new Set(),
  _mockDelay: 0, // Milliseconds delay for browse operation
  _mockError: null, // Error to throw

  /**
   * Adds a file path to the mock file system.
   * @param {string} path - The absolute path of the file to add.
   */
  addFile(path) {
    this._mockFiles.add(path);
  },

  /**
   * Clears all mock files.
   */
  clearFiles() {
    this._mockFiles.clear();
  },

  /**
   * Sets a delay for the browse operation.
   * @param {number} delay - Delay in milliseconds.
   */
  setDelay(delay) {
    this._mockDelay = delay;
  },

  /**
   * Sets an error to be thrown by browse.
   * @param {Error} error - The error to throw.
   */
  setError(error) {
    this._mockError = error;
  },

  /**
   * Simulates FilePicker.browse.
   * @param {string} source - The source (e.g., 'data').
   * @param {string} directory - The directory to browse.
   * @param {object} options - Browse options.
   * @returns {Promise<{files: string[]}>} - A promise resolving to an object with a 'files' array.
   */
  async browse(source, directory, _options) {
    if (this._mockError) {
      const errorToThrow = this._mockError;
      this._mockError = null; // Clear error after throwing
      throw errorToThrow;
    }

    if (this._mockDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this._mockDelay));
    }

    const filesInDirectory = Array.from(this._mockFiles).filter((file) => {
      const fileDir = file.substring(0, file.lastIndexOf('/'));
      return fileDir === directory;
    });

    return { files: filesInDirectory };
  },
};

// Mock global FoundryVTT classes
global.Application = class MockApplication {
  constructor() {}
  render() {}
  close() {}
};

global.FormApplication = class MockFormApplication extends global.Application {
  constructor() {
    super();
  }
  _updateObject() {}
  _getHeaderButtons() {
    return [];
  }
  _onChangeInput() {}
};

// Set up global mock for FilePicker
global.FilePicker = mockFilePicker;

// Mock global ui.notifications
global.ui = {
  notifications: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
};

// Mock global CONFIG
global.CONFIG = mockCONFIG;

// Mock global game
global.game = mockGame;
