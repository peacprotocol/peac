import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@peac/contracts': resolve(__dirname, '../../../packages/contracts/src/index.ts'),
      '@peac/mappings-tap': resolve(__dirname, '../../../packages/mappings/tap/src/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
});
