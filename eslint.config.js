import { simulacrumRules, recommendedConfig } from './.eslintrc.custom.js';

// TEMPORARY: Set to true to turn all errors into warnings for development
const WARNING_ONLY_MODE = true;

export default [
  {
    files: ['scripts/**/*.js', 'tests/**/*.js', 'tools/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // Console management
      'no-console': [WARNING_ONLY_MODE ? 'warn' : 'error', { 
        allow: ['warn', 'error'] 
      }],
      
      // Code complexity
      'complexity': [WARNING_ONLY_MODE ? 'warn' : 'error', 15],
      'max-depth': [WARNING_ONLY_MODE ? 'warn' : 'error', 4],
      'max-nested-callbacks': [WARNING_ONLY_MODE ? 'warn' : 'error', 3],
      'max-params': [WARNING_ONLY_MODE ? 'warn' : 'error', 5],
      'max-lines': [WARNING_ONLY_MODE ? 'warn' : 'error', { max: 200, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [WARNING_ONLY_MODE ? 'warn' : 'error', { max: 100, skipBlankLines: true, skipComments: true }],
      
      // Best practices
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-expressions': 'error',
      'no-return-await': 'error',
      'require-await': [WARNING_ONLY_MODE ? 'warn' : 'error'],
      'no-async-promise-executor': 'error',
      
      // Code formatting (handled by Prettier but good to enforce)
      'no-multiple-empty-lines': ['error', { max: 2 }],
      'no-trailing-spaces': [WARNING_ONLY_MODE ? 'warn' : 'error'],
      'eol-last': [WARNING_ONLY_MODE ? 'warn' : 'error'],
      'curly': [WARNING_ONLY_MODE ? 'warn' : 'error', 'all'],
      'brace-style': [WARNING_ONLY_MODE ? 'warn' : 'error', '1tbs'],
    },
    plugins: {
      simulacrum: {
        rules: simulacrumRules,
      },
    },
  },
];
