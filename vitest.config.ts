import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  // Exclude archive from vite transforms entirely
  resolve: {
    alias: {
      // Workspace package aliases for root-level tests
      '@peac/kernel': resolve(__dirname, 'packages/kernel/src/index.ts'),
      '@peac/schema': resolve(__dirname, 'packages/schema/src/index.ts'),
      '@peac/crypto': resolve(__dirname, 'packages/crypto/src/index.ts'),
      '@peac/protocol': resolve(__dirname, 'packages/protocol/src/index.ts'),
      '@peac/control': resolve(__dirname, 'packages/control/src/index.ts'),
    },
  },
  server: {
    fs: {
      deny: ['archive', 'ex', 'sdks'],
    },
  },
  test: {
    // Root-level exclude prevents scanning these directories at all
    root: '.',
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
      'surfaces/nextjs/**/tests/**/*.test.ts',
      // Workers have their own vitest configs with custom paths
      // Run them via pnpm --filter @peac/worker-* test
      'tests/conformance/**/*.spec.ts',
      'tests/parity/**/*.test.ts',
    ],
    // Timeout for tests
    testTimeout: 10000,
    // Fail fast on first error in CI
    bail: process.env.CI ? 1 : 0,
  },
});
