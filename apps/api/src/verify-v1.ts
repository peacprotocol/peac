/**
 * POST /api/v1/verify
 *
 * Stateless receipt verification endpoint. Accepts a JWS receipt
 * and a public key, verifies locally. No JWKS discovery.
 * RFC 9457 Problem Details for all errors.
 */

import type { Context } from 'hono';
import { z } from 'zod';
import { verifyLocal } from '@peac/protocol';
import { base64urlDecode } from '@peac/crypto';
import { ProblemError } from './errors.js';

const MAX_BODY_SIZE = 256 * 1024; // 256 KB

const VerifyRequestSchema = z
  .object({
    /** JWS compact serialization of the receipt */
    receipt: z.string().min(1).max(MAX_BODY_SIZE),

    /** Ed25519 public key as base64url-encoded string */
    public_key: z.string().min(1),

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

/** Rate limit store: IP -> { count, resetAt } */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const ANON_LIMIT = 100;
const ANON_WINDOW_MS = 60 * 1000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let entry = rateLimitStore.get(ip);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + ANON_WINDOW_MS };
    rateLimitStore.set(ip, entry);
  }

  entry.count++;
  return entry.count <= ANON_LIMIT;
}

function getClientIp(c: Context): string {
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'
  );
}

export function createVerifyV1Handler() {
  return async (c: Context) => {
    // Rate limit
    const ip = getClientIp(c);
    if (!checkRateLimit(ip)) {
      throw new ProblemError(
        429,
        'https://www.peacprotocol.org/problems/rate-limited',
        'Rate Limited',
        'Too many requests. Try again later.'
      );
    }

    // Body size check
    const contentLength = c.req.header('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      throw new ProblemError(
        413,
        'https://www.peacprotocol.org/problems/request-too-large',
        'Request Too Large',
        `Request body exceeds ${MAX_BODY_SIZE} byte limit`
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

    // Decode public key
    let publicKeyBytes: Uint8Array;
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

    // Verify
    const result = await verifyLocal(receipt, publicKeyBytes, {
      issuer: options?.issuer,
      audience: options?.audience,
      requireExp: options?.require_exp,
      maxClockSkew: options?.max_clock_skew,
    });

    if (result.valid) {
      c.header('X-Content-Type-Options', 'nosniff');
      c.header('Cache-Control', 'no-store');
      return c.json({
        valid: true,
        claims: result.claims,
        kid: result.kid,
      });
    }

    // Verification failed -- return structured error
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Cache-Control', 'no-store');
    return c.json(
      {
        valid: false,
        code: result.code,
        message: result.message,
      },
      200 // Verification failure is not an HTTP error
    );
  };
}

/** Reset rate limit store (for testing) */
export function resetVerifyV1RateLimit(): void {
  rateLimitStore.clear();
}
