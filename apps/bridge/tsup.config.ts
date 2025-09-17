import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node18',
  dts: false,
  clean: true,
  splitting: false,
  sourcemap: true,
  external: ['@peac/core', '@peac/disc', '@peac/receipts', '@peac/pay402'],
});
