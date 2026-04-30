// Workspace-internal types for resolver-http.
//
// Discriminated-union result shape for verifier-oriented fetch primitives
// and the closed local error-code set for the whole private package
// (fetch-safe today; discovery / jwks-resolver / pointer-fetch in Commit 3).
// Mapping from upstream @peac/net-node and @peac/jwks-cache codes lives in
// fetch-safe.ts and (later) jwks-resolver.ts.

export type ResolverHttpErrorCode =
  | 'fetch_timeout'
  | 'fetch_network_error'
  | 'fetch_blocked_ssrf'
  | 'fetch_blocked_metadata_ip'
  | 'fetch_blocked_redirect'
  | 'fetch_blocked_byte_cap'
  | 'fetch_blocked_https_only'
  | 'fetch_blocked_dangerous_port'
  | 'fetch_status_4xx'
  | 'fetch_status_5xx'
  | 'fetch_invalid_content_type'
  | 'discovery_invalid_shape'
  | 'discovery_oversized'
  | 'jwks_invalid_shape'
  | 'jwks_oversized'
  | 'jwks_kid_not_found'
  | 'pointer_digest_mismatch'
  | 'pointer_fetch_blocked'
  | 'pointer_malformed_jws'
  | 'pointer_invalid_expected_digest'
  | 'resolver_internal_error';

export interface FetchSafeOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
  /**
   * Caller-supplied redirect cap. Honored on the JSON and raw paths
   * (default: VERIFIER_LIMITS.maxRedirects = 3). IGNORED on the JWKS
   * path because upstream `@peac/net-node.safeFetchJWKS` has signature
   * `Omit<SafeFetchOptions, 'maxRedirects'>` and hardcodes 0 redirects
   * for key-material URLs (deliberate stricter case; documented in
   * tranquil-mirroring-fermat.md "Commit 2.1, Fix #1").
   */
  maxRedirects?: number;
  acceptContentTypes?: readonly string[];
}

export interface FetchSafeSuccess<T> {
  ok: true;
  body: T;
  bytes: number;
  contentType: string | undefined;
}

export interface FetchSafeFailure {
  ok: false;
  code: ResolverHttpErrorCode;
  message: string;
  status?: number;
}

export type FetchSafeResult<T> = FetchSafeSuccess<T> | FetchSafeFailure;
