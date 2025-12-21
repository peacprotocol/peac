import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Exclude archive and legacy code from tests
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'archive/**',
      'ex/**',
      'sdks/**',
      'apps/api/**',
      'packages/core/src/**/*.test.js',
      'packages/sdk-js/tests/**',
      'tests/smoke/**',
    ],
    // Only include packages that are actively maintained
    include: [
      'packages/*/tests/**/*.test.ts',
      'packages/*/*/tests/**/*.test.ts',
      'packages/*/__tests__/**/*.test.ts',
      'surfaces/**/tests/**/*.test.ts',
      'tests/conformance/**/*.spec.ts',
      'tests/parity/**/*.test.ts',
    ],
    // Timeout for tests
    testTimeout: 10000,
    // Fail fast on first error in CI
    bail: process.env.CI ? 1 : 0,
  },
});
