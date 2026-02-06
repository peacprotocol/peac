import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  resolve: {
    alias: {
      // Direct path to avoid barrel re-exporting Node.js-only modules
      '@peac/protocol/verify-local': resolve(
        __dirname,
        '../../packages/protocol/src/verify-local.ts'
      ),
      '@peac/crypto': resolve(__dirname, '../../packages/crypto/src/index.ts'),
      '@peac/schema': resolve(__dirname, '../../packages/schema/src/index.ts'),
      '@peac/kernel': resolve(__dirname, '../../packages/kernel/src/index.ts'),
    },
  },
});
