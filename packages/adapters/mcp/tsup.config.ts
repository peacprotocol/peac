import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['server.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node18',
  banner: {
    js: '#!/usr/bin/env node'
  },
  external: ['@peac/core']
});