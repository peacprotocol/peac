/**
 * Receipt issuance endpoint
 *
 * POST /api/v1/issue
 *
 * Strict whitelist schema: server computes iss, iat, jti, kind, type.
 * No arbitrary claims passthrough (prevents receipt minting oracle).
 *
 * Issues current Wire records via @peac/protocol.issue(), which validates
 * Wire 0.2 claims against the canonical schema before signing. The sandbox
 * uses an example custom type URI (org.example/sandbox-test); registry-aware
 * verification will surface a type_unregistered warning, which is informational.
 */

import type { Context } from 'hono';
import { issue } from '@peac/protocol';
import { resolveKeys } from '../keys.js';
import { IssueRequestSchema, MAX_BODY_SIZE } from '../schemas.js';
import { resolveIssuerUrl } from '../config.js';

const SANDBOX_TYPE = 'org.example/sandbox-test' as const;

export async function issueHandler(c: Context) {
  // Content-Length pre-check (fast reject before reading body)
  const contentLength = c.req.header('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return c.json(
      {
        type: 'https://www.peacprotocol.org/errors/request_too_large',
        title: 'Request Too Large',
        status: 413,
        detail: `Request body exceeds ${MAX_BODY_SIZE} byte limit`,
      },
      413
    );
  }

  // Hard body read limit (enforce actual bytes, not just header)
  let rawBody: string;
  try {
    rawBody = await c.req.text();
  } catch {
    return c.json(
      {
        type: 'https://www.peacprotocol.org/errors/invalid_request',
        title: 'Invalid Request',
        status: 400,
        detail: 'Failed to read request body',
      },
      400
    );
  }

  if (new TextEncoder().encode(rawBody).length > MAX_BODY_SIZE) {
    return c.json(
      {
        type: 'https://www.peacprotocol.org/errors/request_too_large',
        title: 'Request Too Large',
        status: 413,
        detail: `Request body exceeds ${MAX_BODY_SIZE} byte limit`,
      },
      413
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.json(
      {
        type: 'https://www.peacprotocol.org/errors/invalid_request',
        title: 'Invalid Request',
        status: 400,
        detail: 'Request body must be valid JSON',
      },
      400
    );
  }

  // Pre-parse explicit rejection of expires_in to guide migrations from Wire 0.1.
  // Generic strict-schema 422 for unknown keys is also fine for other legacy fields.
  if (typeof body === 'object' && body !== null && 'expires_in' in body) {
    return c.json(
      {
        type: 'https://www.peacprotocol.org/errors/validation_error',
        title: 'Validation Error',
        status: 422,
        detail: 'expires_in is not supported for current Wire records',
      },
      422
    );
  }

  const parsed = IssueRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    return c.json(
      {
        type: 'https://www.peacprotocol.org/errors/validation_error',
        title: 'Validation Error',
        status: 422,
        detail: issues.join('; '),
      },
      422
    );
  }

  const { sub, purpose } = parsed.data;
  const issuerUrl = resolveIssuerUrl(c);
  const keys = await resolveKeys();

  // Generate jti up-front so the response surfaces it stably as receipt_id.
  // Wire02ClaimsSchema accepts any 1-256 char string for jti; randomUUID is sufficient.
  const jti = crypto.randomUUID();

  // Validated current-Wire issuance via @peac/protocol.issue(). The function
  // validates Wire02ClaimsSchema before signing, so the sandbox cannot mint
  // structurally invalid records. Issuance errors (e.g., a non-canonical iss
  // URL when PEAC_ISSUER_URL is unset and the request origin is non-https)
  // are surfaced as Problem Details rather than bare 500s.
  let receipt: string;
  try {
    const result = await issue({
      iss: issuerUrl,
      kind: 'evidence',
      type: SANDBOX_TYPE,
      sub,
      jti,
      ...(purpose ? { purpose_declared: purpose } : {}),
      privateKey: keys.privateKey,
      kid: keys.kid,
    });
    receipt = result.jws;
  } catch (err) {
    // Known PEAC IssueError carries a structured peacError with http_status.
    // Client-class errors (4xx) surface as Problem Details with the inner
    // message; the message is the schema/canonical-form description and is
    // safe to expose. Server-class or unknown errors return a generic 500
    // without leaking err.message (which could include internal paths).
    if (err && typeof err === 'object' && 'peacError' in err) {
      const peacError = (err as { peacError?: { http_status?: number } }).peacError;
      const httpStatus = peacError?.http_status;
      if (typeof httpStatus === 'number' && httpStatus >= 400 && httpStatus < 500) {
        const detail =
          err instanceof Error && typeof err.message === 'string' && err.message.length > 0
            ? err.message
            : 'Issuance validation failed';
        return c.json(
          {
            type: 'https://www.peacprotocol.org/errors/validation_error',
            title: 'Validation Error',
            status: httpStatus,
            detail,
          },
          httpStatus as 400
        );
      }
    }
    return c.json(
      {
        type: 'https://www.peacprotocol.org/errors/issuance_error',
        title: 'Issuance Error',
        status: 500,
        detail: 'Internal issuance failure',
      },
      500
    );
  }

  return c.json({
    receipt,
    receipt_id: jti,
    issuer: issuerUrl,
    key_id: keys.kid,
  });
}
