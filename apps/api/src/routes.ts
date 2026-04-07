/**
 * API routes for v0.9.13.1 enhanced verifier (deprecated)
 */

import { VerifierV13 } from './verifier.js';

const verifier = new VerifierV13();

/**
 * Centralized deprecation header values for the legacy /verify endpoint.
 * RFC 8594 (Sunset), RFC 8288 (Link rel="deprecation").
 */
const LEGACY_DEPRECATION_HEADERS = {
  Sunset: 'Sat, 01 Nov 2026 00:00:00 GMT',
  Deprecation: 'true',
  Link: '<https://www.peacprotocol.org/docs/migration>; rel="deprecation"',
} as const;

// Express.js route handler
export function createV13ExpressHandler() {
  return async (req: any, res: any) => {
    // Extract observability headers
    const requestId = req.headers['x-request-id'];
    const traceParent = req.headers['traceparent'];

    const result = await verifier.verify(req.body, {
      allowPrivateNet: process.env.PEAC_ALLOW_PRIVATE_NET === 'true',
      timeout: 250, // Total ≤ 250ms per spec
      maxInputSize: 256 * 1024, // 256 KiB
      maxRedirects: 3,
      requestId,
      traceId: traceParent,
    });

    res.status(result.status);

    if (result.status !== 200) {
      res.set('Content-Type', 'application/problem+json');
    } else {
      res.set('Content-Type', 'application/json');
    }

    // Add required security headers
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-store');
    res.set('Vary', 'PEAC-Receipt');
    res.set('Referrer-Policy', 'no-referrer');

    // RFC 8594 deprecation headers
    for (const [k, v] of Object.entries(LEGACY_DEPRECATION_HEADERS)) res.set(k, v);

    res.json(result.body);
  };
}

// Hono route handler
export function createV13HonoHandler() {
  return async (c: any) => {
    // Extract observability headers
    const requestId = c.req.header('x-request-id');
    const traceParent = c.req.header('traceparent');

    const body = await c.req.json();
    const result = await verifier.verify(body, {
      allowPrivateNet: process.env.PEAC_ALLOW_PRIVATE_NET === 'true',
      timeout: 250, // Total ≤ 250ms per spec
      maxInputSize: 256 * 1024,
      maxRedirects: 3,
      requestId,
      traceId: traceParent,
    });

    const headers = {
      'Content-Type': result.status === 200 ? 'application/json' : 'application/problem+json',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      Vary: 'PEAC-Receipt',
      'Referrer-Policy': 'no-referrer',
      // RFC 8594 deprecation headers
      ...LEGACY_DEPRECATION_HEADERS,
    };

    return c.json(result.body, result.status, headers);
  };
}
