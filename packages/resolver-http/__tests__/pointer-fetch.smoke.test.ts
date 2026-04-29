// pointer-fetch smoke: happy path + clean digest mismatch.

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { sha256Hex } from '@peac/crypto';

import {
  mockSafeFetchJson,
  mockSafeFetchJWKS,
  mockSafeFetchRaw,
  enqueue,
  resetMock,
} from './_helpers/mock-net-node.js';

vi.mock('@peac/net-node', async () => {
  const actual = await vi.importActual<typeof import('@peac/net-node')>('@peac/net-node');
  return {
    ...actual,
    safeFetchJson: mockSafeFetchJson,
    safeFetchJWKS: mockSafeFetchJWKS,
    safeFetchRaw: mockSafeFetchRaw,
  };
});

import { fetchPointerWithDigest } from '../src/pointer-fetch.js';

beforeEach(() => {
  resetMock();
});

const VALID_JWS = 'aGVhZGVy.cGF5bG9hZA.c2lnbmF0dXJl';

describe('pointer-fetch smoke', () => {
  it('happy-path returns receipt + actualDigest matching expected', async () => {
    const expected = await sha256Hex(VALID_JWS);
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: VALID_JWS,
    });
    const result = await fetchPointerWithDigest('https://issuer.example.com/receipt', expected);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.receipt).toBe(VALID_JWS);
      expect(result.actualDigest).toBe(expected);
      expect(result.expectedDigest).toBe(expected);
      expect(result.contentType).toBe('application/jose');
      expect(result.contentTypeWarning).toBeUndefined();
    }
  });

  it('digest mismatch surfaces pointer_digest_mismatch with both digests', async () => {
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: VALID_JWS,
    });
    const wrong = '0'.repeat(64);
    const result = await fetchPointerWithDigest('https://issuer.example.com/receipt', wrong);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('pointer_digest_mismatch');
      expect(result.actualDigest).toBe(await sha256Hex(VALID_JWS));
      expect(result.expectedDigest).toBe(wrong);
    }
  });

  it('invalid expected-digest format (not 64 lowercase hex) surfaces pointer_fetch_blocked', async () => {
    const result = await fetchPointerWithDigest(
      'https://issuer.example.com/receipt',
      'not a digest'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('pointer_fetch_blocked');
  });
});
