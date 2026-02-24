/**
 * Receipt URL Resolver (DD-135, DD-141)
 *
 * Opt-in SSRF-hardened fetch for resolving receipt_url locator hints.
 * Lives in Layer 4 (@peac/net-node), NOT in @peac/schema (Layer 1).
 *
 * Uses raw text fetch (not JSON) since receipt URLs return compact JWS
 * strings (typically served as text/plain or application/jose).
 *
 * Callers MUST verify sha256(fetched_jws) == receipt_ref after resolution.
 * The verifyReceiptRef() helper is provided for this purpose.
 *
 * @since v0.11.2
 */

import { createHash } from 'crypto';
import { safeFetchRaw } from './index.js';
import { validateUrlForSSRF } from './ssrf.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default timeout for receipt URL resolution (5 seconds) */
const DEFAULT_TIMEOUT_MS = 5000;

/** Default max response size for receipt JWS (64 KB) */
const DEFAULT_MAX_BYTES = 65536;

/** Maximum allowed receipt URL length (matches ReceiptUrlSchema) */
const MAX_URL_LENGTH = 2048;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for resolveReceiptUrl */
export interface ResolveReceiptUrlOptions {
  /** Request timeout in milliseconds. Default: 5000 */
  timeoutMs?: number;
  /** Maximum response body size in bytes. Default: 65536 (64 KB) */
  maxBytes?: number;
}

/** Successful resolution result */
export interface ResolveReceiptUrlSuccess {
  ok: true;
  /** Raw compact JWS string fetched from the URL */
  jws: string;
}

/** Failed resolution result */
export interface ResolveReceiptUrlFailure {
  ok: false;
  /** Error code */
  code: string;
  /** Human-readable error message */
  error: string;
}

export type ResolveReceiptUrlResult = ResolveReceiptUrlSuccess | ResolveReceiptUrlFailure;

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a receipt URL to its JWS content (DD-135).
 *
 * SSRF-hardened: rejects private IPs, non-HTTPS, credentials, redirects.
 * Enforces timeout and response size limits.
 * Uses raw text fetch (not JSON parsing) since JWS is a plain text format.
 *
 * After calling this function, the caller MUST verify:
 *   sha256(returned_jws) == carrier.receipt_ref
 *
 * Use the verifyReceiptRef() helper for this check.
 *
 * @param url - Receipt URL (HTTPS only, max 2048 chars, no credentials)
 * @param options - Timeout and size limits
 * @returns Resolution result with JWS string or error
 */
export async function resolveReceiptUrl(
  url: string,
  options?: ResolveReceiptUrlOptions
): Promise<ResolveReceiptUrlResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;

  // Step 1: Length check
  if (url.length > MAX_URL_LENGTH) {
    return {
      ok: false,
      code: 'E_RECEIPT_URL_TOO_LONG',
      error: `Receipt URL exceeds ${MAX_URL_LENGTH} character limit`,
    };
  }

  // Step 2: SSRF pre-validation (HTTPS required, no credentials, no IP literals)
  const ssrfCheck = validateUrlForSSRF(url, {
    requireHttps: true,
    allowCredentials: false,
    allowIPLiterals: false,
  });
  if (!ssrfCheck.ok) {
    return {
      ok: false,
      code: ssrfCheck.code,
      error: ssrfCheck.error,
    };
  }

  // Step 3: Fetch with SSRF-safe infrastructure (DNS pinning, no redirects)
  // Use safeFetchRaw for text content (JWS is not JSON)
  const result = await safeFetchRaw(url, {
    timeoutMs,
    maxResponseBytes: maxBytes,
    maxRedirects: 0,
    method: 'GET',
    headers: {
      Accept: 'application/jose, text/plain',
    },
  });

  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      error: result.error,
    };
  }

  // Step 4: Read response body as text
  let body: string;
  try {
    body = await result.response.text();
  } catch {
    await result.close();
    return {
      ok: false,
      code: 'E_RECEIPT_URL_READ_ERROR',
      error: 'Failed to read receipt URL response body',
    };
  }
  await result.close();

  if (!body || body.length === 0) {
    return {
      ok: false,
      code: 'E_RECEIPT_URL_INVALID_RESPONSE',
      error: 'Receipt URL response is empty',
    };
  }

  // Trim whitespace (servers may include trailing newlines)
  body = body.trim();

  // Step 5: Basic JWS format check: three base64url segments separated by dots
  const parts = body.split('.');
  if (parts.length !== 3) {
    return {
      ok: false,
      code: 'E_RECEIPT_URL_INVALID_JWS',
      error: 'Receipt URL response is not a valid compact JWS (expected 3 dot-separated segments)',
    };
  }

  return { ok: true, jws: body };
}

// ---------------------------------------------------------------------------
// Post-fetch verification helper
// ---------------------------------------------------------------------------

/**
 * Verify that a fetched JWS matches the expected receipt_ref.
 *
 * This enforces the post-fetch invariant (DD-135):
 *   sha256(fetched_jws) == carrier.receipt_ref
 *
 * @param jws - The fetched compact JWS string
 * @param receiptRef - The expected receipt_ref (format: "sha256:<hex64>")
 * @returns true if the JWS matches the receipt_ref
 */
export function verifyReceiptRef(jws: string, receiptRef: string): boolean {
  const hash = createHash('sha256').update(jws).digest('hex');
  const computed = `sha256:${hash}`;
  return computed === receiptRef;
}
