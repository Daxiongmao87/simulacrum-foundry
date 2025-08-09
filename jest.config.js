export default {
  testEnvironment: 'jsdom',
  testMatch: ['**/scripts/test/**/*.test.js'],
  transform: {
    '^.+\.js$': 'babel-jest',
  },
  transformIgnorePatterns: [],
  collectCoverageFrom: [
    'scripts/**/*.js',
    '!scripts/test/**',
    '!scripts/fimlib/**',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/scripts/test/mocks.js']
};