/**
 * did:web resolver using a caller-provided SSRF-hardened fetch.
 *
 * Implements the did:web method spec (W3C CCG draft).
 * Resolves did:web DIDs to DID Documents via HTTPS fetch.
 *
 * Callers MUST provide a hardened fetch function (e.g., safeFetchJson
 * from @peac/net-node) that enforces:
 * - HTTPS only
 * - No redirects
 * - Private-IP / DNS-rebinding protections
 * - Timeout
 * - Response size limit
 *
 * This resolver adds:
 * - did:web authority/path validation (no userinfo, no query/fragment,
 *   no empty segments, no IP literals)
 * - Content-type enforcement (application/did+json or application/json)
 * - Exact DID Document id match (DD-203)
 * - Domain allowlist (optional)
 *
 * URL transformation rules:
 * - did:web:example.com -> https://example.com/.well-known/did.json
 * - did:web:example.com:path:to -> https://example.com/path/to/did.json
 * - did:web:example.com%3A8443 -> https://example.com:8443/.well-known/did.json
 */

import type { DIDDocument } from './types.js';
import type { DIDResolutionResult } from './types.js';
import type { DIDResolver } from './resolver.js';

// ---------------------------------------------------------------------------
// Fetch Contract
// ---------------------------------------------------------------------------

/**
 * Result shape for the caller-provided hardened fetch function.
 *
 * Callers should use safeFetchJson from @peac/net-node, which returns
 * this shape. The resolver uses contentType and finalUrl for additional
 * validation beyond what the fetch function itself enforces.
 */
export interface HardenedFetchResult<T = unknown> {
  ok: boolean;
  data?: T;
  code?: string;
  error?: string;
  /** Content-Type of the response (for validation) */
  contentType?: string;
  /** Final URL after any processing (for redirect detection) */
  finalUrl?: string;
}

export type HardenedFetchFn = <T = unknown>(
  url: string,
  options?: { timeoutMs?: number; maxResponseBytes?: number; maxRedirects?: number }
) => Promise<HardenedFetchResult<T>>;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface DidWebResolverOptions {
  /** Request timeout in milliseconds (default: 5000) */
  timeoutMs?: number;
  /**
   * Optional domain allowlist (lowercase). If set, only these domains
   * are permitted. Comparison is case-insensitive.
   */
  allowedDomains?: string[];
  /**
   * SSRF-hardened fetch function. Required.
   * Use safeFetchJson from @peac/net-node for production.
   */
  fetchFn: HardenedFetchFn;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_DOCUMENT_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;

/** Acceptable content types for DID Documents */
const ACCEPTABLE_CONTENT_TYPES = new Set(['application/did+json', 'application/json']);

// ---------------------------------------------------------------------------
// did:web Resolver
// ---------------------------------------------------------------------------

export class DidWebResolver implements DIDResolver {
  readonly methods = ['web'] as const;

  private readonly timeoutMs: number;
  private readonly allowedDomains: string[] | undefined;
  private readonly fetchFn: HardenedFetchFn;

  constructor(options: DidWebResolverOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.allowedDomains = options.allowedDomains?.map(normalizeHostname);
    this.fetchFn = options.fetchFn;
  }

  async resolve(did: string): Promise<DIDResolutionResult> {
    // 1. Validate DID format
    if (!did.startsWith('did:web:')) {
      return errorResult('invalidDid');
    }

    const methodSpecificId = did.slice('did:web:'.length);
    if (!methodSpecificId) {
      return errorResult('invalidDid');
    }

    // 2. Validate and transform to URL
    const urlResult = validateAndTransform(methodSpecificId);
    if (!urlResult.ok) {
      return errorResult('invalidDid');
    }
    const url = urlResult.url;

    // 3. Domain allowlist check (case-insensitive, trailing-dot-normalized)
    const hostname = normalizeHostname(urlResult.hostname);
    if (this.allowedDomains && !this.allowedDomains.includes(hostname)) {
      return errorResult('invalidDid');
    }

    // 4. Fetch DID Document
    let fetchResult: HardenedFetchResult;
    try {
      fetchResult = await this.fetchFn<unknown>(url, {
        timeoutMs: this.timeoutMs,
        maxResponseBytes: MAX_DOCUMENT_BYTES,
        maxRedirects: 0,
      });
    } catch {
      return errorResult('notFound');
    }

    if (!fetchResult.ok || !fetchResult.data) {
      return errorResult('notFound');
    }

    // 5. Redirect detection: if finalUrl is provided, it must match the
    // requested URL exactly. The fetch contract uses maxRedirects: 0, so
    // any discrepancy indicates the fetcher did not enforce no-redirect.
    if (fetchResult.finalUrl && fetchResult.finalUrl !== url) {
      return errorResult('invalidDid');
    }

    // 6. Content-type enforcement (application/did+json or application/json)
    if (fetchResult.contentType) {
      const baseType = fetchResult.contentType.split(';')[0].trim().toLowerCase();
      if (!ACCEPTABLE_CONTENT_TYPES.has(baseType)) {
        return errorResult('invalidDid');
      }
    }

    // 7. Validate response is a JSON object with `id` field
    const raw = fetchResult.data;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return errorResult('invalidDid');
    }

    const doc = raw as DIDDocument;

    if (typeof doc.id !== 'string') {
      return errorResult('invalidDid');
    }

    // 8. Exact `id` match (DD-203)
    if (doc.id !== did) {
      return errorResult('invalidDid');
    }

    return {
      didDocument: doc,
      didResolutionMetadata: { contentType: 'application/did+json' },
      didDocumentMetadata: {},
    };
  }
}

// ---------------------------------------------------------------------------
// Authority + Path Validation (Fix 2: strict validation)
// ---------------------------------------------------------------------------

interface ValidationResult {
  ok: boolean;
  url: string;
  hostname: string;
}

/**
 * Validate and transform a did:web method-specific identifier to an HTTPS URL.
 *
 * Rejects:
 * - IP literals (IPv4, IPv6)
 * - Userinfo in authority
 * - Query or fragment components
 * - Empty path segments
 * - Malformed percent encoding
 * - Empty host
 */
function validateAndTransform(methodSpecificId: string): ValidationResult {
  const fail: ValidationResult = { ok: false, url: '', hostname: '' };

  // Split on ':' for domain + optional path segments
  const parts = methodSpecificId.split(':');
  if (parts.length === 0 || !parts[0]) {
    return fail;
  }

  // Decode authority (handles %3A for port)
  let authority: string;
  try {
    authority = decodeURIComponent(parts[0]);
  } catch {
    return fail; // Malformed percent encoding
  }

  // Reject empty authority
  if (!authority) {
    return fail;
  }

  // Reject userinfo (@ in authority)
  if (authority.includes('@')) {
    return fail;
  }

  // Reject query/fragment in authority
  if (authority.includes('?') || authority.includes('#')) {
    return fail;
  }

  // Reject encoded slashes in authority (path traversal attempt)
  if (authority.includes('/')) {
    return fail;
  }

  // Parse hostname (with possible port)
  let hostname: string;
  try {
    const testUrl = new URL(`https://${authority}`);
    hostname = testUrl.hostname;

    // Reject if URL constructor added unexpected components
    if (testUrl.username || testUrl.password) {
      return fail;
    }
  } catch {
    return fail; // Invalid authority
  }

  // Reject IP literals
  if (isIPLiteral(hostname)) {
    return fail;
  }

  // Reject empty hostname
  if (!hostname) {
    return fail;
  }

  // Decode and validate path segments
  if (parts.length > 1) {
    const pathParts = parts.slice(1);

    for (const segment of pathParts) {
      // Reject empty path segments
      if (!segment) {
        return fail;
      }

      // Decode and reject slashes/query/fragment in segments
      let decoded: string;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        return fail;
      }

      if (decoded.includes('/') || decoded.includes('?') || decoded.includes('#')) {
        return fail;
      }
    }

    const decodedSegments = pathParts.map(decodeURIComponent);
    return {
      ok: true,
      url: `https://${authority}/${decodedSegments.join('/')}/did.json`,
      hostname,
    };
  }

  return {
    ok: true,
    url: `https://${authority}/.well-known/did.json`,
    hostname,
  };
}

/**
 * Check if a hostname is an IP literal (IPv4 or IPv6).
 */
function isIPLiteral(hostname: string): boolean {
  if (hostname.startsWith('[')) return true;
  const parts = hostname.split('.');
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a hostname for consistent comparison.
 * Lowercases and strips trailing dot (DNS root).
 */
function normalizeHostname(host: string): string {
  return host.toLowerCase().replace(/\.$/, '');
}

function errorResult(error: string): DIDResolutionResult {
  return {
    didDocument: null,
    didResolutionMetadata: { error },
    didDocumentMetadata: {},
  };
}
