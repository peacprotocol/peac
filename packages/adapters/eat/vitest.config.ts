import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@peac/kernel',
        replacement: resolve(__dirname, '../../kernel/src/index.ts'),
      },
      {
        find: '@peac/schema',
        replacement: resolve(__dirname, '../../schema/src/index.ts'),
      },
      {
        find: '@peac/crypto',
        replacement: resolve(__dirname, '../../crypto/src/index.ts'),
      },
    ],
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
