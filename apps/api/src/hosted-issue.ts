/**
 * POST /v1/issue (provisional, disabled by default)
 *
 * Hosted Issue alpha: sensitive-key transit model. Caller provides Ed25519
 * private key seed in the request body. The server signs in memory and does
 * not persist key material, but key seed transits the server over transport.
 *
 * DISABLED BY DEFAULT. Enable via PEAC_HOSTED_ISSUE=true.
 * Intended only for tightly controlled environments.
 *
 * Shares rate limiters and error infrastructure with /v1/verify.
 */

import type { Context } from 'hono';
import { z } from 'zod';
import { issueWire02, IssueError } from '@peac/protocol';
import { base64urlDecode } from '@peac/crypto';
import { computeReceiptRef } from '@peac/schema';
import { toProblemDetails, type HostedProblemDetails } from './error-catalog.js';

const PROBLEM_CONTENT_TYPE = 'application/problem+json';
const MAX_BODY_SIZE = 256 * 1024; // 256 KB

const IssueRequestSchema = z
  .object({
    claims: z
      .object({
        iss: z.string().min(1),
        kind: z.enum(['evidence', 'challenge']),
        type: z.string().min(1),
        sub: z.string().optional(),
        pillars: z.array(z.string()).optional(),
        ext: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
    key_id: z.string().min(1).max(256),
    private_key_seed: z.string().min(1),
  })
  .strict();

function deterministicStringify(obj: unknown): string {
  return JSON.stringify(obj, (_key, value) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      );
    }
    return value;
  });
}

function problemResponse(c: Context, problem: HostedProblemDetails): Response {
  c.header('Content-Type', PROBLEM_CONTENT_TYPE);
  return c.body(deterministicStringify(problem), problem.status as any);
}

export function createIssueV1Handler() {
  // DISABLED BY DEFAULT: sensitive-key transit model
  const enabled = process.env.PEAC_HOSTED_ISSUE === 'true';

  return async (c: Context) => {
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Cache-Control', 'no-store');
    c.header('Referrer-Policy', 'no-referrer');

    if (!enabled) {
      return problemResponse(c, {
        type: 'https://www.peacprotocol.org/problems/not-found',
        title: 'Not Found',
        status: 404,
        detail:
          'Hosted Issue is disabled. Set PEAC_HOSTED_ISSUE=true to enable (sensitive-key transit model).',
        peac_error_code: 'E_NOT_FOUND',
      });
    }

    // Body size enforcement before parsing
    const contentLength = c.req.header('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return problemResponse(
        c,
        toProblemDetails('E_PAYLOAD_TOO_LARGE', { limit: String(MAX_BODY_SIZE) })
      );
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return problemResponse(c, toProblemDetails('E_INVALID_FORMAT'));
    }

    const parsed = IssueRequestSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => ({
        pointer: `/${i.path.join('/')}`,
        detail: i.message,
      }));
      const problem = toProblemDetails('E_CONSTRAINT_VIOLATION', {
        count: String(errors.length),
      });
      problem.errors = errors;
      return problemResponse(c, problem);
    }

    const { claims, key_id, private_key_seed } = parsed.data;

    // Decode Ed25519 private key seed (exactly 32 bytes)
    let seedBytes: Uint8Array;
    try {
      seedBytes = base64urlDecode(private_key_seed);
      if (seedBytes.length !== 32) {
        return problemResponse(c, toProblemDetails('E_CONSTRAINT_VIOLATION', { count: '1' }));
      }
    } catch {
      return problemResponse(c, toProblemDetails('E_CONSTRAINT_VIOLATION', { count: '1' }));
    }

    // Issue the interaction record via canonical protocol layer
    try {
      const result = await issueWire02({
        iss: claims.iss,
        kind: claims.kind,
        type: claims.type,
        sub: claims.sub,
        pillars: claims.pillars as any,
        extensions: claims.ext as any,
        privateKey: seedBytes,
        kid: key_id,
      });

      const receiptRef = await computeReceiptRef(result.jws);

      // Clear seed bytes from memory (best-effort)
      seedBytes.fill(0);

      c.header('Content-Type', 'application/json');
      return c.body(deterministicStringify({ receipt: result.jws, receipt_ref: receiptRef }), 201);
    } catch (err) {
      // Clear seed bytes on error path too
      seedBytes.fill(0);

      // Map canonical IssueError codes to RFC 9457
      if (err instanceof IssueError) {
        const code = err.peacError?.code || 'E_CONSTRAINT_VIOLATION';
        return problemResponse(c, toProblemDetails(code, {}));
      }
      return problemResponse(c, toProblemDetails('E_CONSTRAINT_VIOLATION', { count: '1' }));
    }
  };
}
