/**
 * @jest-environment jsdom
 */

import { 
  isFoundryEnvironmentAvailable, 
  isBrowserEnvironment, 
  isTestEnvironment, 
  checkToolExecutionEnvironment 
} from '../../scripts/utils/environment.js';

describe('Environment Detection', () => {
  let originalGame, originalCONFIG;
  
  beforeEach(() => {
    // Save original values
    originalGame = globalThis.game;
    originalCONFIG = globalThis.CONFIG;
  });
  
  afterEach(() => {
    // Restore original values
    globalThis.game = originalGame;
    globalThis.CONFIG = originalCONFIG;
  });

  describe('isFoundryEnvironmentAvailable', () => {
    it('should return false when game is undefined', () => {
      delete globalThis.game;
      expect(isFoundryEnvironmentAvailable()).toBe(false);
    });

    it('should return true when game, CONFIG, and global are all available', () => {
      globalThis.game = {};
      globalThis.CONFIG = {};
      // In Jest test environment, global is actually available
      expect(isFoundryEnvironmentAvailable()).toBe(true);
    });

    it('should return false when CONFIG is undefined', () => {
      globalThis.game = {};
      delete globalThis.CONFIG;
      expect(isFoundryEnvironmentAvailable()).toBe(false);
    });

    it('should return false when game is null', () => {
      globalThis.game = null;
      globalThis.CONFIG = {};
      expect(isFoundryEnvironmentAvailable()).toBe(false);
    });

    it('should handle exceptions gracefully', () => {
      // Test the basic error handling by ensuring the function doesn't throw
      expect(() => isFoundryEnvironmentAvailable()).not.toThrow();
    });
  });

  describe('isBrowserEnvironment', () => {
    it('should return true in jsdom environment', () => {
      expect(isBrowserEnvironment()).toBe(true);
    });

    it('should handle exceptions gracefully', () => {
      expect(() => isBrowserEnvironment()).not.toThrow();
    });
  });

  describe('isTestEnvironment', () => {
    it('should return true when jest is available', () => {
      expect(isTestEnvironment()).toBe(true);
    });
  });

  describe('checkToolExecutionEnvironment', () => {
    it('should prevent tool execution when FoundryVTT is not available', () => {
      delete globalThis.game;
      delete globalThis.CONFIG;
      
      const result = checkToolExecutionEnvironment();
      expect(result.canExecuteTools).toBe(false);
      expect(result.foundryAvailable).toBe(false);
      expect(result.reason).toBe('FoundryVTT environment not available');
    });

    it('should provide detailed environment information', () => {
      globalThis.game = {};
      globalThis.CONFIG = {};
      
      const result = checkToolExecutionEnvironment();
      expect(result).toHaveProperty('canExecuteTools');
      expect(result).toHaveProperty('foundryAvailable');
      expect(result).toHaveProperty('browserEnv');
      expect(result).toHaveProperty('testEnv');
      expect(result).toHaveProperty('reason');
      
      // In Jest test environment with all globals available, should allow tool execution
      expect(result.canExecuteTools).toBe(true);
      expect(result.foundryAvailable).toBe(true);
      expect(result.testEnv).toBe(true);
    });
  });
});