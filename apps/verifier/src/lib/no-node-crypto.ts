/**
 * Browser-safe stand-in for the bare `crypto` (Node builtin) specifier.
 *
 * WHY THIS EXISTS
 *
 * `@peac/crypto`'s `sha256Hex` / `sha256Bytes` fall back to `await import('crypto')` when
 * `globalThis.crypto.subtle.digest` is unavailable (packages/crypto/src/hash.ts:32,61). That
 * fallback is correct for Node, but in a browser build the bundler resolves it to an empty
 * `__vite-browser-external` stub whose `createHash` is `undefined`.
 *
 * The branch is unreachable in this application: initialization already fails closed unless
 * `crypto.subtle.verify` works, and any runtime providing `subtle.verify` also provides
 * `subtle.digest`. But shipping an empty Node stub in a verification bundle is not something a
 * consumer should have to reason about, and a stub failure would surface as a confusing
 * "undefined is not a function".
 *
 * Aliasing the specifier here removes the stub asset from the bundle and turns the impossible
 * branch into an explicit, loud failure. It changes no shared package.
 */
const MESSAGE =
  'The Node crypto fallback is not available in the browser verifier. This path is unreachable: ' +
  'the verifier requires WebCrypto Ed25519 and fails closed without it. Reaching here means the ' +
  'runtime lost crypto.subtle mid-session.';

export function createHash(): never {
  throw new Error(MESSAGE);
}

export default { createHash };
