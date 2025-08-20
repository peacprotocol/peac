/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',

  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],

  // Modern ts-jest config (avoid deprecated globals['ts-jest'])
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
        diagnostics: true,
      },
    ],
  },

  // Coverage
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coveragePathIgnorePatterns: [
    '<rootDir>/src/index.ts',
    '<rootDir>/src/http/server.ts',
    '<rootDir>/src/http/routes.ts',
    '<rootDir>/src/http/wellKnown.ts',
    '<rootDir>/src/metrics/index.ts',
    '<rootDir>/src/logging/index.ts',
    '<rootDir>/src/mcp/adapter.ts',
    '<rootDir>/src/negotiation/',
    '<rootDir>/src/security/dpop/',
    '<rootDir>/src/agents/',
  ],
  coverageThreshold: {
    global: { statements: 55, branches: 50, functions: 55, lines: 55 },
    './src/http/agreements.ts': { statements: 80, branches: 75, functions: 75, lines: 80 },
    './src/payments/http.ts': { statements: 60, branches: 45, functions: 55, lines: 60 },
    './src/webhooks/verify.ts': { statements: 45, branches: 25, functions: 50, lines: 45 },
  },

  // Stability & DX
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 10000,
  detectOpenHandles: true,
  clearMocks: true,
  restoreMocks: true,
};
