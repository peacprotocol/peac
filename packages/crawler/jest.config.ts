import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['src/**/*.ts'],
  // Nightly controls coverage thresholds; CI-lite keeps them permissive
  coverageThreshold: {
    global: { statements: 0, branches: 0, functions: 0, lines: 0 },
  },
};

export default config;
