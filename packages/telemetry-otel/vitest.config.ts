import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Resolve workspace packages to TypeScript source for proper transforms
      '@peac/telemetry': resolve(__dirname, '../telemetry/src/index.ts'),
      '@peac/privacy': resolve(__dirname, '../privacy/src/index.ts'),
      '@peac/kernel': resolve(__dirname, '../kernel/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
