/**
 * Inspect handler -- ZERO MCP SDK imports (DD-57)
 *
 * Decodes JWS (without verifying) and extracts metadata.
 * Respects policy redaction settings.
 */

import { decode } from '@peac/crypto';
import { parseReceiptClaims } from '@peac/schema';
import type { HandlerParams, HandlerResult } from './types.js';
import type { InspectInput } from '../schemas/inspect.js';
import { checkJwsSize, checkToolEnabled, truncateResponse } from './guards.js';

export async function handleInspect(params: HandlerParams<InspectInput>): Promise<HandlerResult> {
  const { input, policy } = params;

  // Guard: tool enablement
  const disabledResult = checkToolEnabled('peac_inspect', policy);
  if (disabledResult) return disabledResult;

  // Guard: JWS size limit
  const sizeResult = checkJwsSize(input.jws, policy);
  if (sizeResult) return sizeResult;

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    const decoded = decode<Record<string, unknown>>(input.jws);
    header = decoded.header as unknown as Record<string, unknown>;
    payload = decoded.payload;
  } catch (err) {
    return {
      text: `Inspect failed: ${err instanceof Error ? err.message : String(err)}`,
      structured: {
        error: err instanceof Error ? err.message : String(err),
        code: 'E_MCP_INVALID_INPUT',
      },
      isError: true,
    };
  }

  // Classify variant (don't throw on failure)
  let variant = 'unknown';
  try {
    const pr = parseReceiptClaims(payload);
    if (pr.ok) {
      variant = pr.variant;
    }
  } catch {
    // classification failure is non-fatal
  }

  const payloadMeta: Record<string, unknown> = {
    variant,
    issuer: payload.iss,
    audience: payload.aud,
  };

  if (typeof payload.iat === 'number') {
    payloadMeta.issuedAt = new Date(payload.iat * 1000).toISOString();
  }
  if (typeof payload.exp === 'number') {
    payloadMeta.expiresAt = new Date(payload.exp * 1000).toISOString();
  }
  if (typeof payload.rid === 'string') {
    payloadMeta.receiptId = payload.rid;
  }

  // Apply redaction
  let redacted = false;
  let fullPayload: Record<string, unknown> | undefined;

  // Gate: full_claims only honored when policy permits (inspect_full_claims)
  const effectiveFullClaims = input.full_claims && policy.redaction.inspect_full_claims;
  if (effectiveFullClaims) {
    fullPayload = { ...payload };

    if (policy.redaction.strip_evidence && 'evidence' in fullPayload) {
      fullPayload.evidence = '[REDACTED by policy]';
      redacted = true;
    }
    if (policy.redaction.strip_payment && 'payment' in fullPayload) {
      fullPayload.payment = '[REDACTED by policy]';
      redacted = true;
    }
  }

  const lines = [
    'WARNING: Signature NOT verified (use peac_verify to verify)',
    '',
    `Variant: ${variant}`,
    `Issuer: ${payload.iss ?? 'N/A'}`,
    `Audience: ${payload.aud ?? 'N/A'}`,
  ];

  if (payloadMeta.issuedAt) lines.push(`Issued At: ${payloadMeta.issuedAt}`);
  if (payloadMeta.expiresAt) lines.push(`Expires At: ${payloadMeta.expiresAt}`);
  if (payloadMeta.receiptId) lines.push(`Receipt ID: ${payloadMeta.receiptId}`);
  if (redacted) lines.push('', 'Note: Some fields redacted by policy');

  const tr = truncateResponse(lines.join('\n'), policy);
  return {
    text: tr.text,
    structured: {
      header,
      payloadMeta,
      ...(fullPayload !== undefined ? { fullPayload } : {}),
      redacted,
      verified: false,
      ...(tr.truncated
        ? {
            _truncation: {
              truncated: tr.truncated,
              originalBytes: tr.originalBytes,
              returnedBytes: tr.returnedBytes,
            },
          }
        : {}),
    },
  };
}
