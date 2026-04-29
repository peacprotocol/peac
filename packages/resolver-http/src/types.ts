// Workspace-internal types for @peac/resolver-http.
//
// Discriminated-union result shape for verifier-oriented fetch primitives.
// Closed local error-code set; mapping from upstream @peac/net-node and
// @peac/jwks-cache codes lives in fetch-safe.ts and (later) jwks-resolver.ts.

export type FetchSafeErrorCode =
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
  | 'resolver_internal_error';

export interface FetchSafeOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
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
  code: FetchSafeErrorCode;
  message: string;
  status?: number;
}

export type FetchSafeResult<T> = FetchSafeSuccess<T> | FetchSafeFailure;
