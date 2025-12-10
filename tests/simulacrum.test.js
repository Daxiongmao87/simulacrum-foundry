// SPDX-License-Identifier: MIT
// Copyright © 2024-2025 Aaron Riechert

/**
 * Tests for main simulacrum module
 */

// Create mock functions
const mockRegisterAdvancedSettings = jest.fn();
const mockRegisterSidebarTab = jest.fn();
const mockSimulacrumCoreInit = jest.fn();
const mockLogger = { info: jest.fn(), error: jest.fn() };
const mockCreateLogger = jest.fn(() => mockLogger);

// Mock the imports
jest.mock('../scripts/core/simulacrum-core.js', () => ({
  SimulacrumCore: {
    init: mockSimulacrumCoreInit
  }
}));

jest.mock('../scripts/ui/simulacrum-sidebar-tab.js', () => ({
  registerSimulacrumSidebarTab: mockRegisterSidebarTab
}));

jest.mock('../scripts/ui/settings-interface.js', () => ({
  registerAdvancedSettings: mockRegisterAdvancedSettings,
  registerSettingsEnhancements: jest.fn()
}));

jest.mock('../scripts/utils/logger.js', () => ({
  createLogger: mockCreateLogger
}));

// Mock FoundryVTT globals before any imports
global.Hooks = {
  once: jest.fn()
};

global.game = {
  settings: {
    register: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  },
  keybindings: {
    register: jest.fn()
  },
  modules: {
    get: jest.fn().mockReturnValue({ api: {} })
  },
  user: {
    isGM: true
  },
  i18n: {
    localize: jest.fn((key) => key)
  }
};

global.CONFIG = {
  ui: {
    sidebar: {
      TABS: {
        simulacrum: {
          applicationClass: jest.fn()
        }
      }
    }
  }
};

global.window = {
  ui: {}
};

describe('Simulacrum Module Initialization', () => {
  let moduleExports;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('Module Import and Setup', () => {
    it('should import module without errors', async () => {
      expect(() => {
        moduleExports = require('../scripts/simulacrum.js');
      }).not.toThrow();
    });

    it('should register init hook when imported', async () => {
      moduleExports = require('../scripts/simulacrum.js');
      expect(Hooks.once).toHaveBeenCalledWith('init', expect.any(Function));
    });

    it('should register ready hook when imported', async () => {
      moduleExports = require('../scripts/simulacrum.js');
      expect(Hooks.once).toHaveBeenCalledWith('ready', expect.any(Function));
    });

    it('should create logger with correct component name', async () => {
      moduleExports = require('../scripts/simulacrum.js');
      expect(mockCreateLogger).toHaveBeenCalledWith('Module');
    });
  });

  describe('Init Hook Handler', () => {
    let initHandler;

    beforeEach(() => {
      moduleExports = require('../scripts/simulacrum.js');
      const initCall = Hooks.once.mock.calls.find(call => call[0] === 'init');
      initHandler = initCall[1];
    });

    it('should initialize all components when init hook fires', async () => {
      await initHandler();

      expect(mockSimulacrumCoreInit).toHaveBeenCalled();
      expect(mockRegisterSidebarTab).toHaveBeenCalled();
      expect(mockRegisterAdvancedSettings).toHaveBeenCalled();
    });

    // No redundant world enable toggle should be registered
    it('should not register a redundant enable toggle during init', async () => {
      await initHandler();
      const calls = game.settings.register.mock.calls.filter(c => c[0] === 'simulacrum' && c[1] === 'enabled');
      expect(calls.length).toBe(0);
    });

    // Provider setting removed (provider-agnostic)

    it('should register API key setting during init', async () => {
      await initHandler();

      expect(game.settings.register).toHaveBeenCalledWith(
        'simulacrum',
        'apiKey',
        expect.objectContaining({
          name: 'SIMULACRUM.Settings.ApiKey.Name',
          type: String,
          default: '',
          restricted: true
        })
      );
    });

    it('should register base URL setting during init', async () => {
      await initHandler();

      expect(game.settings.register).toHaveBeenCalledWith(
        'simulacrum',
        'baseURL',
        expect.objectContaining({
          name: 'API Base URL',
          type: String,
          default: 'http://localhost:11434/v1',
          restricted: true
        })
      );
    });

    it('should register model setting during init', async () => {
      await initHandler();

      expect(game.settings.register).toHaveBeenCalledWith(
        'simulacrum',
        'model',
        expect.objectContaining({
          name: 'AI Model',
          type: String,
          default: 'gpt-3.5-turbo',
          restricted: true
        })
      );
    });

    it('should use logger for initialization messages', async () => {
      await initHandler();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing Simulacrum AI Assistant'
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Settings registered');
    });
  });

  describe('Ready Hook Handler', () => {
    let readyHandler;

    beforeEach(() => {
      // Reset window.ui for each test
      global.window.ui = {};

      moduleExports = require('../scripts/simulacrum.js');
      const readyCall = Hooks.once.mock.calls.find(call => call[0] === 'ready');
      readyHandler = readyCall[1];
    });

    it('should not create a manual ui.simulacrum instance', async () => {
      await expect(readyHandler()).resolves.not.toThrow();
      expect(window.ui.simulacrum).toBeUndefined();
    });

    it('should use logger for ready messages', async () => {
      await readyHandler();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Simulacrum AI Assistant is ready!'
      );
    });
  });

  describe('Error Handling', () => {
    it('should have try-catch block for error handling', () => {
      const fs = require('fs');
      const moduleCode = fs.readFileSync(
        require.resolve('../scripts/simulacrum.js'),
        'utf8'
      );

      expect(moduleCode).toContain('try {');
      expect(moduleCode).toContain('} catch (error) {');
    });
  });
});
