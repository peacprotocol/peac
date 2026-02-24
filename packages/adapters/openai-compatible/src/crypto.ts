/**
 * WebCrypto utility for SHA-256 hashing (DD-138).
 *
 * Portable: uses globalThis.crypto.subtle (Node 19+, browsers, Deno, Bun)
 * with fallback to node:crypto webcrypto for Node >=16.
 *
 * Minimum supported runtime: Node.js 16+ (with webcrypto).
 * Recommended: Node.js 22+ (globalThis.crypto.subtle is always available).
 */

// Use typeof to avoid DOM lib dependency for the SubtleCrypto type
type Subtle = typeof globalThis.crypto.subtle;

// ---------------------------------------------------------------------------
// WebCrypto resolution
// ---------------------------------------------------------------------------

/**
 * Get the SubtleCrypto implementation for the current runtime.
 *
 * Tries globalThis.crypto.subtle first (available in Node 19+, all modern
 * browsers, Deno, Bun, Cloudflare Workers). Falls back to node:crypto
 * webcrypto for Node >=16.
 *
 * @throws {Error} if no WebCrypto implementation is available
 */
export function getSubtle(): Subtle {
  // Prefer globalThis.crypto.subtle (Node 19+, all modern browsers)
  const subtle = globalThis?.crypto?.subtle;
  if (subtle) return subtle;

  // Node.js fallback for older versions (>=16)
  try {
    const nodeCrypto = require('node:crypto') as {
      webcrypto: { subtle: Subtle };
    };
    return nodeCrypto.webcrypto.subtle;
  } catch {
    throw new Error(
      'No WebCrypto implementation available. ' +
        'Requires Node.js >=16, or a runtime with globalThis.crypto.subtle.'
    );
  }
}
