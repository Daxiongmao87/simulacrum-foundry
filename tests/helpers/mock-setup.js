/**
 * Shared Test Utilities and Mock Setup Helpers
 * Eliminates code duplication and provides consistent mock environments
 */

import { ALL_GAME_SYSTEMS, getSystemConfig } from '../fixtures/game-systems.js';

/**
 * Setup FoundryVTT mock environment for a specific game system
 * @param {string} systemName - Name of the system to mock
 * @returns {Object} Mock objects for game, CONFIG, ui
 */
export function setupMockFoundryEnvironment(systemName = 'D&D 5e') {
  const systemConfig = getSystemConfig(systemName);
  
  if (!systemConfig) {
    throw new Error(`Unknown system: ${systemName}`);
  }

  const mockGame = createMockGame();
  const mockUI = createMockUI();
  
  // Setup global mocks
  global.game = mockGame;
  global.CONFIG = systemConfig;
  global.ui = mockUI;
  global.foundry = createMockFoundry();

  return { mockGame, mockConfig: systemConfig, mockUI };
}

/**
 * Create comprehensive mock game object
 */
function createMockGame() {
  return {
    settings: {
      get: jest.fn().mockImplementation((module, key) => {
        // Default settings for simulacrum module
        const defaults = {
          enabled: true,
          apiKey: 'sk-test-key',
          baseURL: 'https://api.openai.com/v1',
          model: 'gpt-3.5-turbo',
          maxTokens: 4096,
          temperature: 0.7
        };
        return defaults[key];
      }),
      set: jest.fn(),
      register: jest.fn()
    },
    collections: {
      get: jest.fn().mockImplementation((documentType) => {
        return createMockCollection(documentType);
      })
    },
    user: {
      id: 'test-user-123',
      name: 'Test User',
      isGM: true,
      hasRole: jest.fn().mockReturnValue(true),
      can: jest.fn().mockReturnValue(true)
    },
    world: {
      id: 'test-world-456',
      title: 'Test World',
      data: {
        title: 'Test World',
        system: 'test-system'
      }
    },
    system: {
      id: 'test-system',
      data: {
        name: 'Test System'
      }
    },
    packs: [],
    i18n: {
      localize: jest.fn((key) => key),
      format: jest.fn((key, data) => `${key} ${JSON.stringify(data)}`)
    }
  };
}

/**
 * Create mock document collection
 */
function createMockCollection(documentType) {
  return {
    size: 3,
    documentName: documentType,
    contents: [
      createMockDocument(`${documentType.toLowerCase()}1`, `Test ${documentType} 1`, documentType),
      createMockDocument(`${documentType.toLowerCase()}2`, `Test ${documentType} 2`, documentType),
      createMockDocument(`${documentType.toLowerCase()}3`, `Test ${documentType} 3`, documentType)
    ],
    get: jest.fn((id) => {
      const doc = createMockDocument(id, `Test ${documentType}`, documentType);
      return doc;
    }),
    filter: jest.fn(() => []),
    find: jest.fn(() => null),
    forEach: jest.fn()
  };
}

/**
 * Create mock document instance
 */
function createMockDocument(id, name, documentType) {
  return {
    id,
    _id: id,
    name,
    documentName: documentType,
    type: documentType.toLowerCase(),
    data: {
      name,
      _id: id
    },
    toObject: jest.fn(() => ({ _id: id, name, type: documentType.toLowerCase() })),
    toJSON: jest.fn(() => ({ _id: id, name, type: documentType.toLowerCase() })),
    canUserModify: jest.fn().mockReturnValue(true),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    clone: jest.fn(),
    getFlag: jest.fn(),
    setFlag: jest.fn()
  };
}

/**
 * Create mock UI object
 */
function createMockUI() {
  return {
    notifications: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      notify: jest.fn()
    },
    chat: {
      postOne: jest.fn()
    },
    sidebar: {
      tabs: {}
    }
  };
}

/**
 * Create mock Foundry utilities
 */
function createMockFoundry() {
  return {
    utils: {
      mergeObject: jest.fn((target, source) => ({ ...target, ...source })),
      duplicate: jest.fn((obj) => JSON.parse(JSON.stringify(obj))),
      deepClone: jest.fn((obj) => JSON.parse(JSON.stringify(obj))),
      isEmpty: jest.fn((obj) => Object.keys(obj).length === 0),
      getType: jest.fn((obj) => typeof obj)
    },
    data: {
      validators: {
        required: jest.fn()
      }
    }
  };
}

/**
 * Create mock permission testing environment
 */
export function setupMockPermissions(userRole = 'gm', documentPermissions = {}) {
  const isGM = userRole === 'gm';
  const isPlayer = userRole === 'player';
  const isObserver = userRole === 'observer';

  global.game.user.isGM = isGM;
  global.game.user.hasRole = jest.fn().mockImplementation((role) => {
    switch (role) {
      case 'GM':
      case 'GAMEMASTER': 
        return isGM;
      case 'TRUSTED':
        return isGM || userRole === 'trusted';
      case 'PLAYER':
        return isGM || isPlayer;
      case 'OBSERVER':
        return true; // All users can observe
      default:
        return false;
    }
  });

  // Mock the can method for general permissions (like document creation)
  global.game.user.can = jest.fn().mockImplementation((permission) => {
    if (isGM) return true; // GM can do anything
    
    // Check specific permissions passed to setupMockPermissions
    if (documentPermissions[permission] !== undefined) {
      return documentPermissions[permission];
    }
    
    // Default permissions based on user role
    switch (permission) {
      case 'create':
        return isGM || (isPlayer && documentPermissions.create !== false);
      case 'update':
      case 'delete':
        return isGM || isPlayer;
      default:
        return false;
    }
  });

  // Mock document permission checks
  const mockCanUserModify = jest.fn().mockImplementation((user, permission = 'update') => {
    if (isGM) return true; // GM can do anything
    
    // Check specific document permissions
    if (documentPermissions[permission]) {
      return documentPermissions[permission];
    }
    
    // Default permissions based on user role
    switch (permission) {
      case 'view':
      case 'read':
        return true;
      case 'create':
      case 'update':  
      case 'delete':
        return isGM || isPlayer;
      default:
        return false;
    }
  });

  // Mock testUserPermission method that PermissionManager uses
  const mockTestUserPermission = jest.fn().mockImplementation((user, permission) => {
    if (isGM) return true; // GM has all permissions
    
    // Check specific document permissions (handle both true and false values explicitly)
    if (documentPermissions.hasOwnProperty(permission)) {
      return documentPermissions[permission];
    }
    
    // Default permissions based on user role and permission level
    switch (permission) {
      case 'OWNER':
        // OWNER permission should return true if user is GM or if update/delete permissions are explicitly granted
        if (isGM) return true;
        // Check if any owner-level permission is granted (update, delete, or generic ownership)
        return documentPermissions.update === true || documentPermissions.delete === true || documentPermissions.owner === true;
      case 'OBSERVER':
        return true; // All users can observe by default
      case 'LIMITED':
        // Check if read permission is explicitly set
        if (documentPermissions.hasOwnProperty('read')) {
          return documentPermissions.read;
        }
        return isGM || isPlayer || isObserver;
      default:
        return false;
    }
  });

  // Apply permission mock to all document types
  const applyPermissionMock = (collection) => {
    collection.contents.forEach(doc => {
      doc.canUserModify = mockCanUserModify;
      doc.testUserPermission = mockTestUserPermission;
    });
  };

  // Setup permission mocks for all collections
  Object.keys(global.CONFIG.Document.documentTypes).forEach(documentType => {
    const collection = global.game.collections.get(documentType);
    if (collection) {
      applyPermissionMock(collection);
    }
  });

  // Return the mockTestUserPermission function but add properties for backward compatibility
  mockTestUserPermission.canUserModify = mockCanUserModify;
  mockTestUserPermission.testUserPermission = mockTestUserPermission;
  
  return mockTestUserPermission;
}

/**
 * Cleanup mock environment
 */
export function cleanupMockEnvironment() {
  delete global.game;
  delete global.CONFIG;
  delete global.ui;
  delete global.foundry;
  jest.clearAllMocks();
}

/**
 * Create parameterized test data for all game systems
 */
export function createParameterizedSystemTests() {
  return ALL_GAME_SYSTEMS.map(system => [
    system.name,
    system.config
  ]);
}

/**
 * Setup test environment for specific test scenario
 */
export function setupTestScenario(scenario) {
  switch (scenario) {
    case 'basic':
      return setupMockFoundryEnvironment('D&D 5e');
      
    case 'minimal':
      return setupMockFoundryEnvironment('Minimal Core');
      
    case 'edge-case':
      return setupMockFoundryEnvironment('Edge Case System');
      
    case 'pf2e':
      return setupMockFoundryEnvironment('Pathfinder 2e');
      
    default:
      throw new Error(`Unknown test scenario: ${scenario}`);
  }
}

/**
 * Assert document type agnostic behavior
 * Validates that functions work with any document type configuration
 */
export function assertSystemAgnostic(testFunction, expectedBehavior) {
  ALL_GAME_SYSTEMS.forEach(system => {
    // Skip empty systems for some tests
    if (system.name === 'Edge Case System' && 
        Object.keys(system.config.Document.documentTypes).length === 0) {
      return;
    }

    setupMockFoundryEnvironment(system.name);
    const result = testFunction();
    
    expect(result).toEqual(
      expect.objectContaining(expectedBehavior),
      `System-agnostic test failed for ${system.name}`
    );
    
    cleanupMockEnvironment();
  });
}

/**
 * Performance testing utilities
 */
export const PerformanceHelpers = {
  /**
   * Measure execution time of a function
   */
  measureTime: (fn) => {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    return { result, duration };
  },

  /**
   * Assert performance threshold
   */
  assertPerformance: (fn, maxDurationMs) => {
    const { result, duration } = PerformanceHelpers.measureTime(fn);
    expect(duration).toBeLessThan(maxDurationMs);
    return result;
  },

  /**
   * Create large document set for performance testing
   */
  createLargeDocumentSet: (documentType, count = 1000) => {
    return Array.from({ length: count }, (_, i) => 
      createMockDocument(`${documentType.toLowerCase()}${i}`, `Test ${documentType} ${i}`, documentType)
    );
  }
};
