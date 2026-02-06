/**
 * Sandbox Issuer Configuration
 *
 * Resolves the issuer URL from environment or request context.
 * PEAC_ISSUER_URL env override takes precedence, otherwise derives
 * from the request origin.
 *
 * Forwarded headers (X-Forwarded-Proto/Host) are only trusted when
 * PEAC_TRUST_PROXY=1 is set. Without this flag, the issuer URL is
 * derived from the request URL directly.
 */

import type { Context } from 'hono';

const DEFAULT_ISSUER_URL = 'https://sandbox.peacprotocol.org';
const VALID_PROTOS = new Set(['http', 'https']);

/** Conservative hostname[:port] check -- no spaces, no slashes, no query */
const VALID_HOST_RE = /^[a-zA-Z0-9._-]+(:\d{1,5})?$/;

/**
 * Resolve the issuer URL for the current request.
 *
 * Priority:
 * 1. PEAC_ISSUER_URL environment variable
 * 2. Derived from request (forwarded headers only when PEAC_TRUST_PROXY=1)
 * 3. Default: https://sandbox.peacprotocol.org
 */
export function resolveIssuerUrl(c: Context): string {
  const envUrl = process.env.PEAC_ISSUER_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');

  // Only trust forwarded headers behind a known reverse proxy
  if (process.env.PEAC_TRUST_PROXY === '1') {
    const proto = c.req.header('x-forwarded-proto');
    const host = c.req.header('x-forwarded-host') ?? c.req.header('host');
    if (proto && host && VALID_PROTOS.has(proto) && VALID_HOST_RE.test(host)) {
      return `${proto}://${host}`;
    }
  }

  // Derive from request URL directly
  try {
    const url = new URL(c.req.url);
    return url.origin;
  } catch {
    return DEFAULT_ISSUER_URL;
  }
}
