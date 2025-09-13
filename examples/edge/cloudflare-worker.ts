/**
 * PEAC v0.9.13 Cloudflare Worker Reference Implementation
 *
 * One import, one call E2E with x402-first settlement and caching semantics
 * Target: <30ms cold start, <10ms warm path
 *
 * Core orchestration: discover → evaluate → settle → prove
 * Payment rails: x402 (primary), mock settlement for v0.9.13
 * Caching: Allow (300s), Deny (60s), always Vary: PEAC-Receipt
 */

import { enforce, InMemoryNonceCache } from '@peac/core';

export interface Env {
  // Environment variables
  PEAC_PRIVATE_KEY?: string;
  PEAC_KID?: string;
  PEAC_ISSUER?: string;
  PEAC_UPSTREAM_URL?: string;
}

// Global nonce cache (shared across requests in same Worker instance)
const nonceCache = new InMemoryNonceCache(300); // 5 minute TTL

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now();

    try {
      // Extract request info
      const url = new URL(request.url);
      const resource = url.toString();
      const userAgent = request.headers.get('User-Agent') || undefined;
      const purpose = url.searchParams.get('purpose') || undefined;

      // Cache key for policy responses
      const policyKey = `policy:${url.origin}`;
      const denyKey = `deny:${resource}:${purpose || 'none'}`;

      // Check negative cache first (deny responses cached for 60s)
      const cachedDeny = await caches.default.match(`https://cache.local/${denyKey}`);
      if (cachedDeny) {
        const response = cachedDeny.clone();
        response.headers.set('X-PEAC-Cache', 'deny-hit');
        response.headers.set('Vary', 'PEAC-Receipt');
        return response;
      }

      // Check if we already have a PEAC-Receipt (payment completed)
      const existingReceipt = request.headers.get('PEAC-Receipt');
      if (existingReceipt) {
        // TODO: Verify receipt in production
        // For now, trust existing receipt and proxy through
        return proxyWithReceipt(request, env, existingReceipt);
      }

      // Core PEAC orchestration: discover → evaluate → settle → prove
      const result = await enforce(
        resource,
        {
          purpose,
          agent: userAgent,
        },
        {
          issuer: env.PEAC_ISSUER || 'https://worker.example',
          nonceCache,
          allowPrivateIPs: false, // Enforce SSRF protection in edge environment
        }
      );

      const elapsedMs = Date.now() - startTime;

      if (result.allowed) {
        // Cache allow decision for 300s
        const allowResponse = await proxyWithReceipt(request, env, result.receipt!);

        // Set cache headers for allow
        allowResponse.headers.set('Cache-Control', 'public, max-age=300');
        allowResponse.headers.set('Vary', 'PEAC-Receipt');
        allowResponse.headers.set('X-PEAC-Performance', `${elapsedMs}ms`);

        return allowResponse;
      } else {
        // Return Problem+JSON for deny/payment required
        const problemResponse = new Response(JSON.stringify(result.problem, null, 2), {
          status: result.problem?.status || 403,
          headers: {
            'Content-Type': 'application/problem+json',
            'Cache-Control': 'public, max-age=60',
            Vary: 'PEAC-Receipt',
            'X-PEAC-Performance': `${elapsedMs}ms`,
            ...(result.problem?.status === 402 && {
              'WWW-Authenticate': `Bearer realm="x402"`,
              'Accept-Payment': 'x402',
            }),
          },
        });

        // Cache deny response for 60s
        ctx.waitUntil(
          caches.default.put(`https://cache.local/${denyKey}`, problemResponse.clone())
        );

        return problemResponse;
      }
    } catch (error) {
      const elapsedMs = Date.now() - startTime;

      return new Response(
        JSON.stringify(
          {
            type: 'https://datatracker.ietf.org/doc/html/rfc7231#section-6.6.1',
            status: 500,
            title: 'Internal Server Error',
            detail: error instanceof Error ? error.message : 'Unknown error',
            'x-peac-performance': `${elapsedMs}ms`,
          },
          null,
          2
        ),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/problem+json',
            'Cache-Control': 'no-cache',
            Vary: 'PEAC-Receipt',
          },
        }
      );
    }
  },
};

/**
 * Proxy request to upstream with PEAC-Receipt header
 */
async function proxyWithReceipt(request: Request, env: Env, receipt: string): Promise<Response> {
  const upstreamUrl = env.PEAC_UPSTREAM_URL || 'https://httpbin.org/json';

  // Create new request with receipt header
  const proxyRequest = new Request(upstreamUrl, {
    method: request.method,
    headers: {
      ...Object.fromEntries(request.headers.entries()),
      'PEAC-Receipt': receipt,
    },
    body: request.method === 'GET' ? null : request.body,
  });

  try {
    const response = await fetch(proxyRequest);

    // Return response with PEAC receipt in headers for client
    const proxyResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...Object.fromEntries(response.headers.entries()),
        'PEAC-Receipt': receipt,
      },
    });

    return proxyResponse;
  } catch (error) {
    return new Response(
      JSON.stringify(
        {
          type: 'https://datatracker.ietf.org/doc/html/rfc7231#section-6.6.3',
          status: 502,
          title: 'Bad Gateway',
          detail: `Upstream fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
        null,
        2
      ),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/problem+json',
          Vary: 'PEAC-Receipt',
        },
      }
    );
  }
}
