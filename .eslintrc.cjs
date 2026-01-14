module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
    jest: true
  },
  extends: [
    'eslint:recommended',
    'plugin:jest/recommended',
    'prettier'
  ],
  plugins: [
    'jest'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  overrides: [
    {
      files: ['**/*.json'],
      excludedFiles: ['node_modules/**', 'vendor/**', 'dist/**', 'coverage/**', '.foundry-cache/**', '.foundry-data/**'],
      parser: 'jsonc-eslint-parser',
      extends: ['plugin:jsonc/recommended-with-json'],
      rules: {
        'jsonc/no-comments': 'error'
      }
    }
  ],
  globals: {
    // FoundryVTT globals
    game: 'readonly',
    CONFIG: 'readonly',
    Hooks: 'readonly',
    foundry: 'readonly',
    CONST: 'readonly',
    Application: 'readonly',
    FormApplication: 'readonly',
    Dialog: 'readonly',
    ChatMessage: 'readonly',
    mergeObject: 'readonly',
    duplicate: 'readonly',
    setProperty: 'readonly',
    getProperty: 'readonly',
    hasProperty: 'readonly',
    expandObject: 'readonly',
    flattenObject: 'readonly',
    isObjectEmpty: 'readonly',
    // FoundryVTT v13 Application System
    ApplicationV2: 'readonly',
    HandlebarsApplicationMixin: 'readonly',
    // FoundryVTT UI globals
    ui: 'readonly',
    TextEditor: 'readonly',
    jQuery: 'readonly',
    $: 'readonly',
    // Module globals
    SimulacrumCore: 'readonly',
    // Additional FoundryVTT globals
    loadTemplates: 'readonly',
    renderTemplate: 'readonly',
    Folder: 'readonly',
    Macro: 'readonly',
    fromUuid: 'readonly'
  },
  rules: {
    // Line length limit
    'max-len': ['error', {
      code: 100,
      ignoreUrls: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
      ignoreComments: true
    }],
    // Function length limit
    'max-lines-per-function': ['error', {
      max: 50,
      skipBlankLines: true,
      skipComments: true
    }],
    // File length limit
    'max-lines': ['error', {
      max: 500,
      skipBlankLines: true,
      skipComments: true
    }],
    // Class length (approximated by max statements)
    'max-statements': ['error', 75], // ~300 lines / 4 lines per statement
    // Code quality rules
    'no-unused-vars': ['error', { 'argsIgnorePattern': '^_|^unused' }],
    'no-console': 'warn',
    'no-debugger': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    // Consistent naming
    'camelcase': ['error', { properties: 'never' }],
    // Complexity limits
    'complexity': ['error', 10],
    'max-depth': ['error', 4],
    'max-params': ['error', 4]
  }
};
