module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import', 'promise'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:promise/recommended',
    'prettier',
  ],
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  parserOptions: {
    tsconfigRootDir: __dirname,
    sourceType: 'module',
    ecmaVersion: 'latest',
  },
  settings: {
    'import/resolver': {
      node: true,
      typescript: {
        project: ['./tsconfig.json', './packages/*/tsconfig.json', './apps/*/tsconfig.json']
      }
    },
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-empty': ['error', { 'allowEmptyCatch': true }],
    'promise/param-names': 'error',
    'import/no-unresolved': 'error',
    'import/extensions': ['error', 'ignorePackages', { ts:'always', tsx:'always', js:'always', mjs:'always' }],
  },
  ignorePatterns: [
    'dist/**',
    'coverage/**',
    'bench-results.json',
    'tests/golden/**',
    'tests/performance/**',
    'test/smoke/**',
    'tests/contract/**',
  ],
  overrides: [
    {
      files: ['**/*.test.js', '**/*.spec.js', 'test/**/*.js', 'tests/**/*.js'],
      rules: {
        'import/no-unresolved': 'off',
        'import/extensions': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        'no-undef': 'off',
        'no-useless-escape': 'off',
      }
    },
    {
      // Type-aware lint only where tsconfig includes them
      files: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.tsx', 'apps/*/src/**/*.ts', 'apps/*/src/**/*.tsx'],
      parserOptions: {
        project: ['./tsconfig.eslint.json']
      }
    }
  ],
};
