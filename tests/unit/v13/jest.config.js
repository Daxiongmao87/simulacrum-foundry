export default {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 10000,
  verbose: true,
  collectCoverage: true,
  collectCoverageFrom: [
    '<rootDir>/../../../scripts/core/logger.js'
  ],
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80
    }
  },
  // v13 specific configuration
  displayName: 'v13'
};