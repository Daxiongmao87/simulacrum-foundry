/**
 * Jest setup file for FoundryVTT environment mocking
 */

// Mock FoundryVTT globals
global.game = {
  collections: new Map(),
  packs: [],
  settings: {
    register: jest.fn(),
    get: jest.fn(),
    set: jest.fn()
  },
  system: {
    documentTypes: {}
  },
  user: {
    _id: 'testuser',
    isGM: true
  }
};

global.CONFIG = {
  Document: {
    documentTypes: {
      Actor: 'Actor',
      Item: 'Item',
      Scene: 'Scene',
      JournalEntry: 'JournalEntry'
    }
  },
  Actor: {
    documentClass: class MockActor {
      static get schema() {
        return {
          fields: {
            name: {},
            type: {},
            system: {}
          },
          has: () => true,
          getField: () => ({
            fields: {
              attributes: {},
              details: {}
            }
          })
        };
      }
      static get hierarchy() {
        return {};
      }
    }
  }
};

global.Hooks = {
  on: jest.fn(),
  once: jest.fn(),
  call: jest.fn(),
  callAll: jest.fn()
};

global.foundry = {
  utils: {
    mergeObject: (target, source) => Object.assign({}, target, source),
    duplicate: obj => JSON.parse(JSON.stringify(obj))
  },
  applications: {
    api: {
      HandlebarsApplicationMixin: (BaseClass) => class extends BaseClass {
        static DEFAULT_OPTIONS = {};
        static PARTS = {};
        
        render(force = false, options = {}) {
          return Promise.resolve();
        }
        
        _prepareContext(options) {
          return {};
        }
        
        _onRender(context, options) {
          // Mock implementation
        }
      }
    },
    sidebar: {
      AbstractSidebarTab: class MockAbstractSidebarTab {
        static DEFAULT_OPTIONS = {};
        
        constructor(options = {}) {
          this.options = options;
        }
        
        render(force = false, options = {}) {
          return Promise.resolve();
        }
      }
    }
  }
};

global.CONST = {
  CHAT_MESSAGE_TYPES: {
    OTHER: 0,
    OOC: 1,
    IC: 2,
    EMOTE: 3,
    WHISPER: 4,
    ROLL: 5
  }
};

// Mock FoundryVTT utility functions
global.mergeObject = (target, source) => Object.assign({}, target, source);
global.duplicate = obj => JSON.parse(JSON.stringify(obj));
global.setProperty = (object, key, value) => {
  const keys = key.split('.');
  let current = object;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current)) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
  return true;
};
global.getProperty = (object, key) => {
  const keys = key.split('.');
  let current = object;
  for (const k of keys) {
    if (current && typeof current === 'object' && k in current) {
      current = current[k];
    } else {
      return undefined;
    }
  }
  return current;
};
global.hasProperty = (object, key) => {
  return getProperty(object, key) !== undefined;
};

// Mock fetch globally
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  })
);

// Mock classes
global.Application = class MockApplication {};
global.FormApplication = class MockFormApplication extends global.Application {};
global.Dialog = class MockDialog {};
global.ChatMessage = class MockChatMessage {
  static create() {
    return Promise.resolve();
  }
};


