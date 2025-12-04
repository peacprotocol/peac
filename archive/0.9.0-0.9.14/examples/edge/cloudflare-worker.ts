/**
 * PEAC v0.9.13 Cloudflare Worker Reference Implementation
 *
 * One import, one call E2E with x402-first settlement and caching semantics
 * Target: <30ms cold start, <10ms warm path
 *
 * Core orchestration: discover → evaluate → settle → prove
 * Payment rails: x402 (primary), mock settlement for v0.9.13
 * Caching: Allow (300s), Deny (60s), always Vary: PEAC-Receipt
 *
 * @deprecated This example uses @peac/core which is deprecated. See v0.9.15+ examples.
 */

// Cloudflare Worker runtime types (not available in Node.js)
interface CloudflareCache {
  match(request: Request | string): Promise<Response | undefined>;
  put(request: Request | string, response: Response): Promise<void>;
}
declare const caches: { default: CloudflareCache };
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// @ts-expect-error Legacy import - @peac/core is deprecated, use @peac/protocol
import { enforce, InMemoryNonceCache, verify } from '@peac/core';

export interface Env {
  // Environment variables
  PEAC_PRIVATE_KEY?: string;
  PEAC_KID?: string;
  PEAC_ISSUER?: string;
  PEAC_UPSTREAM_URL?: string;
}

// Global nonce cache (shared across requests in same Worker instance)
const nonceCache = new InMemoryNonceCache(300); // 5 minute TTL

/**
 * Cached fetch wrapper for policy discovery inputs
 * Caches AIPREF, agent-permissions, and peac.txt for 300s by ETag
 */
async function cachedPolicyFetch(url: string, ctx: ExecutionContext): Promise<Response> {
  const cacheKey = new Request(`https://cache.local/policy:${url}`);
  const cache = caches.default;

  // Check cache first
  const cached = await cache.match(cacheKey);
  if (cached) {
    const age = cached.headers.get('Age');
    if (age && parseInt(age) < 300) {
      cached.headers.set('Cache-Status', 'peac; hit');
      return cached;
    }
  }

  // Fetch fresh
  const response = await fetch(url);
  if (response.ok) {
    const toCache = response.clone();
    toCache.headers.set('Cache-Control', 'public, max-age=300');
    toCache.headers.set('Age', '0');
    ctx.waitUntil(cache.put(cacheKey, toCache));
  }

  return response;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now();

    try {
      // Extract request info
      const url = new URL(request.url);
      const resource = url.toString();
      const userAgent = request.headers.get('User-Agent') || undefined;
      const purpose = url.searchParams.get('purpose') || undefined;

      // Cache key for deny responses
      const denyKey = `deny:${resource}:${purpose || 'none'}`;
      const allowKey = `allow:${resource}:${purpose || 'none'}`;

      // Check negative cache first (deny responses cached for 60s)
      const cachedDeny = await caches.default.match(`https://cache.local/${denyKey}`);
      if (cachedDeny) {
        const response = cachedDeny.clone();
        response.headers.set('Cache-Status', 'peac; hit; detail="deny"');
        response.headers.set('Vary', 'PEAC-Receipt');
        return response;
      }

      // Check if we already have a PEAC-Receipt (payment completed)
      const existingReceipt = request.headers.get('PEAC-Receipt');
      if (existingReceipt) {
        // Verify the receipt
        try {
          const verifyResult = await verify(existingReceipt, {
            resource,
            nonceCache,
          });

          if (verifyResult.valid) {
            return proxyWithReceipt(request, env, existingReceipt);
          }
        } catch (error) {
          // Invalid or expired receipt
          return new Response(
            JSON.stringify(
              {
                type: 'https://datatracker.ietf.org/doc/html/rfc7231#section-6.5.3',
                status: 403,
                title: 'Forbidden',
                detail: 'Invalid or expired PEAC-Receipt',
              },
              null,
              2
            ),
            {
              status: 403,
              headers: {
                'Content-Type': 'application/problem+json',
                'Server-Timing': `peac;dur=${Date.now() - startTime}`,
                Vary: 'PEAC-Receipt',
              },
            }
          );
        }
      }

      // Core PEAC orchestration with cached policy fetching
      // Note: Future enhancement - inject cachedPolicyFetch into enforce() for policy caching
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
          kid: env.PEAC_KID || 'dev-key-1',
        }
      );

      const elapsedMs = Date.now() - startTime;

      if (result.allowed) {
        // Cache allow decision for 300s
        const allowResponse = new Response('Access granted', {
          status: 200,
          headers: {
            'PEAC-Receipt': result.receipt || '',
            'Cache-Control': 'public, max-age=300',
            Vary: 'PEAC-Receipt',
            'Server-Timing': `peac;dur=${elapsedMs}`,
          },
        });

        // Store in cache for future requests
        ctx.waitUntil(caches.default.put(`https://cache.local/${allowKey}`, allowResponse.clone()));

        // Proxy to upstream if configured
        if (env.PEAC_UPSTREAM_URL) {
          return proxyWithReceipt(request, env, result.receipt || '');
        }

        return allowResponse;
      } else {
        // Payment required or access denied
        const elapsedMs = Date.now() - startTime;
        const problemResponse = new Response(JSON.stringify(result.problem, null, 2), {
          status: result.problem?.status || 403,
          headers: {
            'Content-Type': 'application/problem+json',
            'Cache-Control': 'public, max-age=60',
            Vary: 'PEAC-Receipt',
            'Server-Timing': `peac;dur=${elapsedMs}`,
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
            type: 'https://datatracker.ietf.org/doc/html/rfc9110#section-15.6.1',
            status: 500,
            title: 'Internal Server Error',
            detail: error instanceof Error ? error.message : 'Unknown error',
          },
          null,
          2
        ),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/problem+json',
            'Server-Timing': `peac;dur=${elapsedMs}`,
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
  if (!env.PEAC_UPSTREAM_URL) {
    return new Response('No upstream configured', { status: 200 });
  }

  const upstreamRequest = new Request(env.PEAC_UPSTREAM_URL, {
    method: request.method,
    headers: {
      ...Object.fromEntries(request.headers.entries()),
      'PEAC-Receipt': receipt,
    },
    body: request.body,
  });

  return fetch(upstreamRequest);
}
