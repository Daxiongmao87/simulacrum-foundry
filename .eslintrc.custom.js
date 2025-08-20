/**
 * Custom ESLint rules for Simulacrum project
 * 
 * This file defines project-specific linting rules including:
 * - Console log prefix requirements
 * - Module-specific patterns
 */

export const simulacrumRules = {
  /**
   * Enforce that console.log statements must have specific prefixes
   * Allowed prefixes: "Simulacrum |", "Foundry VTT |"
   */
  'require-console-prefix': {
    create(context) {
      return {
        CallExpression(node) {
          if (
            node.callee.type === 'MemberExpression' &&
            node.callee.object.name === 'console' &&
            node.callee.property.name === 'log' &&
            node.arguments.length > 0 &&
            node.arguments[0].type === 'Literal'
          ) {
            const message = node.arguments[0].value;
            if (typeof message === 'string') {
              const validPrefixes = ['Simulacrum |', 'Foundry VTT |'];
              const hasValidPrefix = validPrefixes.some(prefix => 
                message.startsWith(prefix)
              );
              
              if (!hasValidPrefix) {
                context.report({
                  node,
                  message: 'console.log must start with "Simulacrum |" or "Foundry VTT |" prefix',
                  fix(fixer) {
                    const newMessage = `'Simulacrum | ${message.slice(1, -1)}'`;
                    return fixer.replaceText(node.arguments[0], newMessage);
                  }
                });
              }
            }
          }
        }
      };
    }
  }
};

/**
 * Recommended ESLint configuration additions for code quality
 */
export const recommendedConfig = {
  rules: {
    // Console management
    'no-console': ['error', { 
      allow: ['warn', 'error'] 
    }],
    
    // Code complexity
    'complexity': ['error', 15],
    'max-depth': ['error', 4],
    'max-nested-callbacks': ['error', 3],
    'max-params': ['warn', 5],
    'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
    'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
    
    // Best practices
    'no-var': 'error',
    'prefer-const': 'error',
    'no-unused-expressions': 'error',
    'no-return-await': 'error',
    'require-await': 'error',
    'no-async-promise-executor': 'error',
    
    // Code formatting (handled by Prettier but good to enforce)
    'no-multiple-empty-lines': ['error', { max: 2 }],
    'no-trailing-spaces': 'error',
    'eol-last': 'error',
    'curly': ['error', 'all'],
    'brace-style': ['error', '1tbs'],
    
    // Documentation
    'require-jsdoc': ['warn', {
      require: {
        FunctionDeclaration: true,
        MethodDefinition: true,
        ClassDeclaration: true,
        ArrowFunctionExpression: false,
        FunctionExpression: false
      }
    }],
    'valid-jsdoc': ['warn', {
      requireReturn: false,
      requireReturnType: true,
      requireParamDescription: true,
      requireReturnDescription: true
    }]
  }
};