import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/node.ts'],
  format: ['esm'],
  target: 'node20',
  dts: false,
  clean: true,
  splitting: false,
  sourcemap: true,
  external: ['@peac/crypto', '@peac/schema'],
});
