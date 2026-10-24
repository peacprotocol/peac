/**
 * JWKS entry validation through both JWKS-backed verification paths.
 *
 * Network fetches are mocked; the real resolver runs.
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { base64urlEncode, generateKeypair } from '@peac/crypto';
import { issueWire01 } from '../src/index.js';
import { verifyReceipt } from '../src/verify';
import { verifyReceiptCore } from '../src/verifier-core';
import { clearJWKSCache, clearKidThumbprints } from '../src/jwks-resolver';

vi.mock('../src/ssrf-safe-fetch.js', () => ({
  ssrfSafeFetch: vi.fn(),
  fetchJWKSSafe: vi.fn(),
}));
import { ssrfSafeFetch, fetchJWKSSafe } from '../src/ssrf-safe-fetch';
import type { SSRFFetchResult } from '../src/ssrf-safe-fetch';

const mockSsrfSafeFetch = vi.mocked(ssrfSafeFetch);
const mockFetchJWKSSafe = vi.mocked(fetchJWKSSafe);

const ISSUER = 'https://api.example.com';
const KID = 'key-2026-01';

function okResponse(body: string): SSRFFetchResult {
  return {
    ok: true,
    status: 200,
    body,
    rawBytes: new TextEncoder().encode(body),
    contentType: 'application/json',
  };
}

function serveKeys(keys: unknown[], revokedKids: string[] = []) {
  mockSsrfSafeFetch.mockResolvedValue(
    okResponse(
      JSON.stringify({
        version: 'peac-issuer/0.1',
        issuer: ISSUER,
        jwks_uri: `${ISSUER}/.well-known/jwks.json`,
        ...(revokedKids.length > 0 && {
          revoked_keys: revokedKids.map((kid) => ({ kid, revoked_at: '2026-01-15T00:00:00Z' })),
        }),
      })
    )
  );
  mockFetchJWKSSafe.mockResolvedValue(okResponse(JSON.stringify({ keys })));
}

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

beforeEach(() => {
  clearJWKSCache();
  clearKidThumbprints();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  mockSsrfSafeFetch.mockReset();
  mockFetchJWKSSafe.mockReset();
  clearJWKSCache();
  clearKidThumbprints();
});

describe('JWKS entry validation on verification paths', () => {
  it('verifyReceiptCore returns a structured failure for {"keys":[null]}', async () => {
    const { jws } = await setup();
    serveKeys([null]);

    const result = await verifyReceiptCore({ receipt: jws });
    expect(result.valid).toBe(false);
    expect(result.report.result.reason).toBe('key_not_found');
  });

  it('verifyReceipt returns unknown_key for {"keys":[null]}', async () => {
    const { jws } = await setup();
    serveKeys([null]);

    const result = await verifyReceipt(jws);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unknown_key');
    }
  });

  it('verifyReceiptCore does not use a matching entry that carries private key material', async () => {
    const { jwk, jws } = await setup();
    serveKeys([{ ...jwk, d: jwk.x }]);

    const result = await verifyReceiptCore({ receipt: jws });
    expect(result.valid).toBe(false);
    expect(result.report.result.reason).toBe('key_not_found');
  });

  it('verifyReceipt does not use a matching entry with use other than sig', async () => {
    const { jwk, jws } = await setup();
    serveKeys([{ ...jwk, use: 'enc' }]);

    const result = await verifyReceipt(jws);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unknown_key');
    }
  });

  it('both paths reject a kid listed in revoked_keys while the JWKS still lists it', async () => {
    const { jwk, jws } = await setup();
    serveKeys([jwk], [KID]);

    const core = await verifyReceiptCore({ receipt: jws });
    expect(core.valid).toBe(false);
    const check = core.report.checks.find((c) => c.id === 'key.resolve');
    expect(check?.error_code).toBe('E_REVOKED_KEY_USED');

    const legacy = await verifyReceipt(jws);
    expect(legacy.ok).toBe(false);
    if (!legacy.ok) {
      expect(legacy.reason).toBe('key_revoked');
    }
  });

  it('both paths accept the same receipt when the entry is valid', async () => {
    const { jwk, jws } = await setup();
    serveKeys([{ ...jwk, use: 'sig', alg: 'EdDSA' }]);

    const core = await verifyReceiptCore({ receipt: jws });
    expect(core.valid).toBe(true);

    const legacy = await verifyReceipt(jws);
    expect(legacy.ok).toBe(true);
  });
});
