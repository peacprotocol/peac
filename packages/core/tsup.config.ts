import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false, // Use tsc for declarations
  sourcemap: true,
  clean: true,
  splitting: false,
  target: 'node20',
  platform: 'node',
  external: Object.keys(require('./package.json').dependencies || {}),
});
