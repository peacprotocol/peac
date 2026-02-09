import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'], // Use single entry point for proper TypeScript project references
  format: ['cjs', 'esm'],
  dts: false,
  outDir: 'dist', // Align with tsconfig.json outDir
  sourcemap: true,
  clean: false,
  splitting: false,
  treeshake: true,
  minify: false,
  target: 'esnext',
  platform: 'neutral',
  external: ['node:crypto', 'jose'],
  esbuildOptions(options) {
    options.conditions = ['node'];
  },
});
