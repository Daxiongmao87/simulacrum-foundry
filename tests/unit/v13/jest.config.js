export default {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 10000,
  verbose: true,
  collectCoverage: true,
  collectCoverageFrom: [
    '<rootDir>/../../../scripts/**/*.js',
    '!<rootDir>/../../../scripts/main.js', // Exclude bootstrapping
    '!<rootDir>/../../../scripts/fimlib/**' // Exclude submodules
  ],
  coverageThreshold: {
    global: {
      lines: 45, // Current coverage level - prevent regressions
      functions: 45,
      branches: 35,
      statements: 45
    }
  },
  // v13 specific configuration
  displayName: 'v13'
};