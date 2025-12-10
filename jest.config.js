export default {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: [
    '<rootDir>/tests/**/*.test.js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/reference/'
  ],
  collectCoverageFrom: [
    'scripts/**/*.js',
    '!scripts/**/*.test.js',
    '!**/node_modules/**',
    '!**/reference/**',
    '!scripts/ui/**'
  ],
  coverageThreshold: {
    global: {
      branches: 69,
      functions: 69,
      lines: 69,
      statements: 69
    }
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/scripts/$1',

  }
};
