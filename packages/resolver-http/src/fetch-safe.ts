// Verifier-oriented fetch composition over @peac/net-node.
//
// Pulls verifier defaults from @peac/kernel.VERIFIER_LIMITS and overrides
// net-node's broader defaults (5000ms vs 30000ms; 256 KiB vs 2 MiB; 64 KiB
// JWKS vs 512 KiB; 3 redirects vs 5). Maps SAFE_FETCH_ERROR_CODES to a
// closed local ResolverHttpErrorCode set. Returns discriminated-union results;
// failure messages are redacted (origin host only; no path / query / headers
// / body / secrets / upstream cause text).
//
// Composition layer over a published primitive. Does not import the protocol package.

import { safeFetchJson, safeFetchJWKS, safeFetchRaw, SAFE_FETCH_ERROR_CODES } from '@peac/net-node';
import { VERIFIER_LIMITS } from '@peac/kernel';

import type {
  FetchSafeFailure,
  FetchSafeOptions,
  FetchSafeResult,
  ResolverHttpErrorCode,
} from './types.js';

function safeOrigin(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '<invalid-url>';
  }
}

function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

function fail(code: ResolverHttpErrorCode, origin: string, status?: number): FetchSafeFailure {
  const base: FetchSafeFailure = {
    ok: false,
    code,
    message: `${code} at ${origin}`,
  };
  return status === undefined ? base : { ...base, status };
}

function mapNetNodeCode(code: string): ResolverHttpErrorCode {
  switch (code) {
    case SAFE_FETCH_ERROR_CODES.E_REQUEST_TIMEOUT:
    case SAFE_FETCH_ERROR_CODES.E_DNS_TIMEOUT:
    case SAFE_FETCH_ERROR_CODES.E_CONNECT_TIMEOUT:
    case SAFE_FETCH_ERROR_CODES.E_HEADERS_TIMEOUT:
    case SAFE_FETCH_ERROR_CODES.E_BODY_TIMEOUT:
      return 'fetch_timeout';
    case SAFE_FETCH_ERROR_CODES.E_NETWORK_ERROR:
    case SAFE_FETCH_ERROR_CODES.E_DNS_RESOLUTION_FAILED:
    case SAFE_FETCH_ERROR_CODES.E_PARSE_ERROR:
      return 'fetch_network_error';
    case SAFE_FETCH_ERROR_CODES.E_SSRF_URL_REJECTED:
    case SAFE_FETCH_ERROR_CODES.E_SSRF_DNS_RESOLVED_PRIVATE:
    case SAFE_FETCH_ERROR_CODES.E_SSRF_ALL_IPS_BLOCKED:
    case SAFE_FETCH_ERROR_CODES.E_SSRF_IPV6_ZONE_ID:
    case SAFE_FETCH_ERROR_CODES.E_SSRF_INVALID_HOST:
    case SAFE_FETCH_ERROR_CODES.E_SSRF_MIXED_DNS_BLOCKED:
    case SAFE_FETCH_ERROR_CODES.E_SSRF_MIXED_DNS_ACK_MISSING:
    case SAFE_FETCH_ERROR_CODES.E_SSRF_ALLOWCIDRS_ACK_REQUIRED:
    case SAFE_FETCH_ERROR_CODES.E_TENANT_KEY_MISSING:
      return 'fetch_blocked_ssrf';
    case SAFE_FETCH_ERROR_CODES.E_SSRF_REDIRECT_BLOCKED:
    case SAFE_FETCH_ERROR_CODES.E_SSRF_TOO_MANY_REDIRECTS:
      return 'fetch_blocked_redirect';
    case SAFE_FETCH_ERROR_CODES.E_RESPONSE_TOO_LARGE:
      return 'fetch_blocked_byte_cap';
    case SAFE_FETCH_ERROR_CODES.E_SSRF_DANGEROUS_PORT:
    case SAFE_FETCH_ERROR_CODES.E_SSRF_DANGEROUS_PORT_ACK_MISSING:
      return 'fetch_blocked_dangerous_port';
    case SAFE_FETCH_ERROR_CODES.E_METHOD_NOT_ALLOWED:
      return 'resolver_internal_error';
    default:
      return 'resolver_internal_error';
  }
}

interface BuiltOptions {
  timeoutMs: number;
  maxResponseBytes: number;
  maxRedirects: number;
}

function buildOptions(opts: FetchSafeOptions | undefined, kind: 'json' | 'jwks'): BuiltOptions {
  const maxResponseBytes =
    opts?.maxResponseBytes ??
    (kind === 'jwks' ? VERIFIER_LIMITS.maxJwksBytes : VERIFIER_LIMITS.maxResponseBytes);
  return {
    timeoutMs: opts?.timeoutMs ?? VERIFIER_LIMITS.fetchTimeoutMs,
    maxResponseBytes,
    maxRedirects: opts?.maxRedirects ?? VERIFIER_LIMITS.maxRedirects,
  };
}

function classifyStatus(status: number): ResolverHttpErrorCode | null {
  if (status >= 400 && status < 500) return 'fetch_status_4xx';
  if (status >= 500) return 'fetch_status_5xx';
  return null;
}

function checkContentType(
  contentType: string | null,
  accept: readonly string[] | undefined
): boolean {
  if (!accept || accept.length === 0) return true;
  if (!contentType) return false;
  const lower = contentType.toLowerCase().split(';')[0].trim();
  return accept.some((allowed) => lower === allowed.toLowerCase());
}

export async function fetchJsonSafe<T = unknown>(
  url: string,
  options?: FetchSafeOptions
): Promise<FetchSafeResult<T>> {
  const origin = safeOrigin(url);
  if (!isHttpsUrl(url)) {
    return fail('fetch_blocked_https_only', origin);
  }
  const built = buildOptions(options, 'json');
  let result;
  try {
    result = await safeFetchJson<T>(url, {
      timeoutMs: built.timeoutMs,
      maxResponseBytes: built.maxResponseBytes,
      maxRedirects: built.maxRedirects,
      allowedMethods: ['GET'],
    });
  } catch {
    return fail('resolver_internal_error', origin);
  }
  if (!result.ok) {
    return fail(mapNetNodeCode(result.code), origin);
  }
  // Status precedence: classify HTTP status BEFORE content-type. A 4xx with
  // text/html body is more usefully reported as fetch_status_4xx than as
  // fetch_invalid_content_type. (Commit 2.1 Fix #2.)
  const statusFailure = classifyStatus(result.response.status);
  if (statusFailure !== null) {
    return fail(statusFailure, origin, result.response.status);
  }
  const contentType = result.response.headers.get('content-type') ?? undefined;
  if (!checkContentType(contentType ?? null, options?.acceptContentTypes)) {
    return fail('fetch_invalid_content_type', origin);
  }
  return {
    ok: true,
    body: result.data,
    bytes: result.evidence?.response_bytes ?? 0,
    contentType,
  };
}

export async function fetchJwksSafe<T = { keys: unknown[] }>(
  url: string,
  options?: FetchSafeOptions
): Promise<FetchSafeResult<T>> {
  const origin = safeOrigin(url);
  if (!isHttpsUrl(url)) {
    return fail('fetch_blocked_https_only', origin);
  }
  const built = buildOptions(options, 'jwks');
  let result;
  try {
    // JWKS endpoints are forced to zero redirects by upstream safeFetchJWKS
    // (deliberate stricter case for key-material URLs); resolver-http's
    // FetchSafeOptions.maxRedirects is silently ignored on this path because
    // safeFetchJWKS has signature Omit<SafeFetchOptions, 'maxRedirects'>.
    // Documented in plan "Commit 2.1, Fix #1".
    result = await safeFetchJWKS(url, {
      timeoutMs: built.timeoutMs,
      maxResponseBytes: built.maxResponseBytes,
      allowedMethods: ['GET'],
    });
  } catch {
    return fail('resolver_internal_error', origin);
  }
  if (!result.ok) {
    return fail(mapNetNodeCode(result.code), origin);
  }
  // Status precedence (Commit 2.1 Fix #2).
  const statusFailure = classifyStatus(result.response.status);
  if (statusFailure !== null) {
    return fail(statusFailure, origin, result.response.status);
  }
  const contentType = result.response.headers.get('content-type') ?? undefined;
  if (!checkContentType(contentType ?? null, options?.acceptContentTypes)) {
    return fail('fetch_invalid_content_type', origin);
  }
  return {
    ok: true,
    body: result.data as T,
    bytes: result.evidence?.response_bytes ?? 0,
    contentType,
  };
}

export async function fetchRawSafe(
  url: string,
  options?: FetchSafeOptions
): Promise<FetchSafeResult<Uint8Array>> {
  const origin = safeOrigin(url);
  if (!isHttpsUrl(url)) {
    return fail('fetch_blocked_https_only', origin);
  }
  const built = buildOptions(options, 'json');
  let raw;
  try {
    raw = await safeFetchRaw(url, {
      timeoutMs: built.timeoutMs,
      maxResponseBytes: built.maxResponseBytes,
      maxRedirects: built.maxRedirects,
      allowedMethods: ['GET'],
    });
  } catch {
    return fail('resolver_internal_error', origin);
  }
  if (!raw.ok) {
    return fail(mapNetNodeCode(raw.code), origin);
  }
  try {
    // Status precedence (Commit 2.1 Fix #2).
    const statusFailure = classifyStatus(raw.response.status);
    if (statusFailure !== null) {
      return fail(statusFailure, origin, raw.response.status);
    }
    const contentType = raw.response.headers.get('content-type') ?? undefined;
    if (!checkContentType(contentType ?? null, options?.acceptContentTypes)) {
      return fail('fetch_invalid_content_type', origin);
    }
    const buf = await raw.response.arrayBuffer();
    if (buf.byteLength > built.maxResponseBytes) {
      return fail('fetch_blocked_byte_cap', origin);
    }
    const bytes = new Uint8Array(buf);
    return {
      ok: true,
      body: bytes,
      bytes: bytes.byteLength,
      contentType,
    };
  } catch {
    return fail('resolver_internal_error', origin);
  } finally {
    try {
      await raw.close();
    } catch {
      // close failures are not surfaced; raw fetch already returned a body
    }
  }
}

export type { FetchSafeOptions, FetchSafeResult, ResolverHttpErrorCode } from './types.js';
