import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: false, // Temporarily disable declaration generation
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  minify: false,
  target: 'es2022',
  external: ['node:*', '@peac/core'],
  esbuildOptions(options) {
    options.tsconfig = './tsconfig.json';
  },
});
