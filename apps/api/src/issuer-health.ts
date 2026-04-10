/**
 * GET /v1/issuer-health?issuer=<url-encoded-issuer>
 *
 * Reference issuer-health probe. Checks issuer JWKS and discovery config.
 * Self-hostable, tenantless. Not a hosted product health console.
 *
 * Uses query parameter for issuer input (not path-encoded URL) to avoid
 * double-decoding, proxy normalization, and SSRF-adjacent parsing issues.
 *
 * SSRF protection: uses @peac/jwks-cache validateUrl() for HTTPS enforcement,
 * literal IP blocking, localhost blocking, and metadata IP detection.
 * Does NOT create a second fetch stack; uses validateUrl as the security
 * boundary, then makes minimal fetches with redirect: 'error' and timeouts.
 *
 * Rate limited independently (10 req/min per IP).
 */

import type { Context } from 'hono';
import { z } from 'zod';
import { validateUrl, isMetadataIp } from '@peac/jwks-cache';
import { MemoryRateLimitStore } from '@peac/middleware-core';
import { toProblemDetails } from './error-catalog.js';

const HEALTH_RATE_LIMIT = 10;
const HEALTH_WINDOW_MS = 60 * 1000;
const CACHE_TTL_SECONDS = 60;
const FETCH_TIMEOUT_MS = 5000;

const IssuerParamSchema = z
  .string()
  .url()
  .refine((u) => u.startsWith('https://'), { message: 'issuer must use HTTPS' });

const healthRateLimitStore = new MemoryRateLimitStore({ maxKeys: 1_000 });

/** Canonicalize issuer URL for cache key: lowercase scheme+host, strip trailing slash. */
function canonicalizeIssuer(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
}

interface HealthResult {
  healthy: boolean;
  issuer: string;
  checks: {
    discovery: 'ok' | 'fail' | 'not_found';
    jwks: 'ok' | 'fail' | 'not_found';
    ed25519_keys: number;
  };
  checked_at: string;
  cached: boolean;
  cache_ttl_seconds: number;
}

const healthCache = new Map<string, { result: HealthResult; expiresAt: number }>();

/**
 * SSRF-safe fetch: validates URL through @peac/jwks-cache security layer,
 * then fetches with redirect: 'error' and timeout. No redirects followed.
 */
async function ssrfSafeFetch(url: string): Promise<Response | null> {
  // Validate through shared SSRF protection (HTTPS, no literal IPs, no localhost)
  try {
    validateUrl(url, { allowLocalhost: false });
  } catch {
    return null;
  }

  // Additional metadata IP check
  const parsed = new URL(url);
  if (isMetadataIp(parsed.hostname)) {
    return null;
  }

  try {
    return await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'error', // No redirects (prevents redirect-to-private-IP)
    });
  } catch {
    return null;
  }
}

async function probeIssuer(issuer: string): Promise<HealthResult> {
  const canonical = canonicalizeIssuer(issuer);

  // Check cache
  const cached = healthCache.get(canonical);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.result, cached: true };
  }

  const checks: HealthResult['checks'] = {
    discovery: 'not_found',
    jwks: 'not_found',
    ed25519_keys: 0,
  };

  // Probe discovery: /.well-known/peac-issuer.json
  let jwksUri: string | undefined;
  const discoveryUrl = `${canonical}/.well-known/peac-issuer.json`;
  const discoveryRes = await ssrfSafeFetch(discoveryUrl);

  if (discoveryRes) {
    if (discoveryRes.ok) {
      try {
        const doc = (await discoveryRes.json()) as { jwks_uri?: string };
        checks.discovery = 'ok';
        jwksUri = doc.jwks_uri;
      } catch {
        checks.discovery = 'fail';
      }
    } else {
      checks.discovery = discoveryRes.status === 404 ? 'not_found' : 'fail';
    }
  } else {
    checks.discovery = 'fail';
  }

  // Probe JWKS if we have a URI (also SSRF-validated)
  if (jwksUri) {
    const jwksRes = await ssrfSafeFetch(jwksUri);
    if (jwksRes) {
      if (jwksRes.ok) {
        try {
          const jwks = (await jwksRes.json()) as { keys?: Array<{ kty?: string; crv?: string }> };
          checks.jwks = 'ok';
          checks.ed25519_keys = (jwks.keys ?? []).filter(
            (k) => k.kty === 'OKP' && k.crv === 'Ed25519'
          ).length;
        } catch {
          checks.jwks = 'fail';
        }
      } else {
        checks.jwks = jwksRes.status === 404 ? 'not_found' : 'fail';
      }
    } else {
      checks.jwks = 'fail';
    }
  }

  const healthy = checks.discovery === 'ok' && checks.jwks === 'ok' && checks.ed25519_keys > 0;

  const result: HealthResult = {
    healthy,
    issuer: canonical,
    checks,
    checked_at: new Date().toISOString(),
    cached: false,
    cache_ttl_seconds: CACHE_TTL_SECONDS,
  };

  healthCache.set(canonical, {
    result,
    expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000,
  });

  return result;
}

export function createIssuerHealthHandler() {
  return async (c: Context) => {
    // Security headers
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Cache-Control', 'no-store');
    c.header('Referrer-Policy', 'no-referrer');

    // Rate limit (independent from verify)
    let ip = '127.0.0.1';
    if (process.env.PEAC_TRUST_PROXY === '1') {
      ip =
        c.req.header('cf-connecting-ip') ??
        c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
        '127.0.0.1';
    }
    const { count, resetAt } = await healthRateLimitStore.increment(
      `health:${ip}`,
      HEALTH_WINDOW_MS
    );
    const remaining = Math.max(0, HEALTH_RATE_LIMIT - count);
    const resetSeconds = Math.ceil((resetAt - Date.now()) / 1000);
    c.header('RateLimit-Limit', String(HEALTH_RATE_LIMIT));
    c.header('RateLimit-Remaining', String(remaining));
    c.header('RateLimit-Reset', String(resetSeconds));

    if (count > HEALTH_RATE_LIMIT) {
      c.header('Retry-After', String(resetSeconds));
      c.header('Content-Type', 'application/problem+json');
      return c.json(toProblemDetails('E_RATE_LIMITED', { retry_after: String(resetSeconds) }), 429);
    }

    // Validate issuer param
    const issuer = c.req.query('issuer');
    if (!issuer) {
      c.header('Content-Type', 'application/problem+json');
      return c.json(toProblemDetails('E_CONSTRAINT_VIOLATION', { count: '1' }), 400);
    }

    const parsed = IssuerParamSchema.safeParse(issuer);
    if (!parsed.success) {
      c.header('Content-Type', 'application/problem+json');
      return c.json(toProblemDetails('E_CONSTRAINT_VIOLATION', { count: '1' }), 400);
    }

    // Probe issuer
    const result = await probeIssuer(parsed.data);
    return c.json(result, 200);
  };
}
