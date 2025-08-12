/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],

  // Coverage
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  coveragePathIgnorePatterns: [
    '<rootDir>/src/index.ts',
    '<rootDir>/src/http/server.ts',
    '<rootDir>/src/http/routes.ts',
    '<rootDir>/src/http/wellKnown.ts',
    '<rootDir>/src/metrics/index.ts',
    '<rootDir>/src/logging/index.ts',
    '<rootDir>/src/mcp/adapter.ts'
  ],
  // (Optional) If you later want to gate coverage, uncomment and tune:
  // coverageThreshold: {
  //   global: { statements: 60, branches: 55, functions: 60, lines: 60 },
  // },

  // Stability & DX
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 10000,
  detectOpenHandles: true,
  clearMocks: true,
  restoreMocks: true,

  // ts-jest tuning for perf & TS 5.x
  globals: {
    'ts-jest': {
      isolatedModules: true,
      diagnostics: true,
    },
  },
};
