/**
 * WASM Module Loader for PEAC Core
 *
 * Provides TypeScript bindings to Rust WASM implementations of:
 * - JSON canonicalization (RFC 8785 JCS)
 * - URL normalization
 * - Selector normalization
 * - JCS SHA-256 hashing
 * - Ed25519 JWS verification
 *
 * These implementations are deterministic across all runtimes
 * (Node.js, Bun, Deno, Cloudflare Workers, Vercel Edge)
 */

import type * as WasmTypes from '../wasm/pkg/peac_wasm';

let wasm: typeof WasmTypes | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Initialize the WASM module
 * Safe to call multiple times - subsequent calls return the same promise
 */
export async function initWasm(): Promise<void> {
  if (wasm) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Try dynamic import (works in Node, Bun, Deno, Edge)
      const wasmModule = await import('../wasm/pkg/peac_wasm.js');
      wasm = wasmModule;
    } catch (err) {
      throw new Error(
        `Failed to load WASM module: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  })();

  return initPromise;
}

/**
 * Canonicalize JSON according to RFC 8785 (JCS)
 *
 * Ensures deterministic JSON serialization:
 * - Keys sorted lexicographically
 * - No whitespace
 * - Consistent across all runtimes
 *
 * @param input - JSON string or object
 * @returns Canonicalized JSON string
 */
export async function canonicalizeJson(input: string | Record<string, unknown>): Promise<string> {
  await initWasm();
  if (!wasm) throw new Error('WASM not initialized');

  const jsonStr = typeof input === 'string' ? input : JSON.stringify(input);
  return wasm.canonicalize_json(jsonStr);
}

/**
 * Normalize URL according to WHATWG + PEAC rules
 *
 * Steps:
 * - Parse URL
 * - Lowercase scheme and host
 * - Remove default ports (80, 443)
 * - Normalize path
 * - Remove fragment
 *
 * @param input - URL string
 * @returns Normalized URL string
 */
export async function normalizeUrl(input: string): Promise<string> {
  await initWasm();
  if (!wasm) throw new Error('WASM not initialized');

  return wasm.normalize_url(input);
}

/**
 * Normalize CSS/XPath selector
 *
 * Basic normalization:
 * - Trim whitespace
 * - Collapse multiple spaces to single space
 *
 * @param input - Selector string
 * @returns Normalized selector
 */
export async function normalizeSelector(input: string): Promise<string> {
  await initWasm();
  if (!wasm) throw new Error('WASM not initialized');

  return wasm.normalize_selector(input);
}

/**
 * Compute JCS SHA-256 hash (for policy_hash)
 *
 * Steps:
 * 1. Canonicalize JSON (RFC 8785)
 * 2. UTF-8 encode
 * 3. SHA-256 hash
 * 4. Base64url encode (no padding)
 *
 * Result is deterministic and suitable for policy_hash in receipts
 *
 * @param input - JSON string or object
 * @returns Base64url-encoded SHA-256 hash (43 chars)
 */
export async function jcsSha256(input: string | Record<string, unknown>): Promise<string> {
  await initWasm();
  if (!wasm) throw new Error('WASM not initialized');

  const jsonStr = typeof input === 'string' ? input : JSON.stringify(input);
  return wasm.jcs_sha256(jsonStr);
}

/**
 * Verify Ed25519 JWS signature
 *
 * @param jws - Compact JWS string (header.payload.signature)
 * @param jwkJson - Ed25519 public key in JWK format (JSON string)
 * @returns true if signature is valid, false otherwise
 */
export async function verifyJws(jws: string, jwkJson: string): Promise<boolean> {
  await initWasm();
  if (!wasm) throw new Error('WASM not initialized');

  return wasm.verify_jws(jws, jwkJson);
}

/**
 * Check if WASM is initialized
 */
export function isWasmInitialized(): boolean {
  return wasm !== null;
}
