/**
 * Security response headers middleware
 *
 * Applied globally so all responses share a consistent posture.
 * Individual routes do not need to set these headers manually.
 */

import type { Context, Next } from 'hono';

export async function securityHeaders(c: Context, next: Next) {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Cache-Control', 'no-store');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}
