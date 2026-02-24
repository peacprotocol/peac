/**
 * Hash-first evidence model for OpenAI-compatible completions (DD-138).
 *
 * SHA-256 digests of messages and output.
 * No raw prompt or completion text is stored in receipts.
 *
 * Canonicalization: deterministic key-sorted JSON serialization.
 * Object keys are sorted lexicographically at every nesting level,
 * then serialized via JSON.stringify. This is NOT RFC 8785 JCS
 * (which has additional requirements for numeric handling); it is
 * sufficient for ChatMessage objects whose fields are strings,
 * booleans, nulls, and arrays of the same.
 *
 * Input constraints enforced by canonicalize():
 *   - Allowed: string, number, boolean, null, plain object, array
 *   - Rejected: Date, RegExp, Map, Set, Function, Symbol, BigInt, undefined
 *     (at any nesting level)
 */

import { getSubtle } from './crypto.js';
import type { ChatMessage } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

/**
 * SHA-256 hash a string, return `sha256:<hex64>`.
 *
 * Uses getSubtle() for portable WebCrypto access
 * (Node 19+ globalThis.crypto.subtle, fallback to node:crypto webcrypto).
 */
async function sha256(input: string): Promise<string> {
  const data = encoder.encode(input);
  const subtle = getSubtle();
  const buf = await subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}

// ---------------------------------------------------------------------------
// Canonicalization
// ---------------------------------------------------------------------------

/**
 * Recursively sort object keys for deterministic serialization.
 *
 * This produces a stable JSON representation by sorting object keys
 * lexicographically at every nesting level. Arrays preserve order.
 *
 * Note: this is deterministic key-sorted JSON, not RFC 8785 JCS.
 * Suitable for ChatMessage fields (strings, nulls, arrays, booleans).
 *
 * Input constraints: only JSON-safe types are accepted (string, number,
 * boolean, null, plain object, array). Date, RegExp, Map, Set, Function,
 * Symbol, BigInt, and undefined are rejected with a TypeError.
 *
 * @throws {TypeError} if input contains non-JSON-safe types
 */
function canonicalize(value: unknown): unknown {
  if (value === null) return value;

  if (value === undefined) {
    throw new TypeError('canonicalize: undefined is not allowed; use null instead');
  }

  const t = typeof value;

  // Primitives: string, number, boolean pass through
  if (t === 'string' || t === 'number' || t === 'boolean') {
    return value;
  }

  // Reject non-JSON-safe primitives
  if (t === 'bigint') {
    throw new TypeError('canonicalize: BigInt is not JSON-serializable');
  }
  if (t === 'symbol') {
    throw new TypeError('canonicalize: Symbol is not JSON-serializable');
  }
  if (t === 'function') {
    throw new TypeError('canonicalize: Function is not JSON-serializable');
  }

  // Object types
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  // Reject non-plain objects (Date, RegExp, Map, Set, etc.)
  if (value instanceof Date) {
    throw new TypeError('canonicalize: Date objects are not allowed; use ISO 8601 strings');
  }
  if (value instanceof RegExp) {
    throw new TypeError('canonicalize: RegExp objects are not JSON-serializable');
  }
  if (value instanceof Map || value instanceof Set) {
    throw new TypeError(
      'canonicalize: Map/Set are not JSON-serializable; use plain objects/arrays'
    );
  }

  // Plain object: sort keys recursively
  if (t === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  // Catch-all for any other unexpected type
  throw new TypeError(`canonicalize: unsupported type "${t}"`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Hash an array of chat messages.
 *
 * Applies deterministic key-sorted JSON serialization (sorted keys at
 * every nesting level), then computes SHA-256. Returns `sha256:<hex64>`.
 *
 * @param messages - The chat messages to hash
 * @returns `sha256:<hex64>` digest string
 * @throws {TypeError} if messages contain non-JSON-safe types
 */
export async function hashMessages(messages: ChatMessage[]): Promise<string> {
  const canonical = JSON.stringify(canonicalize(messages));
  return sha256(canonical);
}

/**
 * Compute the byte size of a messages array (canonical JSON).
 *
 * @throws {TypeError} if messages contain non-JSON-safe types
 */
export function messagesBytes(messages: ChatMessage[]): number {
  const canonical = JSON.stringify(canonicalize(messages));
  return encoder.encode(canonical).byteLength;
}

/**
 * Hash chat completion output text.
 *
 * Computes SHA-256 of the output content string.
 * Returns `sha256:<hex64>`.
 *
 * @param content - The output text to hash (concatenated choice contents)
 * @returns `sha256:<hex64>` digest string
 */
export async function hashOutput(content: string): Promise<string> {
  return sha256(content);
}

/**
 * Compute the byte size of output content.
 */
export function outputBytes(content: string): number {
  return encoder.encode(content).byteLength;
}
