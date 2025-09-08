import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['integration.ts'],
  format: ['esm'],
  dts: false, // Temporarily disabled due to workspace resolution
  clean: true,
  target: 'esnext',
  external: ['@peac/core'],
});
