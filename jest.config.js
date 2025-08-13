/**
 * Main Jest Configuration
 * 
 * Base configuration for all Jest tests with ES module support.
 */

export default {
  // ES Modules support
  preset: undefined,
  transform: {},
  
  // Node.js test environment  
  testEnvironment: 'node',
  
  // Module resolution
  moduleFileExtensions: ['js', 'json'],
  
  // Test patterns (all tests by default)
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/scripts/fimlib/' // Ignore submodule
  ],
  
  // Coverage
  collectCoverage: false,
  coverageDirectory: 'coverage',
  
  // Timeouts
  testTimeout: 30000,
  
  // Verbose output
  verbose: true,
  
  // Error handling
  errorOnDeprecated: false
};