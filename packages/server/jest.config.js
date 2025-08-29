/** @type {import('jest').Config} */
module.exports = {
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
    '<rootDir>/src/http/payment.ts',
    '<rootDir>/src/http/gdpr-export.ts',
    '<rootDir>/src/health/endpoints.ts',
    '<rootDir>/src/events/contracts/emitter.ts',
  ],
  coverageThreshold: {
    global: { statements: 50, branches: 42, functions: 52, lines: 51 },
    './src/http/agreements.ts': { statements: 20, branches: 0, functions: 0, lines: 20 },
    './src/payments/http.ts': { statements: 67, branches: 45, functions: 55, lines: 67 },
    './src/webhooks/verify.ts': { statements: 13, branches: 6, functions: 17, lines: 13 },
  },

  // Stability & DX
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 10000,
  detectOpenHandles: true,
  clearMocks: true,
  restoreMocks: true,
};
