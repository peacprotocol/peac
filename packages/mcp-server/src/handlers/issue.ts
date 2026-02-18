/**
 * Issue handler -- ZERO MCP SDK imports (DD-57)
 *
 * Signs and returns a PEAC receipt JWS (in-memory only, no side-effects).
 * Requires issuerKey + issuerId on ServerContext.
 */

import { issue, IssueError } from '@peac/protocol';
import type { IssueOptions } from '@peac/protocol';
import { decode, base64urlEncode } from '@peac/crypto';
import type { HandlerParams, HandlerResult } from './types.js';
import type { IssueInput } from '../schemas/issue.js';
import { McpServerError, sanitizeOutput } from '../infra/errors.js';
import { checkToolEnabled, truncateResponse } from './guards.js';

/**
 * Build Trust Gate 1 patterns from the actual loaded key.
 * Matches base64url-encoded private key bytes and public key bytes.
 */
function buildKeyPatterns(privateKey: Uint8Array, publicKey: Uint8Array): RegExp[] {
  const privB64 = base64urlEncode(privateKey);
  const pubB64 = base64urlEncode(publicKey);
  // Escape any regex-special chars in base64url strings (none expected, but defensive)
  const escPriv = privB64.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escPub = pubB64.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [new RegExp(escPriv, 'g'), new RegExp(escPub, 'g')];
}

export async function handleIssue(params: HandlerParams<IssueInput>): Promise<HandlerResult> {
  const { input, policy, context } = params;

  // Guard: tool enablement
  const disabledResult = checkToolEnabled('peac_issue', policy);
  if (disabledResult) return disabledResult;

  // Guard: issuer key + id must be configured
  if (!context.issuerKey || !context.issuerId) {
    return {
      text: 'Issue failed: server not configured with issuer key and ID (--issuer-key + --issuer-id)',
      structured: {
        ok: false,
        code: 'E_MCP_KEY_REQUIRED',
        message: 'Server requires --issuer-key and --issuer-id for peac_issue',
      },
      isError: true,
    };
  }

  // Guard: check claims byte size
  const inputJson = JSON.stringify(input);
  const inputBytes = new TextEncoder().encode(inputJson).length;
  if (inputBytes > policy.limits.max_claims_bytes) {
    return {
      text: `Input rejected: claims are ${inputBytes} bytes, exceeding limit of ${policy.limits.max_claims_bytes} bytes`,
      structured: {
        ok: false,
        code: 'E_MCP_INPUT_TOO_LARGE',
        message: `Claims input is ${inputBytes} bytes, limit is ${policy.limits.max_claims_bytes}`,
      },
      isError: true,
    };
  }

  // Guard: TTL cap enforcement
  if (input.ttl_seconds !== undefined && input.ttl_seconds > policy.limits.max_ttl_seconds) {
    return {
      text: `Input rejected: ttl_seconds ${input.ttl_seconds} exceeds max_ttl_seconds ${policy.limits.max_ttl_seconds}`,
      structured: {
        ok: false,
        code: 'E_MCP_INVALID_INPUT',
        message: `ttl_seconds ${input.ttl_seconds} exceeds policy max of ${policy.limits.max_ttl_seconds}`,
      },
      isError: true,
    };
  }

  // Build Trust Gate 1 patterns from actual key
  const keyPatterns = buildKeyPatterns(context.issuerKey.privateKey, context.issuerKey.publicKey);

  // Compute exp from ttl_seconds if provided
  const now = Math.floor(Date.now() / 1000);
  const exp = input.ttl_seconds !== undefined ? now + input.ttl_seconds : undefined;

  try {
    const result = await issue({
      iss: context.issuerId,
      aud: input.aud,
      amt: input.amt,
      cur: input.cur,
      rail: input.rail,
      reference: input.reference,
      asset: input.asset,
      env: input.env,
      network: input.network,
      evidence: input.evidence as IssueOptions['evidence'],
      subject: input.subject,
      exp,
      privateKey: context.issuerKey.privateKey,
      kid: context.issuerKey.kid,
    });

    // Decode JWS to extract claims summary
    const { payload } = decode<Record<string, unknown>>(result.jws);
    const claimsSummary = {
      iss: payload.iss as string,
      aud: payload.aud as string,
      iat: payload.iat as number,
      ...(payload.exp !== undefined ? { exp: payload.exp as number } : {}),
      rid: payload.rid as string,
      amt: payload.amt as number,
      cur: payload.cur as string,
    };

    // Trust Gate 1: scan output for key bytes
    const tr = truncateResponse(
      `Receipt issued: rid=${claimsSummary.rid}, ${claimsSummary.amt} ${claimsSummary.cur}`,
      policy
    );
    const safeText = sanitizeOutput(tr.text, keyPatterns);

    return {
      text: safeText,
      structured: {
        ok: true,
        jws: result.jws,
        claimsSummary,
      },
    };
  } catch (err) {
    // Sanitize error messages -- never expose key bytes
    const rawMessage = err instanceof Error ? err.message : String(err);
    const safeMessage = sanitizeOutput(rawMessage, keyPatterns);

    if (err instanceof IssueError) {
      return {
        text: `Issue failed: ${safeMessage}`,
        structured: {
          ok: false,
          code: 'E_MCP_ISSUE_FAILED',
          message: safeMessage,
        },
        isError: true,
      };
    }

    if (err instanceof McpServerError) {
      return {
        text: `Issue failed: ${safeMessage}`,
        structured: {
          ok: false,
          code: err.code,
          message: safeMessage,
        },
        isError: true,
      };
    }

    return {
      text: `Issue failed: ${safeMessage}`,
      structured: {
        ok: false,
        code: 'E_MCP_ISSUE_FAILED',
        message: safeMessage,
      },
      isError: true,
    };
  }
}
