/**
 * Sandbox Issuer Configuration
 *
 * Resolves the issuer URL from environment or request context.
 * PEAC_ISSUER_URL env override takes precedence, otherwise derives
 * from the request origin.
 */

import type { Context } from 'hono';

const DEFAULT_ISSUER_URL = 'https://sandbox.peacprotocol.org';

/**
 * Resolve the issuer URL for the current request.
 *
 * Priority:
 * 1. PEAC_ISSUER_URL environment variable
 * 2. Derived from request (respects X-Forwarded-Proto/Host behind proxies)
 * 3. Default: https://sandbox.peacprotocol.org
 */
export function resolveIssuerUrl(c: Context): string {
  const envUrl = process.env.PEAC_ISSUER_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');

  // Derive from request origin, respecting proxy headers
  const proto = c.req.header('x-forwarded-proto') ?? 'http';
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host');
  if (host) return `${proto}://${host}`;

  return DEFAULT_ISSUER_URL;
}
