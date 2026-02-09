import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/testkit.ts'],
  format: ['cjs', 'esm'],
  dts: false,
  outDir: 'dist',
  sourcemap: true,
  clean: false,
  splitting: false,
  treeshake: true,
  minify: false,
  target: 'es2022',
  platform: 'neutral',
  external: [/^[^./]/],
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.mjs' };
  },
});
