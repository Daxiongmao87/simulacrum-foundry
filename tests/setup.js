/**
 * @file tests/setup.js
 * @description Test setup and configuration
 */

// Set test environment variables
process.env.NODE_ENV = 'test';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: global.jest ? global.jest.fn() : () => {},
  debug: global.jest ? global.jest.fn() : () => {},
  info: global.jest ? global.jest.fn() : () => {},
  warn: global.jest ? global.jest.fn() : () => {},
  error: global.jest ? global.jest.fn() : () => {},
};

// Global test utilities
global.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Mock file system operations for tests
if (global.jest) {
  global.jest.mock('fs', () => ({
    readFileSync: global.jest.fn((path) => {
      if (path.includes('test.config.json')) {
        return JSON.stringify({
          foundryLicenseKey: 'TEST-KEY-123',
          systems: ['dnd5e', 'pf2e'],
          bootstrap: {
            timeouts: {
              containerStart: 30000,
              foundryReady: 60000
            },
            retries: {
              containerStart: 3
            }
          }
        });
      }
      throw new Error(`File not found: ${path}`);
    }),
    existsSync: global.jest.fn(() => true),
    writeFileSync: global.jest.fn(),
  }));

  // Mock child_process for testing
  global.jest.mock('child_process', () => ({
    spawn: global.jest.fn(),
    execSync: global.jest.fn(() => 'test-output'),
  }));
}

// Set longer timeout for integration tests
if (global.jest) {
  global.jest.setTimeout(30000);
}
