import { defineConfig } from 'vite';
import { resolveVerifierBuild } from '../../scripts/verifier-build-id.mjs';
import { resolve } from 'path';

/**
 * The build identifier is resolved by scripts/verifier-build-id.mjs, which refuses to label a dirty
 * tree with a clean commit sha. See that file for the resolution order and the digest definition.
 */
export default defineConfig(({ mode }) => ({
  root: '.',
  build: {
    outDir: 'dist',
    target: 'es2022',
    // Vite's modulepreload polyfill injects a `fetch()` to warm `<link rel=modulepreload>` hrefs.
    // It is same-origin and harmless, but (a) the production CSP sets `connect-src 'none'`, so the
    // request would be blocked anyway, and (b) a verification bundle should contain no network call
    // at all, which the build gates assert mechanically. Every browser that provides
    // WebCrypto Ed25519 (which this app requires) supports modulepreload natively.
    modulePreload: { polyfill: false },
  },
  define: { __PEAC_VERIFIER_BUILD__: JSON.stringify(resolveVerifierBuild({ mode })) },
  resolve: {
    alias: {
      // `crypto` (the Node builtin) is only referenced by @peac/crypto's unreachable Node SHA-256
      // fallback. Without this alias the bundler emits an empty __vite-browser-external stub.
      // See src/lib/no-node-crypto.ts for the full reasoning.
      crypto: resolve(__dirname, 'src/lib/no-node-crypto.ts'),
      // Direct path to avoid the barrel re-exporting Node-only modules.
      '@peac/protocol/verify-local': resolve(
        __dirname,
        '../../packages/protocol/src/verify-local.ts'
      ),
      '@peac/crypto': resolve(__dirname, '../../packages/crypto/src/index.ts'),
      '@peac/schema': resolve(__dirname, '../../packages/schema/src/index.ts'),
      '@peac/kernel': resolve(__dirname, '../../packages/kernel/src/index.ts'),
    },
  },
}));
