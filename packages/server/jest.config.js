/** @type {import('jest').Config} */
export default {
  preset: "ts-jest",
  testEnvironment: "node",

  roots: ["<rootDir>/src", "<rootDir>/tests"],
  testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],

  // Modern ts-jest config (avoid deprecated globals['ts-jest'])
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.json",
        diagnostics: true,
      },
    ],
  },

  // Coverage
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
  coveragePathIgnorePatterns: [
    "<rootDir>/src/index.ts",
    "<rootDir>/src/http/server.ts",
    "<rootDir>/src/http/routes.ts",
    "<rootDir>/src/http/wellKnown.ts",
    "<rootDir>/src/metrics/index.ts",
    "<rootDir>/src/logging/index.ts",
    "<rootDir>/src/mcp/adapter.ts",
  ],

  // Stability & DX
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  testTimeout: 10000,
  detectOpenHandles: true,
  clearMocks: true,
  restoreMocks: true,
};
