import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  // --- Global ignores ---
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'apps/api/src/**/*.test.js',
      'archive/**',
      'paper/**',
      'packages/sdk-js/src/**/*.test.js',
      'packages/sdk-js/tests/**',
      'packages/sdk-js/archived/**',
    ],
  },

  // --- Base: eslint:recommended + globals ---
  {
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.es2021,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },

  // --- TypeScript files: parser + disable rules handled by tsc ---
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      // These are handled by TypeScript compiler (tsc --noEmit)
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-redeclare': 'off',
    },
  },

  // --- @peac/crypto: restrict direct @noble/ed25519 imports ---
  // All noble usage must go through the async-only wrapper (src/ed25519.ts).
  // The wrapper itself and test files are exempt.
  {
    files: ['packages/crypto/src/**/*.ts'],
    ignores: ['packages/crypto/src/ed25519.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@noble/ed25519',
              message:
                'Import from ./ed25519.js instead. Direct @noble/ed25519 imports bypass the async-only wrapper.',
            },
          ],
        },
      ],
    },
  },

  // --- Test files: add test globals ---
  {
    files: [
      '**/*.test.ts',
      '**/*.test.js',
      '**/*.spec.ts',
      '**/*.spec.js',
      '**/tests/**',
      '**/__tests__/**',
    ],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },

  // --- Verifier app: browser globals ---
  {
    files: ['apps/verifier/src/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },

  // --- Service worker: add SW globals ---
  {
    files: ['apps/verifier/public/sw.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
  },
];
