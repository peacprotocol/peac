/**
 * In-memory sliding window rate limiter
 *
 * 1000 requests per hour per IP. Resets on window expiry.
 * Uses bounded MemoryRateLimitStore (LRU eviction at 10k keys).
 * Stateless (resets on process restart) -- acceptable for sandbox.
 */

import type { Context, Next } from 'hono';
import { MemoryRateLimitStore } from '@peac/middleware-core';

const MAX_REQUESTS = 1000;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

const store = new MemoryRateLimitStore({ maxKeys: 10_000 });

function getClientIp(c: Context): string {
  // Only trust forwarded headers when running behind a known reverse proxy
  if (process.env.PEAC_TRUST_PROXY === '1') {
    const forwarded =
      c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
  }
  return '127.0.0.1';
}

export async function rateLimitMiddleware(c: Context, next: Next) {
  const ip = getClientIp(c);
  const { count, resetAt } = await store.increment(ip, WINDOW_MS);

  const now = Date.now();
  const resetSeconds = Math.ceil((resetAt - now) / 1000);
  const remaining = Math.max(0, MAX_REQUESTS - count);

  // RFC 9333 RateLimit-* headers on all responses
  c.header('RateLimit-Limit', String(MAX_REQUESTS));
  c.header('RateLimit-Remaining', String(remaining));
  c.header('RateLimit-Reset', String(resetSeconds));

  if (count > MAX_REQUESTS) {
    c.header('Retry-After', String(resetSeconds));
    return c.json(
      {
        type: 'https://www.peacprotocol.org/errors/rate_limited',
        title: 'Rate Limited',
        status: 429,
        detail: `Rate limit exceeded. Try again in ${resetSeconds} seconds.`,
      },
      429
    );
  }

  await next();
}

/** Reset store (for testing) */
export function resetRateLimitStore(): void {
  store.clear();
}
