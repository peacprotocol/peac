import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  // Exclude archive from vite transforms entirely
  resolve: {
    alias: [
      // Subpath exports must come before main package alias (more specific first)
      {
        find: '@peac/capture-core/testkit',
        replacement: resolve(__dirname, 'packages/capture/core/src/testkit.ts'),
      },
      // Workspace package aliases for root-level tests
      { find: '@peac/kernel', replacement: resolve(__dirname, 'packages/kernel/src/index.ts') },
      { find: '@peac/schema', replacement: resolve(__dirname, 'packages/schema/src/index.ts') },
      { find: '@peac/crypto', replacement: resolve(__dirname, 'packages/crypto/src/index.ts') },
      { find: '@peac/protocol', replacement: resolve(__dirname, 'packages/protocol/src/index.ts') },
      { find: '@peac/control', replacement: resolve(__dirname, 'packages/control/src/index.ts') },
      {
        find: '@peac/capture-core',
        replacement: resolve(__dirname, 'packages/capture/core/src/index.ts'),
      },
    ],
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
      // QUARANTINE: surfaces/nextjs/middleware/tests/parity.test.ts
      //
      // Failing tests:
      //   - "should return correct status for verification failure"
      //   - "should match Cloudflare Worker error codes"
      //
      // Reason: Module resolution fails for @peac/contracts imports. The test
      // imports from '../../../_shared/contracts/index.js' which requires
      // @peac/contracts to be built and properly linked in the workspace.
      // Error: Cannot find module '../../../_shared/contracts/index.js'
      //
      // Exit condition: Fix @peac/contracts workspace linking OR refactor the
      // test to use direct imports. Verify with:
      //   pnpm --filter @peac/middleware-nextjs test
      //
      // Tracking: Create issue when ready to fix, update reference here.
      'surfaces/nextjs/**/parity.test.ts',
    ],
    // Only include packages that are actively maintained
    include: [
      'packages/*/tests/**/*.test.ts',
      'packages/*/*/tests/**/*.test.ts',
      'packages/*/__tests__/**/*.test.ts',
      'packages/*/src/__tests__/**/*.test.ts',
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
    // Don't fail when no tests found (some packages use wildcard filters)
    passWithNoTests: true,
  },
});
