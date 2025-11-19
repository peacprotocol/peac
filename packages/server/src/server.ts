/**
 * PEAC verification server
 * - /verify endpoint with DoS protection
 * - Rate limiting (100/s per IP, 1000/s global)
 * - Circuit breaker for JWKS
 * - Response caching
 */

import { Hono } from "hono";
import { verifyReceipt } from "@peac/protocol";
import { VerifyRequestSchema } from "@peac/schema";
import { rateLimiter } from "./rate-limiter";
import { jwksCircuitBreaker } from "./circuit-breaker";

const app = new Hono();

/**
 * Response cache
 * Maps receipt JWS hash to { response, expiresAt }
 */
const responseCache = new Map<
  string,
  { response: unknown; expiresAt: number; valid: boolean }
>();

/**
 * Cache TTLs
 */
const CACHE_TTL_VALID = 5 * 60 * 1000; // 5 minutes for valid receipts
const CACHE_TTL_INVALID = 1 * 60 * 1000; // 1 minute for invalid receipts

/**
 * Compute simple hash for caching
 */
function hashJws(jws: string): string {
  // Simple hash - use first 16 chars of JWS (enough for cache key)
  return jws.slice(0, 16);
}

// Apply rate limiting globally
app.use("*", rateLimiter());

/**
 * POST /verify - Verify a PEAC receipt
 */
app.post("/verify", async (c) => {
  const startTime = performance.now();

  try {
    // Parse request body
    const body = await c.req.json();

    // Validate request
    const parsed = VerifyRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          type: "https://peacprotocol.org/errors/invalid-request",
          title: "Invalid Request",
          status: 400,
          detail: "Request body validation failed",
          instance: "/verify",
        },
        400,
        {
          "Content-Type": "application/problem+json",
        }
      );
    }

    const { receipt_jws } = parsed.data;

    // Check JWS size (≤16KB)
    if (receipt_jws.length > 16384) {
      return c.json(
        {
          type: "https://peacprotocol.org/errors/jws-too-large",
          title: "JWS Too Large",
          status: 400,
          detail: "JWS must be ≤16KB",
          instance: "/verify",
        },
        400,
        {
          "Content-Type": "application/problem+json",
        }
      );
    }

    // Check cache
    const cacheKey = hashJws(receipt_jws);
    const cached = responseCache.get(cacheKey);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      // Set cache headers
      c.header("Cache-Control", `public, max-age=${Math.floor((cached.expiresAt - now) / 1000)}`);
      c.header("Vary", "PEAC-Receipt");
      c.header("X-Cache", "HIT");

      return c.json(cached.response, 200);
    }

    // Verify receipt with circuit breaker
    let result;
    try {
      result = await jwksCircuitBreaker.execute(() => verifyReceipt(receipt_jws));
    } catch (err) {
      // Circuit breaker open
      if (err instanceof Error && err.message.includes("Circuit breaker is open")) {
        return c.json(
          {
            type: "https://peacprotocol.org/errors/circuit-breaker",
            title: "Service Unavailable",
            status: 503,
            detail: err.message,
            instance: "/verify",
          },
          503,
          {
            "Content-Type": "application/problem+json",
            "Retry-After": "60",
          }
        );
      }

      // Other verification errors
      throw err;
    }

    // Cache the result
    const cacheTtl = result.ok ? CACHE_TTL_VALID : CACHE_TTL_INVALID;
    responseCache.set(cacheKey, {
      response: result,
      expiresAt: now + cacheTtl,
      valid: result.ok,
    });

    // Set cache headers
    c.header("Cache-Control", `public, max-age=${Math.floor(cacheTtl / 1000)}`);
    c.header("Vary", "PEAC-Receipt");
    c.header("X-Cache", "MISS");

    // Check CPU budget (≤50ms)
    const elapsed = performance.now() - startTime;
    if (elapsed > 50) {
      console.warn(`[PERF] Verification took ${elapsed.toFixed(2)}ms (budget: 50ms)`);
    }

    return c.json(result, 200);
  } catch (err) {
    return c.json(
      {
        type: "https://peacprotocol.org/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: err instanceof Error ? err.message : "Unknown error",
        instance: "/verify",
      },
      500,
      {
        "Content-Type": "application/problem+json",
      }
    );
  }
});

/**
 * GET /.well-known/peac.txt - Discovery manifest
 */
app.get("/.well-known/peac.txt", (c) => {
  const manifest = `version: peac/0.9
issuer: https://api.example.com
verify: https://api.example.com/verify
jwks: https://keys.peac.dev/jwks.json
payments:
  - rail: payment_rail_1
  - rail: payment_rail_2`;

  c.header("Cache-Control", "public, max-age=3600");
  c.header("Content-Type", "text/plain; charset=utf-8");

  return c.text(manifest);
});

/**
 * GET /slo - Service Level Objectives metrics
 */
app.get("/slo", (c) => {
  const cbState = jwksCircuitBreaker.getState();

  return c.json({
    circuit_breaker: {
      state: cbState.state,
      failure_count: cbState.failureCount,
      success_count: cbState.successCount,
      opened_at: cbState.openedAt,
    },
    cache: {
      size: responseCache.size,
    },
  });
});

/**
 * GET /health - Health check
 */
app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

export { app };
