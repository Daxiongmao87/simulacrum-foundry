/**
 * @jest-environment jsdom
 */

import { SimulacrumCore } from '../../scripts/core/simulacrum-core.js';

describe('Tool Calling Probe', () => {
  let originalGame, originalCONFIG;
  
  beforeEach(() => {
    // Save original values
    originalGame = globalThis.game;
    originalCONFIG = globalThis.CONFIG;
    
    // Reset the static property
    SimulacrumCore.toolCallingSupported = null;
  });
  
  afterEach(() => {
    // Restore original values
    globalThis.game = originalGame;
    globalThis.CONFIG = originalCONFIG;
  });

  it('should skip probe and set toolCallingSupported=false when FoundryVTT environment not available', async () => {
    // Remove FoundryVTT environment objects
    delete globalThis.game;
    delete globalThis.CONFIG;
    
    // Mock AI client - it should never be called since environment check should prevent probe
    const mockAIClient = {
      chat: jest.fn()
    };
    SimulacrumCore.aiClient = mockAIClient;
    
    // Call the detection method
    const result = await SimulacrumCore.detectToolCallingSupport();
    
    // Should return false without calling AI client
    expect(result).toBe(false);
    expect(SimulacrumCore.toolCallingSupported).toBe(false);
    
    // AI client should never be called since environment check should prevent it
    expect(mockAIClient.chat).not.toHaveBeenCalled();
  });
  
  it('should proceed with probe when FoundryVTT environment is available', async () => {
    // Set up FoundryVTT environment
    globalThis.game = {};
    globalThis.CONFIG = {};
    
    // Mock AI client to simulate successful tool calling response
    const mockAIClient = {
      chat: jest.fn().mockResolvedValue({
        choices: [{
          message: {
            content: 'I will call the tool',
            tool_calls: [{
              id: 'test-call',
              function: {
                name: 'list_documents',
                arguments: '{}'
              }
            }]
          }
        }]
      })
    };
    SimulacrumCore.aiClient = mockAIClient;
    
    // Mock tool registry
    const mockToolRegistry = {
      getToolSchemas: jest.fn().mockReturnValue([
        {
          type: 'function',
          function: {
            name: 'list_documents',
            description: 'List documents',
            parameters: { type: 'object', properties: {} }
          }
        }
      ])
    };
    
    // Dynamically import and mock the tool registry
    const originalModule = await import('../../scripts/core/tool-registry.js');
    originalModule.toolRegistry.getToolSchemas = mockToolRegistry.getToolSchemas;
    
    // Call the detection method
    const result = await SimulacrumCore.detectToolCallingSupport();
    
    // Should proceed with probe since environment is available
    expect(mockAIClient.chat).toHaveBeenCalled();
    expect(result).toBe(true);
    expect(SimulacrumCore.toolCallingSupported).toBe(true);
  });
  
  it('should set toolCallingSupported=false when no tools are available', async () => {
    // Set up FoundryVTT environment
    globalThis.game = {};
    globalThis.CONFIG = {};
    
    // Mock tool registry to return empty tools
    const mockToolRegistry = {
      getToolSchemas: jest.fn().mockReturnValue([])
    };
    
    // Dynamically import and mock the tool registry
    const originalModule = await import('../../scripts/core/tool-registry.js');
    originalModule.toolRegistry.getToolSchemas = mockToolRegistry.getToolSchemas;
    
    // Mock AI client - should not be called since no tools available
    const mockAIClient = {
      chat: jest.fn()
    };
    SimulacrumCore.aiClient = mockAIClient;
    
    // Call the detection method
    const result = await SimulacrumCore.detectToolCallingSupport();
    
    // Should return false without calling AI client
    expect(result).toBe(false);
    expect(SimulacrumCore.toolCallingSupported).toBe(false);
    expect(mockAIClient.chat).not.toHaveBeenCalled();
  });
});