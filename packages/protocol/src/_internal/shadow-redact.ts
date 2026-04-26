/**
 * Shadow-mode telemetry redaction and canonical hashing.
 *
 * @internal
 *
 * INTERNAL ONLY. Not re-exported from packages/protocol/src/index.ts.
 *
 * Two responsibilities:
 *
 *   1. `redactNote(input, maxBytes)`: scrub known secret classes from
 *      a free-form string and bound it to a UTF-8 byte ceiling. Used
 *      for the `notes` field on every shadow divergence record so
 *      that an accidental string concatenation cannot leak credential
 *      material into the in-memory shadow log.
 *
 *   2. `canonicalHashOf(value)` / `hashJws(jws)`: produce a SHA-256
 *      hex digest of a canonicalized representation. Used as the
 *      comparison primitive between real-path and shadow-path results
 *      so the divergence log never needs to store raw output.
 *
 * SECRET_PATTERNS is the ground-truth contract for what counts as a
 * leakable secret class. Adding a regex here REQUIRES a paired
 * adversarial test vector in shadow-redact-adversarial.test.ts (one
 * matching vector + one adjacent benign-not-matched vector). Removing
 * a regex here REQUIRES the same justification.
 *
 * Platform neutrality: this module avoids Node-only globals (`Buffer`,
 * `node:crypto`) so it can ship inside the platform-neutral
 * @peac/protocol bundle. UTF-8 byte work uses TextEncoder/TextDecoder;
 * SHA-256 hashing delegates to @peac/crypto.sha256Hex which uses the
 * Web Crypto API with a dynamic Node fallback.
 */

import { base64urlEncode, sha256Hex } from '@peac/crypto';

/**
 * Known secret-class patterns. Order matters only for performance
 * (broader patterns first reduce the search space for narrower ones).
 *
 * @internal
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  // Compact JWS / JWT (header.payload.signature with eyJ-prefixed header).
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,

  // PEM-encoded blocks. Covers RSA / EC / OPENSSH / generic PRIVATE KEY
  // header variants in a single pattern.
  /-----BEGIN [A-Z0-9 ]+-----[\s\S]+?-----END [A-Z0-9 ]+-----/g,

  // Long base64 runs (>=40 chars). The character class is the standard
  // base64 alphabet only (no `_` or `-`) so that kebab-case and
  // snake_case identifier strings do not collateral-match. base64url
  // payloads carrying credentials are reached via more specific patterns
  // (compact JWS, Bearer, URL query token) and via the wrapper headers
  // they appear in.
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,

  // Bearer token (Authorization header value with Bearer scheme).
  /Bearer\s+[A-Za-z0-9._\-/+=]+/gi,

  // Generic Authorization header line (any scheme, including Basic /
  // Digest / Negotiate). Multiline-anchored.
  /^authorization:\s*[^\r\n]+/gim,

  // Generic auth-token header line (X-Auth-Token, X-API-Key).
  /^x-(?:auth-token|api-key):\s*[^\r\n]+/gim,

  // Cookie request header line (raw client cookies).
  /^cookie:\s*[^\r\n]+/gim,

  // Set-Cookie response header line (server-issued sessions).
  /^set-cookie:\s*[^\r\n]+/gim,

  // URL query token / API key / secret / access_token.
  /[?&](?:token|key|secret|access_token|api_key|apikey)=[^&\s#]+/gi,

  // AWS access key ID (AKIA + 16 alphanumeric).
  /\bAKIA[0-9A-Z]{16}\b/g,

  // Email address (PII).
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,

  // Phone numbers. Three explicit forms (E.164 + parenthesized NA + dashed
  // NA / international) so plain consecutive-digit runs (sequence
  // numbers, hashes, identifiers) do not collateral-match.
  /\+\d[\d\s().-]{6,}\d/g,
  /\(\d{3}\)\s*\d{3}[\s.-]?\d{4}/g,
  /\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b/g,
];

/**
 * Redaction marker used in place of any matched secret class.
 *
 * @internal
 */
const REDACTION_MARKER = '[REDACTED]';

const TEXT_ENCODER = /* @__PURE__ */ new TextEncoder();
const TEXT_DECODER = /* @__PURE__ */ new TextDecoder('utf-8', { fatal: false });

const REDACTION_MARKER_BYTES = TEXT_ENCODER.encode(REDACTION_MARKER).length;

/**
 * UTF-8 byte length of a string. Platform-neutral replacement for
 * `Buffer.byteLength(s, 'utf8')`.
 *
 * @internal
 */
export function utf8ByteLength(value: string): number {
  return TEXT_ENCODER.encode(value).length;
}

/**
 * Redact known secret classes from `input` and bound the result to
 * `maxBytes` UTF-8 bytes. The output always either matches the input
 * (when no secret was found and the byte budget permits) or contains
 * the `[REDACTED]` marker.
 *
 * Truncation is byte-aware so multibyte UTF-8 sequences are not split
 * mid-character. When the redacted string exceeds `maxBytes`, the
 * tail is replaced with the marker.
 *
 * @internal
 */
export function redactNote(input: string, maxBytes: number): string {
  if (typeof input !== 'string') return REDACTION_MARKER;

  let redacted = input;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, REDACTION_MARKER);
  }

  const bytes = TEXT_ENCODER.encode(redacted);
  if (bytes.length <= maxBytes) return redacted;

  if (maxBytes <= REDACTION_MARKER_BYTES) {
    return REDACTION_MARKER.slice(0, maxBytes);
  }

  const headBytes = maxBytes - REDACTION_MARKER_BYTES;
  return safeUtf8Slice(bytes, headBytes) + REDACTION_MARKER;
}

/**
 * SHA-256 hex digest of a canonical-stringified value. Used by the
 * shadow comparator to detect output-byte-diff WITHOUT logging raw
 * content. Object keys are sorted recursively so equivalent objects
 * with different key orders produce identical digests.
 *
 * Async because SHA-256 hashing in this codebase is platform-neutral
 * via @peac/crypto.sha256Hex (Web Crypto API with dynamic Node
 * fallback). Callers run inside the shadow scheduler's microtask /
 * macrotask boundary, so an additional await is free.
 *
 * @internal
 */
export async function canonicalHashOf(value: unknown): Promise<string> {
  return sha256Hex(canonicalStringify(value));
}

/**
 * SHA-256 hex digest of a JWS string. Used as the primary
 * `recordRefHash` input for divergence records.
 *
 * @internal
 */
export async function hashJws(jws: string): Promise<string> {
  return sha256Hex(jws);
}

/**
 * Canonical JSON serialization with stable key order. Internal helper
 * for `canonicalHashOf`. Not exported.
 */
function canonicalStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'undefined') return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'null';
  }
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalStringify).join(',') + ']';
  }
  if (value instanceof Uint8Array) {
    return JSON.stringify(base64urlEncode(value));
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return (
      '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}'
    );
  }
  return 'null';
}

/**
 * Slice a UTF-8 byte buffer to at most `byteLen` bytes without
 * splitting a multi-byte sequence mid-character. Returns a decoded
 * string. Internal helper for `redactNote`. Not exported.
 */
function safeUtf8Slice(bytes: Uint8Array, byteLen: number): string {
  if (byteLen <= 0) return '';
  if (bytes.length <= byteLen) return TEXT_DECODER.decode(bytes);

  let end = byteLen;
  // Walk back over UTF-8 continuation bytes (0b10xxxxxx) so the slice
  // ends on a complete code-point boundary.
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) {
    end -= 1;
  }
  return TEXT_DECODER.decode(bytes.subarray(0, end));
}
