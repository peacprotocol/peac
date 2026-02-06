/**
 * CORS middleware for discovery and JWKS endpoints
 *
 * Allows cross-origin access so the browser verifier can fetch
 * issuer config and public keys from the sandbox issuer domain.
 */

import type { Context, Next } from 'hono';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export async function corsMiddleware(c: Context, next: Next) {
  if (c.req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  await next();

  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    c.header(key, value);
  }
}
