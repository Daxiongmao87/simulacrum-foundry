/**
 * Jest setup for FoundryVTT v13 unit tests  
 * Provides minimal necessary mocks - avoid heavy mocking where possible
 */
import { jest } from '@jest/globals';

beforeEach(() => {
  // Reset global state before each test
  delete global.CONFIG;
  delete global.window; 
  delete global.foundry;
  
  // Minimal game object mock to prevent ReferenceErrors in modules that use optional chaining
  global.game = {
    simulacrum: {
      logger: {
        debug: jest.fn(),
        info: jest.fn(), 
        warn: jest.fn(),
        error: jest.fn(),
        log: jest.fn()
      }
    }
  };
  
  // Only mock what's absolutely necessary for unit tests to run
  // Prefer testing against real interfaces when possible
  // Note: v13 may have different global structure than v12
});