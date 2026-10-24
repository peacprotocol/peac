/**
 * verifyReceiptCore(): issuer revoked_keys enforcement.
 *
 * A receipt whose kid appears in the issuer's revoked_keys is rejected on
 * every JWKS-backed path (discovery and pinned thumbprint with discovery),
 * even when the JWKS still lists the key.
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { base64urlEncode, computeJwkThumbprint, generateKeypair } from '@peac/crypto';
import { issueWire01 } from '../src/index.js';
import { verifyReceiptCore } from '../src/verifier-core';
import { createDefaultPolicy } from '../src/verifier-types';
import type { VerifierPolicy } from '../src/verifier-types';

vi.mock('../src/jwks-resolver.js', () => ({ resolveJWKS: vi.fn() }));
import { resolveJWKS } from '../src/jwks-resolver.js';
const resolveJWKSMock = vi.mocked(resolveJWKS);

afterEach(() => {
  resolveJWKSMock.mockReset();
});

const ISSUER = 'https://api.example.com';
const KID = 'key-2026-01';

async function setup() {
  const { privateKey, publicKey } = await generateKeypair();
  const jwk = { kty: 'OKP', crv: 'Ed25519', x: base64urlEncode(publicKey), kid: KID };
  const { jws } = await issueWire01({
    iss: ISSUER,
    aud: 'https://client.example.com',
    amt: 1000,
    cur: 'USD',
    rail: 'x402',
    reference: 'tx_abc123',
    asset: 'USD',
    env: 'test',
    evidence: {},
    privateKey,
    kid: KID,
  });
  return { jwk, jws };
}

function resolved(
  jwk: unknown,
  revokedKeys?: { kid: string; revoked_at: string; reason?: string }[]
) {
  return {
    ok: true as const,
    fromCache: false,
    jwks: { keys: [jwk] },
    ...(revokedKeys && { revokedKeys }),
  } as Awaited<ReturnType<typeof resolveJWKS>>;
}

async function pinnedPolicy(jwk: Record<string, string>): Promise<VerifierPolicy> {
  return {
    ...createDefaultPolicy('network_allowed'),
    pinned_keys: [
      { issuer: ISSUER, kid: KID, jwk_thumbprint_sha256: await computeJwkThumbprint(jwk) },
    ],
  };
}

const REVOKED = [{ kid: KID, revoked_at: '2026-01-15T00:00:00Z', reason: 'key_compromise' }];

describe('verifyReceiptCore(): revoked keys', () => {
  it('accepts a receipt when the kid is not revoked (discovery)', async () => {
    const { jwk, jws } = await setup();
    resolveJWKSMock.mockResolvedValue(
      resolved(jwk, [{ kid: 'other-key', revoked_at: '2026-01-15T00:00:00Z' }])
    );

    const result = await verifyReceiptCore({ receipt: jws });
    expect(result.valid).toBe(true);
  });

  it('rejects a receipt signed with a revoked kid (discovery)', async () => {
    const { jwk, jws } = await setup();
    resolveJWKSMock.mockResolvedValue(resolved(jwk, REVOKED));

    const result = await verifyReceiptCore({ receipt: jws });
    expect(result.valid).toBe(false);
    expect(result.report.result.reason).toBe('key_not_found');
    const check = result.report.checks.find((c) => c.id === 'key.resolve');
    expect(check?.status).toBe('fail');
    expect(check?.error_code).toBe('E_REVOKED_KEY_USED');
    expect(check?.detail).toMatchObject({ kid: KID, revoked_at: '2026-01-15T00:00:00Z' });
    expect(result.report.checks.find((c) => c.id === 'jws.signature')?.status).toBe('skip');
  });

  it('accepts a receipt when the kid is not revoked (pinned thumbprint)', async () => {
    const { jwk, jws } = await setup();
    resolveJWKSMock.mockResolvedValue(resolved(jwk));

    const result = await verifyReceiptCore({
      receipt: jws,
      policy: await pinnedPolicy(jwk),
    });
    expect(result.valid).toBe(true);
  });

  it('rejects a receipt signed with a revoked kid (pinned thumbprint)', async () => {
    const { jwk, jws } = await setup();
    resolveJWKSMock.mockResolvedValue(resolved(jwk, REVOKED));

    const result = await verifyReceiptCore({
      receipt: jws,
      policy: await pinnedPolicy(jwk),
    });
    expect(result.valid).toBe(false);
    expect(result.report.result.reason).toBe('key_not_found');
    const check = result.report.checks.find((c) => c.id === 'key.resolve');
    expect(check?.status).toBe('fail');
    expect(check?.error_code).toBe('E_REVOKED_KEY_USED');
  });
});
