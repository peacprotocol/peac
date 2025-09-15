import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: false, // Disabled due to workspace dependency issues
  clean: true,
  sourcemap: true,
  target: 'node18',
  external: ['@peac/core', '@peac/disc'],
});
