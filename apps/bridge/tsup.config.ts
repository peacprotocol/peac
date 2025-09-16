import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/server.ts'],
  format: ['esm'],
  target: 'node20',
  dts: false,
  clean: true,
  splitting: false,
  sourcemap: true,
  external: ['@peac/core', '@peac/disc', '@peac/receipts', '@peac/pay402'],
});
