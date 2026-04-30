// Pointer-fetch: fetch a compact-JWS receipt by URL, verify SHA-256 digest.
//
// Semantically mirrors the protocol package's call sequence at
// `packages/protocol/src/pointer-fetch.ts:202-235` (string-mode digest path):
//   1. fetch raw bytes via fetchRawSafe (verifier-grade DNS pinning + caps)
//   2. decode bytes to UTF-8 string via TextDecoder('utf-8', { fatal: false })
//   3. compute sha256Hex(receiptString) -- string-mode digest
//   4. compare to expected digest (lowercase hex, 64 chars)
// Raw-bytes-only digest is forbidden because the parity rule mirrors
// protocol's actual call sequence. Byte-equal parity over fetched bodies is
// proven by Commit 4's full harness; this commit asserts class-level parity
// only (Commit 3 parity smoke).
//
// Content-type behavior matches protocol's normalized warning behavior: do
// NOT reject on mismatch; surface a bounded contentTypeWarning string on
// success when the upstream content-type is outside the expected set. The
// resolver-http warning string is its own (bounded, redaction-safe) ; it is
// not byte-equal to protocol's warning string.
//
// Composition layer over a published primitive. Does not import the
// protocol package.

import { sha256Hex } from '@peac/crypto';

import { fetchRawSafe } from './fetch-safe.js';
import type { FetchSafeOptions, FetchSafeFailure, ResolverHttpErrorCode } from './types.js';

const ACCEPTED_CONTENT_TYPES = ['application/jose', 'application/json', 'text/plain'] as const;
const CONTENT_TYPE_WARNING_MAX_LEN = 200;
const EXPECTED_DIGEST_REGEX = /^[0-9a-f]{64}$/;
const COMPACT_JWS_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export interface PointerFetchOptions extends Pick<
  FetchSafeOptions,
  'timeoutMs' | 'maxResponseBytes' | 'maxRedirects'
> {}

export interface PointerFetchSuccess {
  ok: true;
  /** Fetched receipt (compact JWS string). */
  receipt: string;
  /** Actual SHA-256 digest of the decoded UTF-8 string (lowercase hex). */
  actualDigest: string;
  /** Expected SHA-256 digest (echo of the caller's input). */
  expectedDigest: string;
  /** Content-Type header (if present). */
  contentType?: string;
  /**
   * Warning string when content-type is outside the expected set. Bounded
   * length; contains only the upstream content-type value (already public
   * response metadata) plus a stable warning class label. Mirrors protocol's
   * contentTypeWarning behavior at packages/protocol/src/pointer-fetch.ts:208-211.
   */
  contentTypeWarning?: string;
}

export interface PointerFetchFailure extends FetchSafeFailure {
  /** Actual digest if computed (only present for digest-mismatch errors). */
  actualDigest?: string;
  /** Expected digest (only present for digest-mismatch errors). */
  expectedDigest?: string;
}

export type PointerFetchResult = PointerFetchSuccess | PointerFetchFailure;

function safeOrigin(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '<invalid-url>';
  }
}

function fail(code: ResolverHttpErrorCode, origin: string, status?: number): PointerFetchFailure {
  const base: PointerFetchFailure = {
    ok: false,
    code,
    message: `${code} at ${origin}`,
  };
  return status === undefined ? base : { ...base, status };
}

function buildContentTypeWarning(contentType: string): string {
  // Mirror protocol's wording shape but bounded: stable class label +
  // upstream content-type value (public response metadata). Length-capped.
  const safe = contentType.slice(0, CONTENT_TYPE_WARNING_MAX_LEN - 80);
  const warning = `unexpected_content_type: ${safe}; expected application/jose, application/json, or text/plain`;
  return warning.slice(0, CONTENT_TYPE_WARNING_MAX_LEN);
}

function isValidCompactJws(s: string): boolean {
  if (s.length === 0) return false;
  if (s.length > 1024 * 1024) return false; // sanity: bound at 1 MiB
  return COMPACT_JWS_REGEX.test(s);
}

/**
 * Fetch a pointer URL and verify the digest matches the expected value.
 *
 * @param url - HTTPS URL pointing to a compact-JWS receipt
 * @param expectedDigest - Lowercase hex SHA-256 (64 chars) of the receipt
 * @param options - Optional verifier overrides (timeoutMs / maxResponseBytes / maxRedirects)
 *
 * Pre-checks:
 *   - HTTPS-only (delegated to fetchRawSafe; surfaces fetch_blocked_https_only)
 *   - expectedDigest format (64 lowercase hex chars; pointer_invalid_expected_digest otherwise)
 *
 * Post-fetch checks:
 *   - empty body or non-3-segment compact JWS surfaces pointer_malformed_jws
 *   - sha256Hex(decoded_utf8_string) compared to expected digest;
 *     mismatch surfaces pointer_digest_mismatch with both digests echoed
 *   - content-type outside accepted set surfaces a bounded contentTypeWarning
 *     on success (not a failure)
 */
export async function fetchPointerWithDigest(
  url: string,
  expectedDigest: string,
  options?: PointerFetchOptions
): Promise<PointerFetchResult> {
  const origin = safeOrigin(url);

  if (!EXPECTED_DIGEST_REGEX.test(expectedDigest)) {
    // Invalid digest input is a programmer error / API misuse class, not
    // a URL-block / SSRF / policy block. Distinct code per Commit 3.1
    // Plan Fix #3.
    return fail('pointer_invalid_expected_digest', origin);
  }

  const fetchResult = await fetchRawSafe(url, {
    timeoutMs: options?.timeoutMs,
    maxResponseBytes: options?.maxResponseBytes,
    maxRedirects: options?.maxRedirects,
    // Deliberately do NOT pass acceptContentTypes -- pointer-fetch warns on
    // mismatch instead of rejecting (mirrors protocol).
  });

  if (!fetchResult.ok) {
    // SSRF / non-HTTPS / redirect / timeout / network / status pass-through.
    // Map non-HTTPS to pointer_fetch_blocked to match protocol's
    // pointer_fetch_blocked branch semantics for blocked URLs.
    if (fetchResult.code === 'fetch_blocked_https_only') {
      return fail('pointer_fetch_blocked', origin);
    }
    return fetchResult as PointerFetchFailure;
  }

  // Decode raw bytes to UTF-8 string. fatal:false matches protocol's
  // TextDecoder default and tolerates malformed UTF-8 by replacement
  // characters (impossible on a valid JWS but we mirror protocol).
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const receipt = decoder.decode(fetchResult.body);

  if (!isValidCompactJws(receipt)) {
    return fail('pointer_malformed_jws', origin);
  }

  // String-mode digest: sha256Hex(receipt) where receipt is the decoded
  // UTF-8 string. Inside sha256Hex, TextEncoder.encode(receipt) is what
  // gets hashed. For valid UTF-8 (always true on a valid JWS) this is
  // byte-identical to hashing the original wire bytes.
  const actualDigest = await sha256Hex(receipt);

  if (actualDigest !== expectedDigest) {
    return {
      ok: false,
      code: 'pointer_digest_mismatch',
      message: `pointer_digest_mismatch at ${origin}`,
      actualDigest,
      expectedDigest,
    };
  }

  const contentType = fetchResult.contentType;
  const warningNeeded =
    contentType !== undefined &&
    !ACCEPTED_CONTENT_TYPES.some((expected) => contentType.toLowerCase().startsWith(expected));

  return {
    ok: true,
    receipt,
    actualDigest,
    expectedDigest,
    contentType,
    ...(warningNeeded ? { contentTypeWarning: buildContentTypeWarning(contentType) } : {}),
  };
}
