/**
 * @file tests/unit/bootstrap-helpers.test.js
 * @description Unit tests for bootstrap helper modules
 */

import { jest } from '@jest/globals';
import { 
  loadBootstrapConfig, 
  generateWorldConfig,
  BOOTSTRAP_SCENARIOS 
} from '../helpers/bootstrap/config-loader.js';
import { BootstrapLogger } from '../helpers/bootstrap/shared-utilities.js';

// Mock Puppeteer page object
const mockPage = {
  url: () => 'http://localhost:30000',
  goto: jest.fn(),
  waitForFunction: jest.fn(),
  evaluate: jest.fn(),
  click: jest.fn(),
  type: jest.fn(),
  screenshot: jest.fn(),
  on: jest.fn(),
  off: jest.fn()
};

describe('Bootstrap Configuration System', () => {
  describe('loadBootstrapConfig', () => {
    it('should load default configuration when no overrides provided', () => {
      const config = loadBootstrapConfig();
      
      expect(config).toBeDefined();
      expect(config.systems).toContain('dnd5e');
      expect(config.bootstrap.timeouts.containerStart).toBe(30000);
      expect(config.bootstrap.enableRetries).toBe(true);
    });

    it('should apply configuration overrides', () => {
      const overrides = {
        systems: ['pf2e'],
        worldName: 'Custom World',
        bootstrap: {
          enableRetries: false
        }
      };
      
      const config = loadBootstrapConfig(overrides);
      
      expect(config.systems).toEqual(['pf2e']);
      expect(config.worldName).toBe('Custom World');
      expect(config.bootstrap.enableRetries).toBe(false);
    });

    it('should prioritize environment variables', () => {
      const originalEnv = process.env.FOUNDRY_LICENSE_KEY;
      process.env.FOUNDRY_LICENSE_KEY = 'TEST-KEY-123';
      
      const config = loadBootstrapConfig();
      expect(config.foundryLicenseKey).toBe('TEST-KEY-123');
      
      // Restore original environment
      process.env.FOUNDRY_LICENSE_KEY = originalEnv;
    });
  });

  describe('generateWorldConfig', () => {
    it('should generate world configuration for single system', () => {
      const worldConfig = generateWorldConfig('dnd5e', {
        name: 'Test World',
        description: 'Test Description'
      });
      
      expect(worldConfig.system).toBe('dnd5e');
      expect(worldConfig.name).toBe('Test World');
      expect(worldConfig.description).toBe('Test Description');
    });

    it('should generate world configuration for multi-system', () => {
      const worldConfig = generateWorldConfig('dnd5e', {
        name: 'Multi-System World'
      });
      
      expect(worldConfig.system).toBe('dnd5e');
      expect(worldConfig.name).toBe('Multi-System World');
    });
  });

  describe('BOOTSTRAP_SCENARIOS', () => {
    it('should define standard bootstrap scenarios', () => {
      expect(BOOTSTRAP_SCENARIOS.SINGLE_SYSTEM).toBeDefined();
      expect(BOOTSTRAP_SCENARIOS.MULTI_SYSTEM).toBeDefined();
      expect(BOOTSTRAP_SCENARIOS.DEBUG).toBeDefined();
    });

    it('should have valid scenario configurations', () => {
      // BOOTSTRAP_SCENARIOS contains scenario names, not full configs
      expect(typeof BOOTSTRAP_SCENARIOS.SINGLE_SYSTEM).toBe('string');
      expect(typeof BOOTSTRAP_SCENARIOS.MULTI_SYSTEM).toBe('string');
      expect(typeof BOOTSTRAP_SCENARIOS.DEBUG).toBe('string');
      expect(typeof BOOTSTRAP_SCENARIOS.PRODUCTION).toBe('string');
      
      // Verify scenario names are valid
      expect(BOOTSTRAP_SCENARIOS.SINGLE_SYSTEM).toBe('single-system-test');
      expect(BOOTSTRAP_SCENARIOS.MULTI_SYSTEM).toBe('multi-system-test');
      expect(BOOTSTRAP_SCENARIOS.DEBUG).toBe('debug-mode');
    });
  });
});

describe('Bootstrap Logger', () => {
  let logger;

  beforeEach(() => {
    logger = new BootstrapLogger('TestComponent');
  });

  it('should create logger with component name', () => {
    expect(logger.component).toBe('TestComponent');
    expect(logger.startTime).toBeDefined();
  });

  it('should track operation timing', () => {
    const startTime = logger.startOperation('Test Operation');
    expect(startTime).toBeDefined();
    
    logger.completeOperation('Test Operation', true, { result: 'success' });
    // Operation should be removed from stack
    expect(logger.operationStack).toHaveLength(0);
  });

  it('should generate timestamps', () => {
    const timestamp = logger.getTimestamp();
    expect(timestamp).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\|\+\d+ms\]/);
  });
});

describe('Configuration Validation', () => {
  it('should validate required configuration fields', () => {
    const validConfig = {
      systems: ['dnd5e'],
      bootstrap: {
        timeouts: { containerStart: 30000 },
        retries: { containerStart: 3 }
      }
    };
    
    // Should not throw
    expect(() => loadBootstrapConfig(validConfig)).not.toThrow();
  });

  it('should provide sensible defaults for missing configuration', () => {
    const minimalConfig = { systems: ['dnd5e'] };
    const config = loadBootstrapConfig(minimalConfig);
    
    expect(config.bootstrap.timeouts.containerStart).toBe(30000);
    expect(config.bootstrap.retries.containerStart).toBe(3);
    expect(config.puppeteer.headless).toBe(true);
  });
});
