/**
 * In-memory sliding window rate limiter
 *
 * 1000 requests per hour per IP. Resets on window expiry.
 * Stateless (resets on process restart) -- acceptable for sandbox.
 */

import type { Context, Next } from 'hono';

const MAX_REQUESTS = 1000;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface RateEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateEntry>();

function getClientIp(c: Context): string {
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'
  );
}

export async function rateLimitMiddleware(c: Context, next: Next) {
  const ip = getClientIp(c);
  const now = Date.now();
  let entry = store.get(ip);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    store.set(ip, entry);
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    c.header('Retry-After', String(retryAfter));
    return c.json(
      {
        type: 'https://www.peacprotocol.org/errors/rate_limited',
        title: 'Rate Limited',
        status: 429,
        detail: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
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
