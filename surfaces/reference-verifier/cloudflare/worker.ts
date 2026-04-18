/**
 * PEAC reference-verifier: Cloudflare Worker variant.
 *
 * Accepts POST /v1/verify with a JSON body of { receipt, public_key, options? }
 * and returns the deterministic DD-210 report (shape matches
 * `packages/schema/openapi/verify.yaml`). On failure, returns RFC 9457
 * Problem Details with `Content-Type: application/problem+json` and a
 * canonical `peac_error_code`.
 *
 * Callers must supply the verification key in the request body. Live issuer
 * discovery and JWKS resolution are out of scope for the edge variant;
 * operators who need live resolution should run the full reference verifier
 * (see `surfaces/reference-verifier/Dockerfile`).
 */

import { verifyLocal } from '@peac/protocol';
import { base64urlDecode } from '@peac/crypto';

interface VerifyRequest {
  receipt: string;
  public_key: string;
  options?: {
    issuer?: string;
    max_clock_skew?: number;
    strictness?: 'strict' | 'interop';
  };
}

const securityHeaders: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  Vary: 'PEAC-Receipt',
};

function problem(status: number, peacErrorCode: string, title: string, detail: string): Response {
  const body = {
    type: `https://www.peacprotocol.org/problems/${peacErrorCode}`,
    title,
    status,
    detail,
    peac_error_code: peacErrorCode,
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/problem+json',
      ...securityHeaders,
    },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...securityHeaders },
      });
    }

    if (url.pathname !== '/v1/verify' || request.method !== 'POST') {
      return problem(
        404,
        'E_NOT_FOUND',
        'Not Found',
        `${request.method} ${url.pathname} is not served by this Worker.`
      );
    }

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.startsWith('application/json')) {
      return problem(
        415,
        'E_UNSUPPORTED_MEDIA_TYPE',
        'Unsupported Media Type',
        'Request body must be application/json.'
      );
    }

    let body: VerifyRequest;
    try {
      body = await request.json();
    } catch {
      return problem(
        400,
        'E_INVALID_FORMAT',
        'Invalid request body',
        'Request body is not valid JSON.'
      );
    }

    if (typeof body?.receipt !== 'string' || body.receipt.length === 0) {
      return problem(
        400,
        'E_INVALID_FORMAT',
        'Missing receipt',
        'Request body must include `receipt` as a non-empty string.'
      );
    }
    if (typeof body?.public_key !== 'string' || body.public_key.length === 0) {
      return problem(
        400,
        'E_INVALID_FORMAT',
        'Missing public_key',
        'Request body must include `public_key` as a base64url-encoded Ed25519 public key. Live JWKS resolution is not available in the Worker variant.'
      );
    }

    let publicKey: Uint8Array;
    try {
      publicKey = base64urlDecode(body.public_key);
    } catch {
      return problem(
        400,
        'E_INVALID_FORMAT',
        'Invalid public_key',
        'public_key is not valid base64url.'
      );
    }

    const result = await verifyLocal(body.receipt, publicKey, {
      issuer: body.options?.issuer,
      maxClockSkew: body.options?.max_clock_skew,
      strictness: body.options?.strictness ?? 'strict',
    });

    if (!result.valid) {
      return problem(
        422,
        result.errorCode ?? 'E_VERIFICATION_FAILED',
        'Verification failure',
        result.errorDetail ?? 'Receipt failed verification.'
      );
    }

    return new Response(
      JSON.stringify({
        verified: true,
        receipt_ref: result.receiptRef,
        claims: result.claims,
        warnings: result.warnings ?? [],
        policy_binding: result.policyBinding ?? 'unavailable',
        issuer: result.claims?.iss,
        kid: result.kid,
        wire_version: result.wireVersion ?? '0.2',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'PEAC-Report-Id': crypto.randomUUID(),
          ...securityHeaders,
        },
      }
    );
  },
};
