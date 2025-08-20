export default [
  // Specific overrides for dev tools
  {
    files: ['scripts/dev/**/*.js'],
    rules: {
      'no-console': 'off'  // Dev tools can use console freely
    }
  },
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        game: 'readonly',
        ui: 'readonly',
        canvas: 'readonly',
        CONFIG: 'readonly',
        CONST: 'readonly',
        foundry: 'readonly',
        Hooks: 'readonly',
        loadTemplates: 'readonly',
        renderTemplate: 'readonly',
        mergeObject: 'readonly',
        duplicate: 'readonly',
        expandObject: 'readonly',
        flattenObject: 'readonly',
        getProperty: 'readonly',
        setProperty: 'readonly',
        hasProperty: 'readonly',
        deleteProperty: 'readonly',
        isObjectEmpty: 'readonly',
        diffObject: 'readonly',
        filterObject: 'readonly',
        invertObject: 'readonly',
        window: 'readonly',
        document: 'readonly',
        console: 'readonly'
      }
    },
    files: ['scripts/**/*.js'],
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { 
        allow: ['warn', 'error'] 
      }],
      // Complexity rules
      'complexity': ['warn', 15],
      'max-depth': ['warn', 4],
      'max-nested-callbacks': ['warn', 3],
      'max-params': ['warn', 5],
      // Code quality
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-multiple-empty-lines': ['error', { max: 2 }],
      'no-trailing-spaces': 'error',
      'eol-last': 'error',
      'curly': ['error', 'all'],
      'brace-style': ['error', '1tbs'],
      // Async/Promise best practices
      'no-async-promise-executor': 'error',
      'no-await-in-loop': 'warn',
      'require-await': 'warn'
    }
  }
];