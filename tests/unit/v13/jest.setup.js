/**
 * Jest setup for FoundryVTT v13 unit tests  
 * Provides minimal necessary mocks - avoid heavy mocking where possible
 */

beforeEach(() => {
  // Reset global state before each test
  delete global.game;
  delete global.CONFIG;
  delete global.window; 
  delete global.foundry;
  
  // Only mock what's absolutely necessary for unit tests to run
  // Prefer testing against real interfaces when possible
  // Note: v13 may have different global structure than v12
});