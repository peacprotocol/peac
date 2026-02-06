import type { Context } from 'hono';

export function healthHandler(c: Context) {
  return c.json({ status: 'ok', service: '@peac/app-sandbox-issuer' });
}
