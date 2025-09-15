/**
 * API routes for v0.9.13.1 enhanced verifier
 */

import { VerifierV13 } from './verifier.js';

const verifier = new VerifierV13();

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
    };

    return c.json(result.body, result.status, headers);
  };
}
