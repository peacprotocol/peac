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
      'reference/**',
      'packages/sdk-js/src/**/*.test.js',
      'packages/sdk-js/tests/**',
      'packages/sdk-js/archived/**',
      'reference/**',
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

  // --- @peac/pref and @peac/mappings-content-signals: forbid network imports ---
  // Content-signal parser packages take pre-fetched bytes only.
  // Tests are exempt. @peac/pref robots.ts keeps a deprecated throwing fetchRobots
  // stub; nothing else may import network primitives here.
  {
    files: [
      'packages/aipref/src/**/*.ts',
      'packages/mappings/content-signals/src/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'node-fetch', message: 'Network I/O forbidden in content-signal parser packages. Pass pre-fetched bytes to the parser.' },
            { name: 'got', message: 'Network I/O forbidden in content-signal parser packages.' },
            { name: 'axios', message: 'Network I/O forbidden in content-signal parser packages.' },
            { name: 'undici', message: 'Network I/O forbidden in content-signal parser packages.' },
            { name: 'node:http', message: 'Network I/O forbidden in content-signal parser packages.' },
            { name: 'node:https', message: 'Network I/O forbidden in content-signal parser packages.' },
            { name: 'node:net', message: 'Network I/O forbidden in content-signal parser packages.' },
            { name: 'http', message: 'Network I/O forbidden in content-signal parser packages.' },
            { name: 'https', message: 'Network I/O forbidden in content-signal parser packages.' },
            { name: 'net', message: 'Network I/O forbidden in content-signal parser packages.' },
          ],
          patterns: [
            { group: ['node:http', 'node:https', 'node:net'], message: 'Network I/O forbidden in content-signal parser packages.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'Network I/O forbidden in content-signal parser packages. Callers pass pre-fetched bytes; parsers operate on bytes only.',
        },
      ],
    },
  },

  // --- @peac/mcp-server: forbid console.log (stdout is reserved for JSON-RPC) ---
  // Use process.stderr.write() for diagnostics, never console.log/warn/error.
  {
    files: ['packages/mcp-server/src/**/*.ts'],
    rules: {
      'no-console': 'error',
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
