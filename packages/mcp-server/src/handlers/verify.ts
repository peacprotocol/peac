/**
 * Verify handler -- ZERO MCP SDK imports (DD-57)
 *
 * Resolves key from input or context, delegates to verifyLocal.
 *
 * Append-only check name registry (stable contract):
 *   signature, schema, expiry, issuer_binding, audience_binding
 */

import { verifyLocal } from '@peac/protocol';
import { base64urlDecode, decode } from '@peac/crypto';
import type { HandlerParams, HandlerResult } from './types.js';
import type { VerifyInput } from '../schemas/verify.js';
import { resolveKeyByKid } from '../infra/jwks-loader.js';
import { checkJwsSize, checkToolEnabled, truncateResponse } from './guards.js';

function resolvePublicKey(params: HandlerParams<VerifyInput>): {
  publicKey: Uint8Array;
  keySource: string;
} {
  const { input, context } = params;

  // Priority 1: inline public key
  if (input.public_key_base64url) {
    return {
      publicKey: base64urlDecode(input.public_key_base64url),
      keySource: 'inline',
    };
  }

  // Priority 2: inline JWKS
  if (input.jwks) {
    const jwks = JSON.parse(input.jwks) as { keys?: Array<Record<string, unknown>> };
    if (!jwks.keys?.length) {
      throw new Error('Provided JWKS contains no keys');
    }

    const { header } = decode(input.jws);
    const kid = header.kid;

    // Collect Ed25519 keys (reject non-EdDSA alg values)
    const ed25519Keys = jwks.keys.filter(
      (k) =>
        k.kty === 'OKP' &&
        k.crv === 'Ed25519' &&
        typeof k.x === 'string' &&
        (k.alg === undefined || k.alg === 'EdDSA')
    );

    if (ed25519Keys.length === 0) {
      throw new Error('Provided JWKS contains no Ed25519 keys');
    }

    // If kid present, match by kid
    if (kid) {
      const matched = ed25519Keys.find((k) => k.kid === kid);
      if (matched) {
        return {
          publicKey: base64urlDecode(matched.x as string),
          keySource: 'inline-jwks',
        };
      }
      throw Object.assign(
        new Error(`No matching Ed25519 key found in provided JWKS for kid="${kid}"`),
        { errorCode: 'E_MCP_JWKS_NO_MATCH' as const }
      );
    }

    // No kid: single-key fallback
    if (ed25519Keys.length === 1) {
      return {
        publicKey: base64urlDecode(ed25519Keys[0].x as string),
        keySource: 'inline-jwks',
      };
    }

    throw Object.assign(
      new Error(
        `JWS has no kid and JWKS contains ${ed25519Keys.length} Ed25519 keys -- provide kid to select`
      ),
      { errorCode: 'E_MCP_KID_REQUIRED' as const }
    );
  }

  // Priority 3: server-configured JWKS
  if (context.jwksKeys?.length) {
    const { header } = decode(input.jws);
    const kid = header.kid;

    if (kid) {
      const key = resolveKeyByKid(context.jwksKeys, kid);
      if (key) {
        return { publicKey: key, keySource: 'server-jwks' };
      }
      throw Object.assign(new Error(`No matching key in server JWKS for kid="${kid}"`), {
        errorCode: 'E_MCP_JWKS_NO_MATCH' as const,
      });
    }

    // No kid: single-key fallback
    if (context.jwksKeys.length === 1) {
      return { publicKey: context.jwksKeys[0].publicKey, keySource: 'server-jwks' };
    }

    throw Object.assign(
      new Error(
        `JWS has no kid and server JWKS contains ${context.jwksKeys.length} keys -- provide kid to select`
      ),
      { errorCode: 'E_MCP_KID_REQUIRED' as const }
    );
  }

  throw Object.assign(
    new Error(
      'No public key available: provide public_key_base64url, jwks, or configure --jwks-file'
    ),
    { errorCode: 'E_MCP_KEY_RESOLUTION' as const }
  );
}

export async function handleVerify(params: HandlerParams<VerifyInput>): Promise<HandlerResult> {
  const { input, policy } = params;

  // Guard: tool enablement
  const disabledResult = checkToolEnabled('peac_verify', policy);
  if (disabledResult) return disabledResult;

  // Guard: JWS size limit
  const sizeResult = checkJwsSize(input.jws, policy);
  if (sizeResult) return sizeResult;

  let publicKey: Uint8Array;
  let keySource: string;
  try {
    const resolved = resolvePublicKey(params);
    publicKey = resolved.publicKey;
    keySource = resolved.keySource;
  } catch (err) {
    const code =
      ((err as Record<string, unknown>).errorCode as string | undefined) ?? 'E_MCP_KEY_RESOLUTION';
    return {
      text: `Verification failed: ${err instanceof Error ? err.message : String(err)}`,
      structured: {
        ok: false,
        code,
        message: err instanceof Error ? err.message : String(err),
        checks: [],
      },
      isError: true,
    };
  }

  const result = await verifyLocal(input.jws, publicKey, {
    issuer: input.issuer,
    audience: input.audience,
  });

  if (result.valid) {
    const checks = [
      { name: 'signature', passed: true },
      { name: 'schema', passed: true },
      { name: 'expiry', passed: true },
    ];

    if (input.issuer) {
      checks.push({ name: 'issuer_binding', passed: true });
    }
    if (input.audience) {
      checks.push({ name: 'audience_binding', passed: true });
    }

    const claims = result.claims as Record<string, unknown>;
    const claimsSummary: Record<string, unknown> = {
      iss: claims.iss,
      kind: claims.kind,
      type: claims.type,
      jti: claims.jti,
      ...(claims.sub !== undefined && { sub: claims.sub }),
      variant: result.variant,
      wireVersion: result.wireVersion,
    };

    const tr = truncateResponse(
      `Verification PASSED (${result.variant} receipt, kind=${claims.kind ?? 'unknown'}, kid=${result.kid})`,
      policy
    );
    return {
      text: tr.text,
      structured: {
        ok: true,
        variant: result.variant,
        checks,
        claimsSummary,
        keySource,
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

  // Failure case
  const checks: Array<{ name: string; passed: boolean; message?: string }> = [];
  if (result.code === 'E_INVALID_SIGNATURE') {
    checks.push({ name: 'signature', passed: false, message: result.message });
  } else if (result.code === 'E_INVALID_FORMAT') {
    checks.push({ name: 'signature', passed: true });
    checks.push({ name: 'schema', passed: false, message: result.message });
  } else if (result.code === 'E_EXPIRED') {
    checks.push({ name: 'signature', passed: true });
    checks.push({ name: 'schema', passed: true });
    checks.push({ name: 'expiry', passed: false, message: result.message });
  } else if (result.code === 'E_INVALID_ISSUER') {
    checks.push({ name: 'signature', passed: true });
    checks.push({ name: 'schema', passed: true });
    checks.push({ name: 'issuer_binding', passed: false, message: result.message });
  } else if (result.code === 'E_INVALID_AUDIENCE') {
    checks.push({ name: 'signature', passed: true });
    checks.push({ name: 'schema', passed: true });
    checks.push({ name: 'audience_binding', passed: false, message: result.message });
  } else {
    checks.push({ name: result.code, passed: false, message: result.message });
  }

  const trFail = truncateResponse(
    `Verification FAILED: ${result.code} -- ${result.message}`,
    policy
  );
  return {
    text: trFail.text,
    structured: {
      ok: false,
      code: result.code,
      message: result.message,
      checks,
      keySource,
      ...(trFail.truncated
        ? {
            _truncation: {
              truncated: trFail.truncated,
              originalBytes: trFail.originalBytes,
              returnedBytes: trFail.returnedBytes,
            },
          }
        : {}),
    },
  };
}
