/**
 * Receipt issuance endpoint
 *
 * POST /api/v1/issue
 *
 * Strict whitelist schema -- server computes iss, iat, exp, rid.
 * No arbitrary claims passthrough (prevents receipt minting oracle).
 */

import type { Context } from 'hono';
import { sign } from '@peac/crypto';
import { resolveKeys } from '../keys.js';
import { IssueRequestSchema, MAX_BODY_SIZE } from '../schemas.js';

const ISSUER_URL = 'https://sandbox.peacprotocol.org';

export async function issueHandler(c: Context) {
  // Body size check
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

  // Parse and validate
  let body: unknown;
  try {
    body = await c.req.json();
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

  const { aud, sub, purpose, expires_in } = parsed.data;
  const keys = await resolveKeys();
  const now = Math.floor(Date.now() / 1000);
  const rid = crypto.randomUUID();

  // Build claims -- server sets everything except caller-provided fields
  const claims: Record<string, unknown> = {
    iss: ISSUER_URL,
    aud,
    iat: now,
    exp: now + expires_in,
    rid,
  };

  if (sub) claims.sub = sub;
  if (purpose) claims.purpose_declared = [purpose];

  // Sign
  const receipt = await sign(claims, keys.privateKey, keys.kid);

  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Cache-Control', 'no-store');
  return c.json({
    receipt,
    receipt_id: rid,
    issuer: ISSUER_URL,
    key_id: keys.kid,
    issued_at: now,
    expires_at: now + expires_in,
  });
}
