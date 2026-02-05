/**
 * PEAC Pointer Fetch with Digest Verification
 *
 * Implements secure receipt fetching via pointers per TRANSPORT-PROFILES.md:
 * - SSRF-safe fetch
 * - SHA-256 digest verification
 * - Size limits
 *
 * @packageDocumentation
 */

import { sha256Hex } from '@peac/crypto';
import { VERIFIER_LIMITS } from '@peac/kernel';
import { ssrfSafeFetch, type SSRFFetchOptions, type SSRFFetchError } from './ssrf-safe-fetch.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Pointer fetch options
 */
export interface PointerFetchOptions {
  /** URL to fetch the receipt from */
  url: string;
  /** Expected SHA-256 digest (lowercase hex, 64 chars) */
  expectedDigest: string;
  /** Optional SSRF fetch options */
  fetchOptions?: Omit<SSRFFetchOptions, 'maxBytes'>;
}

/**
 * Successful pointer fetch result
 */
export interface PointerFetchSuccess {
  ok: true;
  /** Fetched receipt (JWS compact serialization) */
  receipt: string;
  /** Actual SHA-256 digest of fetched content */
  actualDigest: string;
  /** Whether digest matched expected */
  digestMatched: true;
  /** Content-Type header (if present) */
  contentType?: string;
  /**
   * Warning about unexpected Content-Type.
   * Present when Content-Type is not application/jose, application/json, or text/plain.
   * Does not cause rejection (for interoperability) but callers may want to log.
   */
  contentTypeWarning?: string;
}

/**
 * Failed pointer fetch result
 */
export interface PointerFetchError {
  ok: false;
  /** Error reason */
  reason:
    | 'pointer_fetch_blocked'
    | 'pointer_fetch_failed'
    | 'pointer_fetch_timeout'
    | 'pointer_fetch_too_large'
    | 'pointer_digest_mismatch'
    | 'malformed_receipt';
  /** Error code for reports */
  errorCode: string;
  /** Human-readable error message */
  message: string;
  /** Actual digest if computed (for mismatch errors) */
  actualDigest?: string;
  /** Expected digest */
  expectedDigest?: string;
}

/**
 * Pointer fetch result
 */
export type PointerFetchResult = PointerFetchSuccess | PointerFetchError;

// ---------------------------------------------------------------------------
// Error Mapping
// ---------------------------------------------------------------------------

/**
 * Map SSRF error reason to pointer error reason
 */
function mapSsrfError(ssrfError: SSRFFetchError): PointerFetchError {
  const reason = ssrfError.reason;

  switch (reason) {
    case 'not_https':
    case 'private_ip':
    case 'loopback':
    case 'link_local':
    case 'dns_failure':
    case 'cross_origin_redirect':
      return {
        ok: false,
        reason: 'pointer_fetch_blocked',
        errorCode: 'E_VERIFY_POINTER_FETCH_BLOCKED',
        message: ssrfError.message,
      };

    case 'timeout':
      return {
        ok: false,
        reason: 'pointer_fetch_timeout',
        errorCode: 'E_VERIFY_POINTER_FETCH_TIMEOUT',
        message: ssrfError.message,
      };

    case 'response_too_large':
      return {
        ok: false,
        reason: 'pointer_fetch_too_large',
        errorCode: 'E_VERIFY_POINTER_FETCH_TOO_LARGE',
        message: ssrfError.message,
      };

    default:
      return {
        ok: false,
        reason: 'pointer_fetch_failed',
        errorCode: 'E_VERIFY_POINTER_FETCH_FAILED',
        message: ssrfError.message,
      };
  }
}

// ---------------------------------------------------------------------------
// Pointer Fetch
// ---------------------------------------------------------------------------

/**
 * Fetch a receipt via pointer with digest verification
 *
 * Per TRANSPORT-PROFILES.md:
 * - Fetch the URL using SSRF-safe fetch
 * - Compute SHA-256 digest of response
 * - Verify digest matches expected value from header
 * - Return receipt only if digest matches
 *
 * @param options - Pointer fetch options
 * @returns Fetch result
 */
export async function fetchPointerWithDigest(
  options: PointerFetchOptions
): Promise<PointerFetchResult> {
  const { url, expectedDigest, fetchOptions = {} } = options;

  // Validate expected digest format
  const hexRegex = /^[0-9a-f]{64}$/;
  if (!hexRegex.test(expectedDigest)) {
    return {
      ok: false,
      reason: 'pointer_fetch_failed',
      errorCode: 'E_VERIFY_POINTER_FETCH_FAILED',
      message: 'Invalid expected digest: must be 64 lowercase hex characters',
    };
  }

  // Validate URL is HTTPS (pre-check before fetch)
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:') {
      return {
        ok: false,
        reason: 'pointer_fetch_blocked',
        errorCode: 'E_VERIFY_POINTER_FETCH_BLOCKED',
        message: 'Pointer URL must use HTTPS',
      };
    }
  } catch {
    return {
      ok: false,
      reason: 'pointer_fetch_failed',
      errorCode: 'E_VERIFY_POINTER_FETCH_FAILED',
      message: 'Invalid pointer URL',
    };
  }

  // Fetch with SSRF protection and DoS bounds
  // - Size cap: maxReceiptBytes (prevents memory exhaustion)
  // - No redirects: prevents redirect-based SSRF (pointer URL must be direct)
  // - Timeout: prevents slow-loris style attacks
  const fetchResult = await ssrfSafeFetch(url, {
    ...fetchOptions,
    maxBytes: VERIFIER_LIMITS.maxReceiptBytes,
    allowRedirects: false, // Pointer URL must be direct - no redirects
    timeoutMs: fetchOptions?.timeoutMs ?? VERIFIER_LIMITS.fetchTimeoutMs,
    headers: {
      Accept: 'application/jose, application/json, text/plain',
      ...fetchOptions.headers,
    },
  });

  if (!fetchResult.ok) {
    return mapSsrfError(fetchResult);
  }

  const receipt = fetchResult.body;

  // Validate Content-Type if present (warn but don't reject for interoperability)
  // Expected: application/jose, application/json, or text/plain
  const contentType = fetchResult.contentType;
  const expectedContentTypes = ['application/jose', 'application/json', 'text/plain'];
  const contentTypeWarning =
    contentType &&
    !expectedContentTypes.some(expected => contentType.startsWith(expected))
      ? `Unexpected Content-Type: ${contentType}; expected application/jose, application/json, or text/plain`
      : undefined;

  // Validate: reject empty body
  if (!receipt || receipt.trim().length === 0) {
    return {
      ok: false,
      reason: 'malformed_receipt',
      errorCode: 'E_VERIFY_MALFORMED_RECEIPT',
      message: 'Pointer target returned empty content',
    };
  }

  // Validate: content must look like JWS compact serialization (3 dot-separated segments)
  const jwsValidation = validateJwsCompactStructure(receipt);
  if (!jwsValidation.valid) {
    return {
      ok: false,
      reason: 'malformed_receipt',
      errorCode: 'E_VERIFY_MALFORMED_RECEIPT',
      message: jwsValidation.message,
    };
  }

  // Compute digest of fetched content (hash the raw string bytes)
  const actualDigest = await sha256Hex(receipt);

  // Verify digest matches
  if (actualDigest !== expectedDigest) {
    return {
      ok: false,
      reason: 'pointer_digest_mismatch',
      errorCode: 'E_VERIFY_POINTER_DIGEST_MISMATCH',
      message: 'Fetched receipt digest does not match expected digest',
      actualDigest,
      expectedDigest,
    };
  }

  return {
    ok: true,
    receipt,
    actualDigest,
    digestMatched: true,
    contentType: fetchResult.contentType,
    ...(contentTypeWarning && { contentTypeWarning }),
  };
}

/**
 * Validate that a string looks like JWS compact serialization
 *
 * A valid JWS compact has exactly 3 dot-separated base64url segments.
 *
 * @param value - String to validate
 * @returns Validation result
 */
function validateJwsCompactStructure(value: string): { valid: true } | { valid: false; message: string } {
  const segments = value.split('.');

  if (segments.length !== 3) {
    return {
      valid: false,
      message: `Invalid JWS compact serialization: expected 3 segments, got ${segments.length}`,
    };
  }

  // All segments must be non-empty and contain only base64url characters
  const base64urlRegex = /^[A-Za-z0-9_-]+$/;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.length === 0) {
      return {
        valid: false,
        message: `Invalid JWS compact serialization: segment ${i + 1} is empty`,
      };
    }
    if (!base64urlRegex.test(segment)) {
      return {
        valid: false,
        message: `Invalid JWS compact serialization: segment ${i + 1} contains invalid characters`,
      };
    }
  }

  return { valid: true };
}

/**
 * Verify a pointer header and fetch the receipt
 *
 * Combines parsing and fetching in a single operation.
 *
 * @param pointerHeader - PEAC-Receipt-Pointer header value
 * @param fetchOptions - Optional SSRF fetch options
 * @returns Fetch result
 */
export async function verifyAndFetchPointer(
  pointerHeader: string,
  fetchOptions?: Omit<SSRFFetchOptions, 'maxBytes'>
): Promise<PointerFetchResult> {
  // Parse pointer header (RFC 8941 dictionary format)
  // Format: sha256="<hex>", url="<url>"
  const regex = /(\w+)=(?:"([^"]*)"|([^,\s]*))/g;
  const params: Record<string, string> = {};
  let match;

  while ((match = regex.exec(pointerHeader)) !== null) {
    const key = match[1];
    const value = match[2] ?? match[3];
    params[key] = value;
  }

  if (!params.sha256) {
    return {
      ok: false,
      reason: 'pointer_fetch_failed',
      errorCode: 'E_VERIFY_POINTER_FETCH_FAILED',
      message: 'PEAC-Receipt-Pointer missing sha256 parameter',
    };
  }

  if (!params.url) {
    return {
      ok: false,
      reason: 'pointer_fetch_failed',
      errorCode: 'E_VERIFY_POINTER_FETCH_FAILED',
      message: 'PEAC-Receipt-Pointer missing url parameter',
    };
  }

  return fetchPointerWithDigest({
    url: params.url,
    expectedDigest: params.sha256,
    fetchOptions,
  });
}
