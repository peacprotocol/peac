// Issuer-config discovery composed over fetch-safe.
//
// Fetches the canonical issuer-config endpoint at
// `<issuer>/.well-known/peac-issuer.json` (path constant from
// `@peac/kernel.ISSUER_CONFIG.configPath`), validates a minimal local
// shape, and returns a discriminated-union result with redacted error
// messages. Hand-rolled shape check; no Zod runtime dep, no @peac/schema
// import.
//
// Composition layer over a published primitive. Does not import the
// protocol package.

import { ISSUER_CONFIG } from '@peac/kernel';

import type { FetchSafeOptions, FetchSafeResult } from './types.js';
import { fetchJsonSafe } from './fetch-safe.js';

export interface IssuerConfig {
  issuer: string;
  jwks_uri: string;
  [key: string]: unknown;
}

export type DiscoveryResult = FetchSafeResult<IssuerConfig>;

export interface DiscoveryOptions extends Pick<
  FetchSafeOptions,
  'timeoutMs' | 'maxResponseBytes'
> {}

function safeOrigin(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '<invalid-url>';
  }
}

function buildConfigUrl(issuer: string): string {
  // Strip a single trailing slash from the issuer base before joining the
  // canonical configPath ("/.well-known/peac-issuer.json"). Both
  // "https://issuer.example.com" and "https://issuer.example.com/" must
  // map to the same canonical URL.
  const base = issuer.endsWith('/') ? issuer.slice(0, -1) : issuer;
  return `${base}${ISSUER_CONFIG.configPath}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isParseableUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function validateIssuerConfigShape(body: unknown): IssuerConfig | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }
  const obj = body as Record<string, unknown>;
  if (!isNonEmptyString(obj.issuer)) return null;
  if (!isNonEmptyString(obj.jwks_uri)) return null;
  if (!isParseableUrl(obj.jwks_uri)) return null;
  return obj as IssuerConfig;
}

/**
 * Fetch and validate an issuer's `peac-issuer.json` discovery document.
 *
 * The `issuer` argument is the issuer base URL (e.g.
 * `https://issuer.example.com`). The canonical configuration path
 * (`/.well-known/peac-issuer.json`) comes from
 * `@peac/kernel.ISSUER_CONFIG.configPath`.
 *
 * Validation: `issuer` and `jwks_uri` MUST be non-empty strings;
 * `jwks_uri` MUST parse as a URL. Unknown extra fields are tolerated.
 * Non-HTTPS `jwks_uri` is NOT rejected at the discovery layer; the
 * downstream JWKS fetch (via `fetchJwksSafe`) will reject with
 * `fetch_blocked_https_only` when the actual fetch is attempted.
 */
export async function fetchIssuerConfig(
  issuer: string,
  options?: DiscoveryOptions
): Promise<DiscoveryResult> {
  const url = buildConfigUrl(issuer);
  const origin = safeOrigin(url);

  let result;
  try {
    result = await fetchJsonSafe<unknown>(url, options);
  } catch {
    return {
      ok: false,
      code: 'resolver_internal_error',
      message: `resolver_internal_error at ${origin}`,
    };
  }

  if (!result.ok) {
    return result as DiscoveryResult;
  }

  const validated = validateIssuerConfigShape(result.body);
  if (validated === null) {
    return {
      ok: false,
      code: 'discovery_invalid_shape',
      message: `discovery_invalid_shape at ${origin}`,
    };
  }

  return {
    ok: true,
    body: validated,
    bytes: result.bytes,
    contentType: result.contentType,
  };
}
