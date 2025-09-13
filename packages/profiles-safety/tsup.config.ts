import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: false, // Disable for now due to workspace dependencies
  clean: true,
  splitting: false,
  sourcemap: false,
  minify: false,
});
