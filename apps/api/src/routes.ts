/**
 * API routes for v0.9.13.1 enhanced verifier
 */

import { VerifierV13 } from './verifier.js';

const verifier = new VerifierV13();

// Express.js route handler
export function createV13ExpressHandler() {
  return async (req: any, res: any) => {
    const result = await verifier.verify(req.body, {
      allowPrivateNet: process.env.PEAC_ALLOW_PRIVATE_NET === 'true',
      timeout: 5000,
      maxInputSize: 256 * 1024, // 256 KiB
      maxRedirects: 3,
    });

    res.status(result.status);

    if (result.status !== 200) {
      res.set('Content-Type', 'application/problem+json');
    } else {
      res.set('Content-Type', 'application/json');
    }

    // Add SSRF protection headers
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-store');
    res.set('Vary', 'PEAC-Receipt');

    res.json(result.body);
  };
}

// Hono route handler
export function createV13HonoHandler() {
  return async (c: any) => {
    const body = await c.req.json();
    const result = await verifier.verify(body, {
      allowPrivateNet: process.env.PEAC_ALLOW_PRIVATE_NET === 'true',
      timeout: 5000,
      maxInputSize: 256 * 1024,
      maxRedirects: 3,
    });

    const headers = {
      'Content-Type': result.status === 200 ? 'application/json' : 'application/problem+json',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      Vary: 'PEAC-Receipt',
    };

    return c.json(result.body, result.status, headers);
  };
}
