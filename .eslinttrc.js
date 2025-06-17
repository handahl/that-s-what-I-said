/**
 * ESLint configuration for That's What I Said
 * Enforces security-first coding standards and CoDA compliance
 */

module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'plugin:svelte/recommended',
    'prettier'
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2020,
    extraFileExtensions: ['.svelte']
  },
  env: {
    browser: true,
    es2017: true,
    node: true
  },
  overrides: [
    {
      files: ['*.svelte'],
      parser: 'svelte-eslint-parser',
      parserOptions: {
        parser: '@typescript-eslint/parser'
      }
    },
    {
      files: ['*.test.ts', '*.spec.ts'],
      env: {
        vitest: true
      }
    }
  ],
  rules: {
    // Security-first rules (CoDA compliance)
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    'no-unsafe-innerHTML': 'error',
    
    // Crypto and sensitive data handling
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    'no-alert': 'error',
    
    // Type safety
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    
    // Code quality
    'prefer-const': 'error',
    'no-var': 'error',
    'no-duplicate-imports': 'error',
    'no-unused-expressions': 'error',
    
    // Async/Promise handling
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    
    // Svelte-specific
    'svelte/no-dom-manipulating': 'error',
    'svelte/no-inline-styles': 'warn',
    'svelte/prefer-class-directive': 'warn',
    'svelte/prefer-style-directive': 'warn',
    
    // Documentation requirements
    'valid-jsdoc': ['warn', {
      requireReturn: false,
      requireParamDescription: false,
      requireReturnDescription: false
    }]
  },
  
  // Custom rules for constraint compliance
  settings: {
    'import/resolver': {
      typescript: {}
    }
  },
  
  // Files to ignore are in .eslintignore
  ignorePatterns: [
    'dist/',
    'build/',
    'node_modules/',
    '*.config.js',
    '*.config.ts'
  ]
};