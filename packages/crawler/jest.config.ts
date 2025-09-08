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
  // Baseline coverage thresholds set to current levels for v0.9.12.2
  coverageThreshold: {
    global: { statements: 45, branches: 29, functions: 42, lines: 45 },
  },
};

export default config;
