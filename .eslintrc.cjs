module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import', 'promise'],
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
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
      typescript: {
        project: ['./tsconfig.json', './packages/*/tsconfig.json']
      }
    },
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-empty': ['error', { 'allowEmptyCatch': true }],
    'promise/param-names': 'error',
    'import/no-unresolved': 'error',
    'import/extensions': ['error', 'ignorePackages', { ts:'never', tsx:'never', js:'always', mjs:'always' }],
  },
  ignorePatterns: ['dist/**', 'coverage/**', 'bench-results.json', 'tests/golden/**'],
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      parserOptions: {
        project: ['./tsconfig.json', './packages/*/tsconfig.json']
      }
    }
  ],
};
