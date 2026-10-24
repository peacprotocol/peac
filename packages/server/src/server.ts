/**
 * PEAC verification server
 * - /verify endpoint with a request-size limit enforced before the body is parsed
 * - Rate limiting (100/s per IP, 1000/s global)
 * - Circuit breaker for JWKS
 * - Verification results are not cached; issuer key material is cached by the JWKS resolver
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { verifyReceipt } from '@peac/protocol';
import { VerifyRequestSchema } from '@peac/schema';
import { rateLimiter } from './rate-limiter';
import { jwksCircuitBreaker } from './circuit-breaker';

const app = new Hono();

/** Maximum compact JWS length accepted by /verify, in characters (a compact JWS is ASCII). */
const MAX_RECEIPT_JWS_LENGTH = 16_384;

/**
 * Maximum /verify request body size in bytes, enforced before the body is parsed: a declared
 * Content-Length over the limit is rejected before any read, and a streamed body is read only
 * up to the limit. The body is one JSON member holding the compact JWS, so twice the JWS limit is ample.
 */
const MAX_VERIFY_BODY_BYTES = 32 * 1024;

type ProblemStatus = 400 | 413 | 500 | 503;

function problem(
  c: Context,
  status: ProblemStatus,
  slug: string,
  title: string,
  detail: string,
  headers: Record<string, string> = {}
): Response {
  return c.json(
    {
      type: `https://www.peacprotocol.org/errors/${slug}`,
      title,
      status,
      detail,
      instance: '/verify',
    },
    status,
    { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store', ...headers }
  );
}

// Apply rate limiting globally
app.use('*', rateLimiter());

/**
 * POST /verify - Verify a PEAC receipt
 */
app.post(
  '/verify',
  bodyLimit({
    maxSize: MAX_VERIFY_BODY_BYTES,
    onError: (c) =>
      problem(
        c,
        413,
        'payload-too-large',
        'Content Too Large',
        `Request body exceeds ${MAX_VERIFY_BODY_BYTES} bytes`
      ),
  }),
  async (c) => {
    const startTime = performance.now();

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return problem(
        c,
        400,
        'invalid-request',
        'Invalid Request',
        'Request body is not valid JSON'
      );
    }

    try {
      const parsed = VerifyRequestSchema.safeParse(body);
      if (!parsed.success) {
        return problem(
          c,
          400,
          'invalid-request',
          'Invalid Request',
          'Request body validation failed'
        );
      }

      const { receipt_jws } = parsed.data;
      if (receipt_jws.length > MAX_RECEIPT_JWS_LENGTH) {
        return problem(
          c,
          400,
          'jws-too-large',
          'JWS Too Large',
          `JWS must be at most ${MAX_RECEIPT_JWS_LENGTH} characters`
        );
      }

      // Results are never reused across requests: a result is bound to the exact receipt,
      // the issuer keys at verification time and the evaluation time.
      let result;
      try {
        result = await jwksCircuitBreaker.execute(() => verifyReceipt(receipt_jws));
      } catch (err) {
        if (err instanceof Error && err.message.includes('Circuit breaker is open')) {
          return problem(
            c,
            503,
            'circuit-breaker',
            'Service Unavailable',
            'Verification is temporarily unavailable',
            {
              'Retry-After': '60',
            }
          );
        }
        throw err;
      }

      // Check CPU budget (50ms)
      const elapsed = performance.now() - startTime;
      if (elapsed > 50) {
        console.warn(`[PERF] Verification took ${elapsed.toFixed(2)}ms (budget: 50ms)`);
      }

      c.header('Cache-Control', 'no-store');
      return c.json(result, 200);
    } catch {
      return problem(
        c,
        500,
        'internal-error',
        'Internal Server Error',
        'Verification could not be completed'
      );
    }
  }
);

/**
 * GET /.well-known/peac.txt - `peac-policy/0.1` policy document.
 *
 * peac.txt is the policy-document surface per docs/specs/PEAC-TXT.md.
 * Key discovery flows through /.well-known/peac-issuer.json -> jwks_uri ->
 * JWKS (served at /.well-known/peac-issuer.json, not this path).
 */
app.get('/.well-known/peac.txt', (c) => {
  const manifest =
    `version: 'peac-policy/0.1'\n` +
    `name: Example PEAC Policy\n` +
    `defaults:\n` +
    `  decision: deny\n` +
    `  reason: 'No matching rule'\n` +
    `rules:\n` +
    `  - name: allow-verified-agents-inference\n` +
    `    subject:\n` +
    `      type: agent\n` +
    `      labels: [verified]\n` +
    `    purpose: inference\n` +
    `    decision: allow\n` +
    `    reason: 'Verified agents may run inference'\n`;

  c.header('Cache-Control', 'public, max-age=3600');
  c.header('Content-Type', 'text/yaml; charset=utf-8');

  return c.text(manifest);
});

/**
 * GET /slo - Service Level Objectives metrics
 */
app.get('/slo', (c) => {
  const cbState = jwksCircuitBreaker.getState();

  return c.json({
    circuit_breaker: {
      state: cbState.state,
      failure_count: cbState.failureCount,
      success_count: cbState.successCount,
      opened_at: cbState.openedAt,
    },
  });
});

/**
 * GET /health - Health check
 */
app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

export { app };
