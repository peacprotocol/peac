import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['integration.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'esnext',
  external: ['@peac/core']
});