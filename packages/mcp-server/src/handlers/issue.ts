/**
 * Issue handler -- Wire 0.2 only, ZERO MCP SDK imports (DD-57)
 *
 * Signs and returns a Wire 0.2 PEAC receipt JWS (in-memory only, no side-effects).
 * Requires issuerKey + issuerId on ServerContext.
 */

import { issueWire02, IssueError } from '@peac/protocol';
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

  // Build Trust Gate 1 patterns from actual key
  const keyPatterns = buildKeyPatterns(context.issuerKey.privateKey, context.issuerKey.publicKey);

  try {
    // Build policy block: PolicyBlock requires digest (non-optional per kernel type).
    // If caller provides policy without digest, return a clear error rather than
    // silently discarding the policy metadata.
    if (input.policy && !input.policy.digest) {
      return {
        text: 'Issue failed: policy.digest is required when policy block is provided',
        structured: {
          ok: false,
          code: 'E_MCP_ISSUE_FAILED',
          message:
            'policy.digest is required when policy block is provided (uri/version alone is insufficient for binding)',
        },
        isError: true,
      };
    }
    const policyBlock = input.policy?.digest
      ? { digest: input.policy.digest, uri: input.policy.uri, version: input.policy.version }
      : undefined;

    const result = await issueWire02({
      iss: context.issuerId,
      kind: input.kind,
      type: input.type,
      sub: input.sub,
      pillars: input.pillars,
      occurred_at: input.occurred_at,
      extensions: input.extensions,
      policy: policyBlock,
      privateKey: context.issuerKey.privateKey,
      kid: context.issuerKey.kid,
    });

    // Decode JWS to extract claims summary
    const { payload } = decode<Record<string, unknown>>(result.jws);
    const claimsSummary = {
      iss: payload.iss as string,
      kind: payload.kind as string,
      type: payload.type as string,
      iat: payload.iat as number,
      jti: payload.jti as string,
      ...(payload.sub !== undefined ? { sub: payload.sub as string } : {}),
      ...(payload.pillars !== undefined ? { pillars: payload.pillars as string[] } : {}),
    };

    // Trust Gate 1: scan output for key bytes
    const tr = truncateResponse(
      `Receipt issued: jti=${claimsSummary.jti}, kind=${claimsSummary.kind}, type=${claimsSummary.type}`,
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
