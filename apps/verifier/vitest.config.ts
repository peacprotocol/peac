import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@peac/protocol/verify-local': resolve(
        __dirname,
        '../../packages/protocol/src/verify-local.ts'
      ),
      '@peac/crypto': resolve(__dirname, '../../packages/crypto/src/index.ts'),
      '@peac/schema': resolve(__dirname, '../../packages/schema/src/index.ts'),
      '@peac/kernel': resolve(__dirname, '../../packages/kernel/src/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
