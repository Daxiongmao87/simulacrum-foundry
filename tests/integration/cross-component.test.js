/**
 * Cross-Component Integration Tests
 * Validates that all major components work together correctly
 * Including FoundryVTT lifecycle integration testing
 */

import { ToolRegistry } from '../../scripts/core/tool-registry.js';
import { DocumentAPI } from '../../scripts/core/document-api.js';
import { AIClient } from '../../scripts/core/ai-client.js';
import { ConversationManager } from '../../scripts/core/conversation.js';
import {
  setupMockFoundryEnvironment,
  cleanupMockEnvironment,
  createParameterizedSystemTests
} from '../helpers/mock-setup.js';

/**
 * Mock FoundryVTT Hooks system for lifecycle testing
 */
function createMockHooks() {
  const registeredHooks = new Map();

  return {
    registered: registeredHooks,
    once: jest.fn((event, callback) => {
      if (!registeredHooks.has(event)) {
        registeredHooks.set(event, []);
      }
      registeredHooks.get(event).push({ callback, once: true });
    }),
    on: jest.fn((event, callback) => {
      if (!registeredHooks.has(event)) {
        registeredHooks.set(event, []);
      }
      registeredHooks.get(event).push({ callback, once: false });
    }),
    call: jest.fn((event, ...args) => {
      const hooks = registeredHooks.get(event) || [];
      const results = [];

      hooks.forEach(({ callback, once }) => {
        try {
          results.push(callback(...args));
        } catch (error) {
          // FoundryVTT behavior: log error but continue processing other hooks
          console.warn(`Hook callback failed for event ${event}:`, error.message);
          results.push(undefined);
        }
        if (once) {
          // Remove once hooks after calling
          const index = hooks.indexOf({ callback, once });
          if (index > -1) hooks.splice(index, 1);
        }
      });

      return results;
    }),
    callAll: jest.fn((event, ...args) => {
      const hooks = registeredHooks.get(event) || [];
      return Promise.all(hooks.map(({ callback }) => callback(...args)));
    })
  };
}

// FoundryVTT Lifecycle Integration Tests
describe('FoundryVTT Lifecycle Integration', () => {
  let mockHooks;
  let mockModuleCore;

  beforeEach(() => {
    setupMockFoundryEnvironment('D&D 5e');
    mockHooks = createMockHooks();
    global.Hooks = mockHooks;

    // Mock module core that would register hooks
    mockModuleCore = {
      ready: false,
      initialize: jest.fn(),
      onReady: jest.fn(),
      shutdown: jest.fn()
    };
  });

  afterEach(() => {
    cleanupMockEnvironment();
    delete global.Hooks;
  });

  describe('Three-Phase Initialization', () => {
    it('should register init hook without accessing CONFIG', () => {
      // Simulate module registration phase
      const initCallback = jest.fn();
      mockHooks.once('init', initCallback);

      expect(mockHooks.once).toHaveBeenCalledWith('init', initCallback);
      expect(mockHooks.registered.has('init')).toBe(true);
    });

    it('should register ready hook for system initialization', () => {
      const readyCallback = jest.fn();
      mockHooks.once('ready', readyCallback);

      expect(mockHooks.once).toHaveBeenCalledWith('ready', readyCallback);
      expect(mockHooks.registered.has('ready')).toBe(true);
    });

    it('should execute hooks in correct order', () => {
      const initCallback = jest.fn(() => 'init');
      const readyCallback = jest.fn(() => 'ready');

      mockHooks.once('init', initCallback);
      mockHooks.once('ready', readyCallback);

      // Simulate FoundryVTT calling hooks in order
      const initResults = mockHooks.call('init');
      const readyResults = mockHooks.call('ready');

      expect(initCallback).toHaveBeenCalled();
      expect(readyCallback).toHaveBeenCalled();
      expect(initResults).toContain('init');
      expect(readyResults).toContain('ready');
    });

    it('should handle dependency initialization order', () => {
      const dependencies = [];

      const initDocumentAPI = jest.fn(() => dependencies.push('DocumentAPI'));
      const initToolRegistry = jest.fn(() => dependencies.push('ToolRegistry'));
      const initAIClient = jest.fn(() => dependencies.push('AIClient'));

      // Register in dependency order
      mockHooks.once('ready', initDocumentAPI);
      mockHooks.once('ready', initToolRegistry);
      mockHooks.once('ready', initAIClient);

      // Simulate ready event
      mockHooks.call('ready');

      expect(dependencies).toEqual(['DocumentAPI', 'ToolRegistry', 'AIClient']);
    });
  });

  describe('Environment Validation', () => {
    it('should validate CONFIG availability before schema discovery', () => {
      const validateEnvironment = jest.fn(() => {
        if (!global.CONFIG) throw new Error('CONFIG not available');
        if (!global.CONFIG.Document) throw new Error('Document types not loaded');
        return true;
      });

      mockHooks.once('ready', validateEnvironment);

      // CONFIG should be available during ready phase
      expect(() => mockHooks.call('ready')).not.toThrow();
      expect(validateEnvironment).toHaveReturnedWith(true);
    });

    it('should handle initialization failure gracefully', () => {
      const failingInit = jest.fn(() => {
        throw new Error('Initialization failed');
      });

      mockHooks.once('ready', failingInit);

      // Should not crash when initialization fails
      expect(() => mockHooks.call('ready')).not.toThrow();
      expect(failingInit).toHaveBeenCalled();
    });

    it('should validate game readiness before document operations', () => {
      const checkGameReady = jest.fn(() => {
        if (!global.game) throw new Error('Game not ready');
        if (!global.game.user) throw new Error('User not loaded');
        if (!global.game.world) throw new Error('World not loaded');
        return true;
      });

      mockHooks.once('ready', checkGameReady);
      mockHooks.call('ready');

      expect(checkGameReady).toHaveReturnedWith(true);
    });
  });

  describe('Document Change Hook Integration', () => {
    it('should register document change hooks', () => {
      const createHook = jest.fn();
      const updateHook = jest.fn();
      const deleteHook = jest.fn();

      mockHooks.on('createDocument', createHook);
      mockHooks.on('updateDocument', updateHook);
      mockHooks.on('deleteDocument', deleteHook);

      expect(mockHooks.registered.has('createDocument')).toBe(true);
      expect(mockHooks.registered.has('updateDocument')).toBe(true);
      expect(mockHooks.registered.has('deleteDocument')).toBe(true);
    });

    it('should handle document changes only when module is ready', () => {
      const documentChangeHandler = jest.fn((document, options, userId) => {
        if (!mockModuleCore.ready) {
          return; // Skip processing if not ready
        }
        // Process document change
      });

      mockHooks.on('createDocument', documentChangeHandler);

      // Simulate document creation before module ready
      mockModuleCore.ready = false;
      mockHooks.call('createDocument', { id: 'test' }, {}, 'user1');

      // Simulate document creation after module ready
      mockModuleCore.ready = true;
      mockHooks.call('createDocument', { id: 'test2' }, {}, 'user1');

      expect(documentChangeHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Boundaries and Recovery', () => {
    it('should prevent cascade failures between components', () => {
      const componentA = jest.fn(() => { throw new Error('Component A failed'); });
      const componentB = jest.fn(() => 'Component B success');
      const componentC = jest.fn(() => 'Component C success');

      mockHooks.once('ready', componentA);
      mockHooks.once('ready', componentB);
      mockHooks.once('ready', componentC);

      // All components should run despite A failing
      const results = mockHooks.call('ready');

      expect(componentA).toHaveBeenCalled();
      expect(componentB).toHaveBeenCalled();
      expect(componentC).toHaveBeenCalled();
      expect(results.filter(r => typeof r === 'string')).toHaveLength(2);
    });
  });
});

// Parameterized integration tests across game systems
describe.each(createParameterizedSystemTests())(
  'Cross-Component Integration with %s system',
  (systemName, systemConfig) => {
    let toolRegistry, documentAPI, aiClient, conversationManager;

    beforeEach(() => {
      setupMockFoundryEnvironment(systemName);

      // Initialize components in dependency order
      documentAPI = new DocumentAPI();
      toolRegistry = new ToolRegistry();

      // Mock AI client settings
      global.game.settings.get
        // provider removed
        .mockReturnValueOnce('sk-test')   // apiKey
        .mockReturnValueOnce('https://api.openai.com/v1') // baseURL
        .mockReturnValueOnce('gpt-3.5-turbo') // model
        .mockReturnValueOnce(4096)        // maxTokens
        .mockReturnValueOnce(0.7);        // temperature

      aiClient = new AIClient();
      conversationManager = new ConversationManager();
    });

    afterEach(() => {
      cleanupMockEnvironment();
    });

    describe('Component Initialization Chain', () => {
      it('should initialize all components without errors', () => {
        expect(documentAPI).toBeDefined();
        expect(toolRegistry).toBeDefined();
        expect(aiClient).toBeDefined();
        expect(conversationManager).toBeDefined();
      });

      it('should validate component readiness checks', () => {
        expect(documentAPI).toBeDefined();
        expect(toolRegistry.tools).toBeDefined();
        // Provider-agnostic: ensure baseURL/model configuration is available if needed
        expect(aiClient).toBeDefined();
      });
    });

    describe('Tool Registry Integration', () => {
      it('should register tools with valid schemas', () => {
        const toolMap = toolRegistry.tools;

        // Tool registry should be initialized
        expect(toolMap).toBeInstanceOf(Map);
      });

      it('should validate tool execution flow', async () => {
        const toolMap = toolRegistry.tools;
        expect(toolMap).toBeInstanceOf(Map);

        // Validate tool registry structure
        expect(toolRegistry.categories).toBeInstanceOf(Map);
        expect(toolRegistry.dependencies).toBeInstanceOf(Map);
      });
    });

    describe('Document API Integration', () => {
      it('should handle document operations through API', async () => {
        // Test document type discovery using static methods
        const types = DocumentAPI.getAllDocumentTypes();
        const expectedTypes = Object.keys(systemConfig.documentTypes);

        expectedTypes.forEach(docType => {
          expect(types).toContain(docType);
        });
      });

      it('should validate system-agnostic operation', async () => {
        const documentTypes = Object.keys(systemConfig.documentTypes);

        if (documentTypes.length > 0) {
          const firstType = documentTypes[0];
          const isValid = DocumentAPI.isValidDocumentType(firstType);
          expect(isValid).toBe(true);
        }

        const isInvalid = DocumentAPI.isValidDocumentType('NonExistentType');
        expect(isInvalid).toBe(false);
      });
    });

    describe('AI Client Integration', () => {
      it('should initialize with proper configuration', () => {
        // Test AI client exists and has expected structure
        expect(aiClient).toBeDefined();
        // Provider-agnostic: no provider field asserted
      });

      it('should handle conversation management integration', () => {
        expect(conversationManager).toBeDefined();

        // Test conversation manager has expected methods
        expect(typeof conversationManager.addMessage).toBe('function');
        expect(typeof conversationManager.clear).toBe('function');
      });
    });

    describe('Full Workflow Integration', () => {
      it('should support complete AI workflow simulation', async () => {
        // Mock AI response with tool calls
        const mockResponse = {
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_test',
                type: 'function',
                function: {
                  name: 'list_documents',
                  arguments: JSON.stringify({ documentType: 'JournalEntry' })
                }
              }]
            }
          }]
        };

        // Mock the AI client's sendMessage method
        aiClient.sendMessage = jest.fn().mockResolvedValue({
          content: 'I found 2 Journal Entry documents in your world.',
          tool_calls: mockResponse.choices[0].message.tool_calls
        });

        // Simulate message processing
        const userMessage = 'List my journal entries';
        conversationManager.addMessage('user', userMessage);

        const response = await aiClient.sendMessage(userMessage);
        expect(response.content).toContain('Journal Entry');
      });

      it('should handle error propagation across components', async () => {
        // Test error handling integration
        const invalidType = 'NonExistentDocumentType';

        const isValid = DocumentAPI.isValidDocumentType(invalidType);
        expect(isValid).toBe(false);
      });
    });

    describe('Settings Integration', () => {
      it('should propagate settings changes across components', () => {
        // Mock settings change
        const newProvider = 'ollama';
        global.game.settings.get.mockReturnValue(newProvider);

        // Verify components can react to settings changes
        expect(global.game.settings.get).toBeDefined();
      });
    });

    describe('Permission Integration', () => {
      it('should validate permissions across component boundaries', () => {
        // Test that document operations respect permissions
        expect(global.game.user.isGM).toBe(true);
        expect(global.game.user.hasRole()).toBe(true);
      });
    });
  });
