import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    // Suppress expected PEAC_DEPRECATED_* warnings so CI output stays
    // readable. The deprecation contract is covered by a dedicated
    // assertion test in facade.test.ts.
    setupFiles: ['./__tests__/vitest.setup.ts'],
  },
});
