/**
 * Consolidated Jest configuration for unit tests
 * Supports FoundryVTT v13 unit tests
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

// v13 configuration  
const v13Config = {
  ...baseConfig,
  displayName: 'v13 Unit Tests', 
  testMatch: ['<rootDir>/tests/unit/v13/**/*.test.js'],
  setupFilesAfterEnv: [join(PROJECT_ROOT, 'tests/unit/v13/jest.setup.js')]
};

// Use v13 configuration
const config = v13Config;

export default config;