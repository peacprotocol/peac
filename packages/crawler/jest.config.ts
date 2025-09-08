import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  moduleNameMapper: { '^(.+?)\\.js$': '$1' }, // map .js imports to TS sources
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageThreshold: { 
    global: { 
      statements: 80, 
      branches: 75, 
      functions: 80, 
      lines: 80 
    } 
  },
};

export default config;