/**
 * POST /api/v1/verify
 *
 * Receipt verification with allowlisted issuer JWKS resolution.
 *
 * Flow:
 * 1. Parse receipt (untrusted) to extract iss, kid
 * 2. Resolve public key via allowlisted issuer -> JWKS cache
 * 3. Verify signature + schema via verifyLocal()
 * 4. Return result with RFC 9457 Problem Details for errors
 *
 * Supports two modes:
 * - public_key provided: verify directly (no JWKS fetch, no SSRF)
 * - public_key omitted: resolve key from allowlisted issuers via JWKS
 */

import type { Context } from 'hono';
import { z } from 'zod';
import { verifyLocal } from '@peac/protocol';
import { decode, base64urlDecode, jwkToPublicKeyBytes } from '@peac/crypto';
import { InMemoryCache, resolveKey, type CacheBackend } from '@peac/jwks-cache';
import { ProblemError } from './errors.js';

const MAX_BODY_SIZE = 256 * 1024; // 256 KB
const PROBLEM_CONTENT_TYPE = 'application/problem+json';

const VerifyRequestSchema = z
  .object({
    /** JWS compact serialization of the receipt */
    receipt: z.string().min(1).max(MAX_BODY_SIZE),

    /** Optional: Ed25519 public key as base64url-encoded string */
    public_key: z.string().min(1).optional(),

    /** Optional verification constraints */
    options: z
      .object({
        issuer: z.string().url().optional(),
        audience: z.string().url().optional(),
        require_exp: z.boolean().optional(),
        max_clock_skew: z.number().int().positive().max(3600).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Trusted issuer entry schema -- validated at boot */
const TrustedIssuerSchema = z.object({
  issuer: z.string().url(),
  jwks_uri: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://'), { message: 'jwks_uri must use HTTPS' }),
});

type TrustedIssuerEntry = z.infer<typeof TrustedIssuerSchema>;

function loadTrustedIssuers(): TrustedIssuerEntry[] {
  const raw = process.env.PEAC_TRUSTED_ISSUERS_JSON;
  if (!raw) {
    // Default: trust the sandbox issuer
    return [
      {
        issuer: 'https://sandbox.peacprotocol.org',
        jwks_uri: 'https://sandbox.peacprotocol.org/.well-known/jwks.json',
      },
    ];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `PEAC_TRUSTED_ISSUERS_JSON is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('PEAC_TRUSTED_ISSUERS_JSON must be a non-empty JSON array');
  }

  return parsed.map((entry, i) => {
    const result = TrustedIssuerSchema.safeParse(entry);
    if (!result.success) {
      const issues = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new Error(`PEAC_TRUSTED_ISSUERS_JSON[${i}] invalid: ${issues.join('; ')}`);
    }
    return result.data;
  });
}

/** Rate limit store: key -> { count, resetAt } */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const ANON_LIMIT = 100;
const API_KEY_LIMIT = 1000;
const WINDOW_MS = 60 * 1000; // 1 minute

function getRateLimit(c: Context): { key: string; limit: number } {
  const apiKey = c.req.header('x-api-key');
  if (apiKey) return { key: `key:${apiKey}`, limit: API_KEY_LIMIT };

  // Only trust forwarded IP headers behind a known reverse proxy
  let ip = '127.0.0.1';
  if (process.env.PEAC_TRUST_PROXY === '1') {
    ip =
      c.req.header('cf-connecting-ip') ??
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      '127.0.0.1';
  }
  return { key: `ip:${ip}`, limit: ANON_LIMIT };
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
  retryAfter?: number;
}

function checkRateLimit(key: string, limit: number): RateLimitResult {
  const now = Date.now();
  let entry = rateLimitStore.get(key);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    rateLimitStore.set(key, entry);
  }

  entry.count++;
  const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);
  const remaining = Math.max(0, limit - entry.count);

  if (entry.count > limit) {
    return { allowed: false, remaining: 0, resetSeconds, retryAfter: resetSeconds };
  }
  return { allowed: true, remaining, resetSeconds };
}

/** Emit RFC 9333 RateLimit-* headers on every response */
function setRateLimitHeaders(c: Context, limit: number, result: RateLimitResult): void {
  c.header('RateLimit-Limit', String(limit));
  c.header('RateLimit-Remaining', String(result.remaining));
  c.header('RateLimit-Reset', String(result.resetSeconds));
}

/** JWKS cache (shared across requests) */
const jwksCache: CacheBackend = new InMemoryCache();

export function createVerifyV1Handler() {
  const trustedIssuers = loadTrustedIssuers();

  return async (c: Context) => {
    // Security headers on all responses (including errors)
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Cache-Control', 'no-store');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Frame-Options', 'DENY');

    // Rate limit with Retry-After + RFC 9333 RateLimit-* headers
    const rl = getRateLimit(c);
    const check = checkRateLimit(rl.key, rl.limit);
    setRateLimitHeaders(c, rl.limit, check);
    if (!check.allowed) {
      c.header('Retry-After', String(check.retryAfter));
      c.header('Content-Type', PROBLEM_CONTENT_TYPE);
      return c.body(
        JSON.stringify({
          type: 'https://www.peacprotocol.org/problems/rate-limited',
          title: 'Rate Limited',
          status: 429,
          detail: `Rate limit exceeded. Try again in ${check.retryAfter} seconds.`,
        }),
        429
      );
    }

    // Body size check
    const contentLength = c.req.header('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      c.header('Content-Type', PROBLEM_CONTENT_TYPE);
      return c.body(
        JSON.stringify({
          type: 'https://www.peacprotocol.org/problems/request-too-large',
          title: 'Request Too Large',
          status: 413,
          detail: `Request body exceeds ${MAX_BODY_SIZE} byte limit`,
        }),
        413
      );
    }

    // Parse JSON
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new ProblemError(
        400,
        'https://www.peacprotocol.org/problems/invalid-request',
        'Invalid Request',
        'Request body must be valid JSON'
      );
    }

    // Validate schema
    const parsed = VerifyRequestSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      throw new ProblemError(
        422,
        'https://www.peacprotocol.org/problems/schema-validation-failed',
        'Validation Error',
        issues.join('; ')
      );
    }

    const { receipt, public_key, options } = parsed.data;

    // Resolve public key
    let publicKeyBytes: Uint8Array;

    if (public_key) {
      // Mode A: caller-provided key (no JWKS fetch, no SSRF)
      try {
        publicKeyBytes = base64urlDecode(public_key);
        if (publicKeyBytes.length !== 32) {
          throw new Error('Expected 32-byte Ed25519 public key');
        }
      } catch (err) {
        throw new ProblemError(
          422,
          'https://www.peacprotocol.org/problems/invalid-request',
          'Invalid Public Key',
          `Could not decode public key: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else {
      // Mode B: resolve key from allowlisted issuer JWKS
      let header: { kid?: string };
      let payload: { iss?: string };
      try {
        const decoded = decode<{ iss?: string }>(receipt);
        header = decoded.header as { kid?: string };
        payload = decoded.payload;
      } catch {
        throw new ProblemError(
          400,
          'https://www.peacprotocol.org/problems/invalid-jws-format',
          'Invalid JWS Format',
          'Could not decode receipt header and payload'
        );
      }

      const iss = payload.iss;
      const kid = header.kid;
      if (!iss || !kid) {
        throw new ProblemError(
          422,
          'https://www.peacprotocol.org/problems/invalid-request',
          'Missing Issuer or Key ID',
          'Receipt must contain iss claim and kid header for JWKS resolution'
        );
      }

      // Check issuer allowlist (prevents SSRF)
      const trustedEntry = trustedIssuers.find((t) => t.issuer === iss);
      if (!trustedEntry) {
        throw new ProblemError(
          422,
          'https://www.peacprotocol.org/problems/unknown-key-id',
          'Untrusted Issuer',
          `Issuer "${iss}" is not in the trusted issuers allowlist`
        );
      }

      // Resolve key via jwks-cache (HTTPS-only, short timeouts)
      try {
        const resolved = await resolveKey(iss, kid, {
          cache: jwksCache,
          fetchTimeoutMs: 5000,
          connectTimeoutMs: 2000,
          cacheTtlSeconds: 600, // 10 min
        });
        publicKeyBytes = jwkToPublicKeyBytes(resolved.jwk);
      } catch (err) {
        throw new ProblemError(
          422,
          'https://www.peacprotocol.org/problems/unknown-key-id',
          'Key Resolution Failed',
          `Could not resolve key ${kid} from ${iss}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // Verify
    const result = await verifyLocal(receipt, publicKeyBytes, {
      issuer: options?.issuer,
      audience: options?.audience,
      requireExp: options?.require_exp,
      maxClockSkew: options?.max_clock_skew,
    });

    if (result.valid) {
      return c.json({
        valid: true,
        claims: result.claims,
        kid: result.kid,
      });
    }

    // Verification failed -- return structured result (not an HTTP error)
    return c.json(
      {
        valid: false,
        code: result.code,
        message: result.message,
      },
      200
    );
  };
}

/** Reset rate limit store (for testing) */
export function resetVerifyV1RateLimit(): void {
  rateLimitStore.clear();
}
