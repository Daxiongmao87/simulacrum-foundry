/**
 * Consolidated Jest configuration for unit tests
 * Supports version-specific configurations for FoundryVTT v12 and v13
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Get project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../');

const baseConfig = {
  testEnvironment: 'node',
  // ES modules configuration
  transform: {},
  // Set root directory to project root
  rootDir: PROJECT_ROOT,
  // Use testTimeout inside setupFilesAfterEnv or individual tests instead of global config
  // verbose is deprecated in multi-project configs
};

// Version-specific configurations
const versionConfigs = {
  v12: {
    ...baseConfig,
    displayName: 'v12 Unit Tests',
    testMatch: ['<rootDir>/tests/unit/v12/**/*.test.js'],
    setupFilesAfterEnv: [join(PROJECT_ROOT, 'tests/unit/v12/jest.setup.js')]
  },
  
  v13: {
    ...baseConfig,
    displayName: 'v13 Unit Tests', 
    testMatch: ['<rootDir>/tests/unit/v13/**/*.test.js'],
    setupFilesAfterEnv: [join(PROJECT_ROOT, 'tests/unit/v13/jest.setup.js')]
  }
};

// Multi-project configuration for running all versions
const multiProjectConfig = {
  projects: [
    versionConfigs.v12,
    versionConfigs.v13
  ]
};

// Export specific configuration based on environment variable or default to multi-project
const version = process.env.FOUNDRY_VERSION;
let config;

if (version && versionConfigs[version]) {
  config = versionConfigs[version];
} else {
  config = multiProjectConfig;
}

export default config;