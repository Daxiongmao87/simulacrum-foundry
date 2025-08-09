export default [
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
      'no-console': 'off'
    }
  }
];